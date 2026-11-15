#!/usr/bin/env node
/**
 * Generates NEX's introduction with Azure AI Speech (REST, no SDK, no dependency). Run by hand only
 * after Alex has approved it: it makes one billable request per sample.
 *
 * Usage (the key and region come from the environment, never from a file in the repository):
 *   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=uksouth node scripts/voice/synthesise.mjs samples
 *   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=uksouth node scripts/voice/synthesise.mjs final en-GB-RyanNeural [style]
 *
 * "samples" writes the shortlist to docs/references/voice-samples/ (Git-ignored; private
 * auditions, never published). "final" writes public/audio/nex-intro.mp3 (24 kHz, 48 kbit/s mono
 * MP3, ≈ 60 KB) and must be generated with a paid Standard (S0) resource: the Azure Product Terms
 * permit commercial use of prebuilt neural voice output for paid-tier customers only, so audio from
 * the Free (F0) tier is for private auditions. "final" therefore also requires
 * AZURE_SPEECH_TIER=S0, set deliberately, as the confirmation that the key is a Standard resource's.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
if (!key || !region) {
  console.error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (e.g. uksouth) in this shell first.");
  process.exit(1);
}
const template = await readFile(join(here, "nex-intro.ssml.xml"), "utf8");
const ssml = (voice, style) =>
  template
    .replace(/<!--[\s\S]*?-->\s*/, "")
    .replace("{{VOICE}}", voice)
    .replace("{{STYLE_OPEN}}", style ? `<mstts:express-as style="${style}">` : "")
    .replace("{{STYLE_CLOSE}}", style ? "</mstts:express-as>" : "");

async function synthesise(voice, style, out) {
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "moylan-os-voice-script",
    },
    body: ssml(voice, style),
  });
  if (!response.ok)
    throw new Error(`${voice}${style ? ` (${style})` : ""}: HTTP ${response.status}`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(await response.arrayBuffer()));
  console.log(`wrote ${out}`);
}

const [mode, voice, style] = process.argv.slice(2);
if (mode === "samples") {
  const dir = join(root, "docs", "references", "voice-samples");
  await synthesise("en-GB-RyanNeural", null, join(dir, "ryan.mp3"));
  await synthesise("en-GB-RyanNeural", "chat", join(dir, "ryan-chat.mp3"));
  await synthesise("en-GB-ThomasNeural", null, join(dir, "thomas.mp3"));
} else if (mode === "final" && voice) {
  if (process.env.AZURE_SPEECH_TIER !== "S0") {
    console.error(
      "The published recording must come from a paid Standard (S0) resource (Azure Product Terms).\n" +
        "Use an S0 resource's key and set AZURE_SPEECH_TIER=S0 to confirm.",
    );
    process.exit(1);
  }
  await synthesise(voice, style ?? null, join(root, "public", "audio", "nex-intro.mp3"));
  console.log('Now set src: "/audio/nex-intro.mp3" in src/content/voice.ts.');
} else {
  console.error("Usage: synthesise.mjs samples | final <voice> [style]");
  process.exit(1);
}
