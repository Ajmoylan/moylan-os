/**
 * The Azure AI Speech request behind scripts/voice/synthesise.mjs, as small pure functions that can
 * be tested without a network (scripts/voice/speech.test.mjs). Nothing here reads the environment or
 * makes a request on import.
 *
 * Every input is treated as untrusted, even though they come from the repository, the command line
 * and the operator's environment:
 * - the SSML document starts at its root element (the template's notes are never sent), and the
 *   voice and style are validated against Azure's naming and XML-escaped;
 * - the endpoint is built only from a validated region, over HTTPS, and redirects are refused, so the
 *   subscription key can only ever reach `<region>.tts.speech.microsoft.com`;
 * - a response is read only up to 2 MB, written only if it is an MP3 of a plausible size, and
 *   atomically, never through a linked folder, so a failed or unexpected response never leaves a
 *   partial or non-audio file in public/ (or anywhere else).
 */
import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Azure region names: lower-case letters and digits, e.g. uksouth, westeurope, eastus2. */
const REGION = /^[a-z][a-z0-9]{1,30}$/;
/** Prebuilt neural voice names, e.g. en-GB-RyanNeural, zh-CN-shaanxi-XiaoniNeural. */
const VOICE = /^[a-z]{2,3}-[A-Z]{2,3}(?:-[a-z]+)?-[A-Za-z0-9]{1,40}Neural$/;
/** Speaking styles, e.g. chat, cheerful, narration-professional. */
const STYLE = /^[a-z]{1,30}(?:-[a-z]{1,30}){0,3}$/;

/** NEX's introduction is ≈ 60 KB; anything far outside this range is not his recording. */
export const MIN_AUDIO_BYTES = 1024;
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
/** Escapes text for an XML attribute or text node (every special character, globally). */
export const escapeXml = (text) => text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

/** Replaces the single occurrence of `placeholder`; anything else is a broken template. */
function fill(text, placeholder, value) {
  const parts = text.split(placeholder);
  if (parts.length !== 2) throw new Error(`The SSML template must contain ${placeholder} once.`);
  return parts.join(value);
}

/**
 * Where the document's root element starts. Only notes (complete comments) and whitespace may come
 * before `<speak>`; each note is skipped whole, so text inside one (even "<speak>") is never taken
 * for the root element. Anything else before it is refused.
 */
function rootStart(template) {
  let i = 0;
  for (;;) {
    while (i < template.length && /\s/.test(template[i])) i++;
    if (template.startsWith("<!--", i)) {
      const end = template.indexOf("-->", i + 4);
      if (end < 0) throw new Error("The SSML template has an unterminated note.");
      i = end + 3;
    } else if (/^<speak[\s>]/.test(template.slice(i, i + 7))) {
      return i;
    } else {
      throw new Error("The SSML template has no <speak> element after its notes.");
    }
  }
}

/**
 * The SSML document for a voice and optional speaking style. The template's notes (comments before
 * `<speak>`) are dropped by starting the document at its root element, not by pattern-matching
 * markup; a comment anywhere inside the document is refused rather than sanitised.
 */
export function buildSsml(template, voice, style = null) {
  if (typeof voice !== "string" || !VOICE.test(voice)) {
    throw new Error(`Not an Azure neural voice name: ${JSON.stringify(voice)}`);
  }
  if (style !== null && (typeof style !== "string" || !STYLE.test(style))) {
    throw new Error(`Not an Azure speaking style: ${JSON.stringify(style)}`);
  }
  const document = template.slice(rootStart(template));
  if (document.includes("<!--") || document.includes("-->")) {
    throw new Error("The SSML template may have notes only before <speak>, not inside it.");
  }
  const ssml = fill(
    fill(
      fill(document, "{{VOICE}}", escapeXml(voice)),
      "{{STYLE_OPEN}}",
      style ? `<mstts:express-as style="${escapeXml(style)}">` : "",
    ),
    "{{STYLE_CLOSE}}",
    style ? "</mstts:express-as>" : "",
  );
  if (ssml.includes("{{")) throw new Error("The SSML template has an unknown placeholder.");
  return ssml;
}

/** The text-to-speech endpoint for a region: always HTTPS on Azure's speech host. */
export function speechEndpoint(region) {
  if (typeof region !== "string" || !REGION.test(region)) {
    throw new Error("AZURE_SPEECH_REGION must be an Azure region name, e.g. uksouth.");
  }
  const host = `${region}.tts.speech.microsoft.com`;
  const url = new URL(`https://${host}/cognitiveservices/v1`);
  if (url.protocol !== "https:" || url.hostname !== host) {
    throw new Error("Refusing a speech endpoint outside tts.speech.microsoft.com.");
  }
  return url;
}

/**
 * Checks a response body before it is written: Azure's MP3 output (`audio/mpeg`), of a plausible
 * size, starting with an MP3 frame or an ID3 tag. An error page or anything else is refused.
 */
export function checkAudio(contentType, bytes) {
  if (!/^audio\/mpeg(?:;|$)/i.test(contentType ?? "")) {
    throw new Error(`Expected audio/mpeg from Azure, got ${JSON.stringify(contentType)}.`);
  }
  if (bytes.length < MIN_AUDIO_BYTES || bytes.length > MAX_AUDIO_BYTES) {
    throw new Error(`Unexpected audio size: ${bytes.length} bytes.`);
  }
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (!id3 && !frame) throw new Error("The response is not an MP3 stream.");
}

/**
 * Reads a response body, stopping (and cancelling the transfer) as soon as it passes `limit` bytes,
 * so an oversized or endless response never fills memory, whatever its headers say.
 */
export async function readCapped(response, limit = MAX_AUDIO_BYTES) {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`Unexpected audio size: more than ${limit} bytes.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Requests one recording and returns its checked bytes. `request` is the fetch function (tests pass
 * a stub, so they never reach Azure). One billable request per call.
 */
export async function requestSpeech({ region, key, ssml, request = fetch }) {
  if (typeof key !== "string" || key.length === 0) throw new Error("AZURE_SPEECH_KEY is not set.");
  const response = await request(speechEndpoint(region), {
    method: "POST",
    // The key is a custom header, which fetch would forward on a redirect: never follow one.
    redirect: "error",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "moylan-os-voice-script",
    },
    body: ssml,
  });
  if (!response.ok) throw new Error(`Azure AI Speech returned HTTP ${response.status}.`);
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_AUDIO_BYTES) throw new Error(`Unexpected audio size: ${declared} bytes.`);
  const bytes = await readCapped(response);
  checkAudio(response.headers.get("content-type"), bytes);
  return bytes;
}

/** Whether `path` is strictly inside `dir` (by its text: `..` and absolute escapes are refused). */
function within(dir, path) {
  const rel = relative(resolve(dir), resolve(path));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Refuses a symbolic link at any folder between `root` and `dir` (inclusive): a linked
 * `public/audio` (a link can be committed) would otherwise send the write somewhere else. Folders
 * that don't exist yet are fine (they are created as real folders).
 */
async function refuseLinkedFolders(root, dir) {
  const parts = relative(resolve(root), resolve(dir)).split(sep).filter(Boolean);
  let path = resolve(root);
  for (const part of parts) {
    path = join(path, part);
    let stat;
    try {
      stat = await lstat(path);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink())
      throw new Error(`Refusing to write audio through a linked folder: ${path}`);
    if (!stat.isDirectory()) throw new Error(`Not a folder: ${path}`);
  }
}

/**
 * Writes `bytes` to `out`, which must be inside one of `dirs` (each inside `root`, the repository),
 * with no linked folder on the way, checked by text, by each folder's type and, once the folder
 * exists, by its real path. It is written first to a new temporary file beside it (created
 * exclusively, so an existing file or link there is never written through), then renamed over `out`
 * in one step. On failure the temporary file is removed.
 */
export async function writeAudioAtomically(out, bytes, { root, dirs }) {
  const target = resolve(out);
  if (!dirs.every((dir) => within(root, dir)) || !dirs.some((dir) => within(dir, target))) {
    throw new Error(`Refusing to write audio outside its directories: ${out}`);
  }
  const dir = dirname(target);
  await refuseLinkedFolders(root, dir);
  await mkdir(dir, { recursive: true });
  // The folder must resolve exactly where its path says (no link appeared on the way meanwhile).
  if ((await realpath(dir)) !== join(await realpath(root), relative(resolve(root), dir))) {
    throw new Error(`Refusing to write audio through a linked folder: ${dir}`);
  }
  const temporary = join(dir, `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o644 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
