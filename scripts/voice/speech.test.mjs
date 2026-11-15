// @vitest-environment jsdom
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_AUDIO_BYTES,
  buildSsml,
  readCapped,
  checkAudio,
  escapeXml,
  requestSpeech,
  speechEndpoint,
  writeAudioAtomically,
} from "./speech.mjs";

/**
 * The Azure speech script's request and output handling (CodeQL review). Entirely offline: the
 * request function is a stub, so no test ever reaches Azure or incurs a charge.
 */

// Vitest runs from the repository root (jsdom's import.meta.url is not a file URL).
const template = await readFile(join(process.cwd(), "scripts/voice/nex-intro.ssml.xml"), "utf8");
/** A minimal MP3: an MPEG-1 Layer III frame header, padded to a plausible size. */
const mp3 = (size = 4096) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xfb, 0x90, 0x64]);
  return bytes;
};
const id3 = (size = 4096) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x49, 0x44, 0x33, 0x04]);
  return bytes;
};
const wellFormed = (xml) =>
  new globalThis.DOMParser()
    .parseFromString(xml, "application/xml")
    .getElementsByTagName("parsererror").length === 0;

describe("buildSsml: the document sent to Azure", () => {
  it("starts at <speak> (the template's notes are never sent) and is well-formed XML", () => {
    const ssml = buildSsml(template, "en-GB-RyanNeural");
    expect(ssml.startsWith("<speak")).toBe(true);
    expect(ssml).not.toContain("<!--");
    expect(ssml).not.toContain("{{");
    expect(ssml).toContain('<voice name="en-GB-RyanNeural">');
    expect(wellFormed(ssml)).toBe(true);
    const styled = buildSsml(template, "en-GB-RyanNeural", "chat");
    expect(styled).toContain('<mstts:express-as style="chat">');
    expect(wellFormed(styled)).toBe(true);
  });

  it("drops whole notes before <speak>, and refuses malformed ones (no pattern sanitising)", () => {
    const root = template.slice(template.indexOf("<speak"));
    // Several notes: a single non-global comment replacement left the second one in place.
    for (const notes of ["<!--a--><!--b-->", "<!-- x --> <!-- y -->"]) {
      const ssml = buildSsml(`${notes}\n${root}`, "en-GB-RyanNeural");
      expect(ssml.startsWith("<speak")).toBe(true);
      expect(ssml).not.toContain("<!");
    }
    // Malformed notes are refused rather than partly stripped.
    expect(() => buildSsml(`<!<!---->--\n${root}`, "en-GB-RyanNeural")).toThrow(/after its notes/);
    expect(() => buildSsml(`<!--\n${root}`, "en-GB-RyanNeural")).toThrow(/unterminated/);
  });

  it("refuses a comment inside the document, or a missing, repeated or unknown placeholder", () => {
    const body = template.slice(template.indexOf("<speak"));
    expect(() =>
      buildSsml(body.replace("<prosody", "<!-- x --><prosody"), "en-GB-RyanNeural"),
    ).toThrow(/only before <speak>/);
    expect(() => buildSsml(body.replace("{{VOICE}}", "x"), "en-GB-RyanNeural")).toThrow(
      /\{\{VOICE\}\} once/,
    );
    expect(() =>
      buildSsml(body.replace("{{VOICE}}", "{{VOICE}}{{VOICE}}"), "en-GB-RyanNeural"),
    ).toThrow(/once/);
    expect(() => buildSsml(`${body}{{EXTRA}}`, "en-GB-RyanNeural")).toThrow(/unknown placeholder/);
    expect(() => buildSsml("<!-- notes only -->", "en-GB-RyanNeural")).toThrow(/no <speak>/);
  });

  it("refuses voice and style values that could change the document (XML injection)", () => {
    for (const voice of [
      'en-GB-RyanNeural"><audio src="https://example.com/x.mp3"/><voice name="en-GB-RyanNeural',
      "en-GB-Ryan<Neural",
      "RyanNeural",
      "",
      null,
    ]) {
      expect(() => buildSsml(template, voice)).toThrow(/voice name/);
    }
    for (const style of ['chat"><break time="9s"/>', "chat style", "Chat", "x".repeat(40)]) {
      expect(() => buildSsml(template, "en-GB-RyanNeural", style)).toThrow(/speaking style/);
    }
    expect(buildSsml(template, "zh-CN-shaanxi-XiaoniNeural", "narration-professional")).toContain(
      'style="narration-professional"',
    );
  });

  it("escapes every XML special character", () => {
    expect(escapeXml(`a&b<c>d"e'f&amp;`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f&amp;amp;");
  });
});

describe("speechEndpoint: where the key and the SSML may go", () => {
  it("is always HTTPS on the region's Azure speech host", () => {
    for (const region of ["uksouth", "westeurope", "eastus2"]) {
      const url = speechEndpoint(region);
      expect(url.href).toBe(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`);
    }
  });

  it("refuses region values that would send the key to another host", () => {
    for (const region of [
      "evil.example/x?",
      "evil.example#",
      "uksouth.evil",
      "user:pass@evil.example/",
      "UKSOUTH",
      "uk south",
      "",
      "u",
      undefined,
    ]) {
      expect(() => speechEndpoint(region)).toThrow(/region name/);
    }
  });
});

describe("requestSpeech (stubbed: never reaches Azure)", () => {
  const ok = (body, type = "audio/mpeg") =>
    new Response(body, { status: 200, headers: { "content-type": type } });

  it("posts the SSML to the region's endpoint, refusing redirects, and returns checked audio", async () => {
    const request = vi.fn(async () => ok(mp3()));
    const bytes = await requestSpeech({
      region: "uksouth",
      key: "test-key",
      ssml: "<speak/>",
      request,
    });
    expect(bytes).toHaveLength(4096);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe("https://uksouth.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(init.redirect).toBe("error");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("<speak/>");
    expect(init.headers["Ocp-Apim-Subscription-Key"]).toBe("test-key");
  });

  it("makes no request with a malformed region or without a key", async () => {
    const request = vi.fn();
    await expect(
      requestSpeech({ region: "evil.example/x?", key: "k", ssml: "<speak/>", request }),
    ).rejects.toThrow(/region name/);
    await expect(
      requestSpeech({ region: "uksouth", key: "", ssml: "<speak/>", request }),
    ).rejects.toThrow(/AZURE_SPEECH_KEY/);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses an error status, a non-audio response, a non-MP3 body or an oversized one", async () => {
    const run = (response) =>
      requestSpeech({
        region: "uksouth",
        key: "k",
        ssml: "<speak/>",
        request: async () => response,
      });
    await expect(run(new Response("nope", { status: 401 }))).rejects.toThrow(/HTTP 401/);
    await expect(run(ok("<html>error</html>".padEnd(4096), "text/html"))).rejects.toThrow(
      /audio\/mpeg/,
    );
    await expect(run(ok(new Uint8Array(4096)))).rejects.toThrow(/not an MP3/);
    await expect(
      run(
        new Response(mp3(), {
          headers: { "content-type": "audio/mpeg", "content-length": String(MAX_AUDIO_BYTES + 1) },
        }),
      ),
    ).rejects.toThrow(/size/);
  });
});

describe("checkAudio", () => {
  it("accepts MP3 frames or an ID3 tag with audio/mpeg", () => {
    expect(() => checkAudio("audio/mpeg", mp3())).not.toThrow();
    expect(() => checkAudio("audio/mpeg; charset=binary", id3())).not.toThrow();
  });

  it("refuses other types, other content and implausible sizes", () => {
    expect(() => checkAudio("application/json", mp3())).toThrow(/audio\/mpeg/);
    expect(() => checkAudio("audio/mpegx", mp3())).toThrow(/audio\/mpeg/);
    expect(() => checkAudio(null, mp3())).toThrow(/audio\/mpeg/);
    expect(() => checkAudio("audio/mpeg", new TextEncoder().encode("{}".padEnd(4096)))).toThrow(
      /not an MP3/,
    );
    expect(() => checkAudio("audio/mpeg", mp3(100))).toThrow(/size/);
    expect(() => checkAudio("audio/mpeg", mp3(MAX_AUDIO_BYTES + 1))).toThrow(/size/);
  });
});

describe("writeAudioAtomically", () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "nex-voice-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  /** The repository (`root`) and the one folder audio may be written to. */
  const audioDirs = () => ({ root: dir, dirs: [join(dir, "audio")] });

  it("writes (and replaces) the file in one step, leaving no temporary file", async () => {
    const out = join(dir, "audio", "nex-intro.mp3");
    await writeAudioAtomically(out, mp3(2048), audioDirs());
    await writeAudioAtomically(out, id3(3072), audioDirs());
    expect((await readFile(out)).length).toBe(3072);
    expect(await readdir(join(dir, "audio"))).toEqual(["nex-intro.mp3"]);
  });

  it("refuses paths outside its directories (including via ..)", async () => {
    const allowed = audioDirs();
    for (const out of [
      join(dir, "elsewhere.mp3"),
      join(dir, "audio", "..", "escape.mp3"),
      join(dir, "audio"),
      join(dir, "audio-other", "x.mp3"),
    ]) {
      await expect(writeAudioAtomically(out, mp3(), allowed)).rejects.toThrow(/outside/);
    }
    expect(await readdir(dir)).toEqual([]);
  });

  it("never writes through an existing link at the target: the link itself is replaced", async () => {
    await mkdir(join(dir, "audio"));
    const victim = join(dir, "victim.txt");
    await writeFile(victim, "keep me");
    const out = join(dir, "audio", "nex-intro.mp3");
    await symlink(victim, out);
    await writeAudioAtomically(out, mp3(2048), audioDirs());
    expect(await readFile(victim, "utf8")).toBe("keep me");
    expect((await lstat(out)).isSymbolicLink()).toBe(false);
  });

  it("cleans up its temporary file when the final step fails", async () => {
    const out = join(dir, "audio", "nex-intro.mp3");
    await mkdir(out, { recursive: true }); // a directory where the file should go: rename fails
    await writeFile(join(out, "x"), "");
    await expect(writeAudioAtomically(out, mp3(), audioDirs())).rejects.toThrow();
    expect((await readdir(join(dir, "audio"))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});

/*
 * Regression tests for the independent review of commit 4e4d344 (four low-severity findings).
 */

describe("review finding 1: nothing before <speak> is ever sent", () => {
  const root = template.slice(template.indexOf("<speak"));
  /**
   * Fixed SHA-256 fingerprints (and UTF-8 byte lengths) of the SSML that commit 4e4d344 generated
   * from the committed template, the output verified by the independent review. They are recorded
   * values, never recomputed by the test: any change to the SSML sent to Azure (the template, the
   * voice or style handling, whitespace) fails here. If the template is changed on purpose, record
   * new values only after reviewing the new SSML.
   */
  const VERIFIED_SSML = [
    {
      voice: "en-GB-RyanNeural",
      style: null,
      bytes: 726,
      sha256: "e8358b7450b4498722e5968055a9b210bde1548d1cdc923a146fb540d6ae009e",
    },
    {
      voice: "en-GB-RyanNeural",
      style: "chat",
      bytes: 776,
      sha256: "acd765a4aad4d27a45b4e4e779f31286364e8d29ec8e5bfba96e6e5aa535aaf0",
    },
    {
      voice: "en-GB-ThomasNeural",
      style: null,
      bytes: 728,
      sha256: "b8592820453600b14ff7415bab5fe2d1383ea44a231417f7266c6aa687afe060",
    },
  ];
  const fingerprint = (text) => createHash("sha256").update(text, "utf8").digest("hex");

  it("the committed template's SSML is byte-for-byte the verified output (Ryan, Ryan chat, Thomas)", () => {
    for (const { voice, style, bytes, sha256 } of VERIFIED_SSML) {
      const ssml = buildSsml(template, voice, style);
      expect(Buffer.byteLength(ssml, "utf8"), `${voice} ${style}`).toBe(bytes);
      expect(fingerprint(ssml), `${voice} ${style}`).toBe(sha256);
    }
  });

  it("any change to the generated SSML changes its fingerprint", () => {
    const ssml = buildSsml(template, "en-GB-RyanNeural");
    const recorded = VERIFIED_SSML[0].sha256;
    for (const changed of [
      `${ssml} `,
      ssml.replace('rate="-8%"', 'rate="-9%"'),
      ssml.replace("Hello.", "Hello!"),
      `${ssml}\n`, // a line ending alone
      buildSsml(template, "en-GB-RyanNeural", "cheerful"),
    ]) {
      expect(changed).not.toBe(ssml);
      expect(fingerprint(changed)).not.toBe(recorded);
    }
  });

  it("a note that mentions <speak> is skipped whole (none of it is sent)", () => {
    const notes = "<!--\n  <speak> is a private note: never send this.\n-->\n";
    const ssml = buildSsml(`${notes}${root}`, "en-GB-RyanNeural");
    expect(ssml.startsWith("<speak version=")).toBe(true);
    expect(ssml).not.toContain("private note");
    expect(ssml).not.toContain("-->");
    // Several notes, each mentioning the root element, with whitespace between.
    const many = `<!-- <speak> --> \n<!-- <speak version="x"> -->\n${root}`;
    expect(buildSsml(many, "en-GB-RyanNeural")).toBe(buildSsml(template, "en-GB-RyanNeural"));
  });

  it("refuses anything but whole notes before <speak>, and a note's end inside the document", () => {
    const voice = "en-GB-RyanNeural";
    expect(() => buildSsml(`<!-- unterminated ${root}`, voice)).toThrow(/unterminated/);
    expect(() => buildSsml(`stray text ${root}`, voice)).toThrow(/after its notes/);
    expect(() => buildSsml(`<?xml version="1.0"?>${root}`, voice)).toThrow(/after its notes/);
    expect(() => buildSsml(`<speaker/>${root}`, voice)).toThrow(/after its notes/);
    expect(() => buildSsml(root.replace("<prosody", "--><prosody"), voice)).toThrow(/only before/);
  });
});

describe("review finding 2: a response is never read past 2 MB", () => {
  /** A body of `chunks` × 64 KB with no Content-Length, counting how much was actually produced. */
  const endless = (chunks) => {
    const counter = { pulled: 0, cancelled: false };
    const stream = new ReadableStream({
      pull(controller) {
        if (counter.pulled >= chunks) return controller.close();
        counter.pulled++;
        const chunk = new Uint8Array(64 * 1024);
        if (counter.pulled === 1) chunk.set([0xff, 0xfb, 0x90, 0x64]);
        controller.enqueue(chunk);
      },
      cancel() {
        counter.cancelled = true;
      },
    });
    return { stream, counter };
  };

  it("stops and cancels the transfer as soon as the body passes the limit", async () => {
    const { stream, counter } = endless(4800); // 300 MB if read to the end
    await expect(readCapped(new Response(stream))).rejects.toThrow(/more than 2097152 bytes/);
    expect(counter.cancelled).toBe(true);
    expect(counter.pulled).toBeLessThanOrEqual(34); // 2 MB / 64 KB, plus the chunk that passed it
  });

  it("applies to requestSpeech without (or with a false) Content-Length", async () => {
    for (const headers of [{}, { "content-length": "4096" }]) {
      const { stream, counter } = endless(4800);
      const response = new Response(stream, {
        headers: { "content-type": "audio/mpeg", ...headers },
      });
      await expect(
        requestSpeech({
          region: "uksouth",
          key: "k",
          ssml: "<speak/>",
          request: async () => response,
        }),
      ).rejects.toThrow(/size/);
      expect(counter.pulled).toBeLessThanOrEqual(34);
    }
  });

  it("reads a normal recording whole, across chunks", async () => {
    const { stream } = endless(2); // 128 KB
    const bytes = await readCapped(new Response(stream));
    expect(bytes.length).toBe(128 * 1024);
    expect(() => checkAudio("audio/mpeg", bytes)).not.toThrow();
  });
});

describe("review finding 3: never written through a linked folder", () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "nex-voice-links-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const repo = () => join(dir, "repo");
  const allowed = () => ({ root: repo(), dirs: [join(repo(), "public", "audio")] });
  const out = () => join(repo(), "public", "audio", "nex-intro.mp3");

  it("refuses a linked public/audio (a link can be committed): nothing is written at its target", async () => {
    await mkdir(join(repo(), "public"), { recursive: true });
    await mkdir(join(dir, "elsewhere"));
    await symlink(join(dir, "elsewhere"), join(repo(), "public", "audio"));
    await expect(writeAudioAtomically(out(), mp3(), allowed())).rejects.toThrow(/linked folder/);
    expect(await readdir(join(dir, "elsewhere"))).toEqual([]);
  });

  it("refuses a link higher up (public/) without creating anything at its target", async () => {
    await mkdir(repo(), { recursive: true });
    await mkdir(join(dir, "elsewhere"));
    await symlink(join(dir, "elsewhere"), join(repo(), "public"));
    await expect(writeAudioAtomically(out(), mp3(), allowed())).rejects.toThrow(/linked folder/);
    expect(await readdir(join(dir, "elsewhere"))).toEqual([]); // no audio/ folder created there
  });

  it("refuses allowed folders outside the repository", async () => {
    await expect(
      writeAudioAtomically(join(dir, "outside", "x.mp3"), mp3(), {
        root: repo(),
        dirs: [join(dir, "outside")],
      }),
    ).rejects.toThrow(/outside/);
  });

  it("writes normally when every folder is real (even if the repository's own path has links)", async () => {
    // The temporary directory itself may sit behind a link (e.g. /var → /private/var on macOS).
    await writeAudioAtomically(out(), mp3(2048), allowed());
    expect((await readFile(out())).length).toBe(2048);
  });
});

describe("review finding 4: the key never goes on a command line", () => {
  it("the documentation reads it at a hidden prompt and unsets it, and never assigns it inline", async () => {
    for (const file of ["scripts/voice/README.md", "scripts/voice/synthesise.mjs"]) {
      const text = await readFile(join(process.cwd(), file), "utf8");
      expect(text, file).toContain("read -rs AZURE_SPEECH_KEY");
      expect(text, file).toContain("unset AZURE_SPEECH_KEY");
      // An inline value (`AZURE_SPEECH_KEY=…` or `=<anything>`) would land in shell history.
      expect(text, file).not.toMatch(/AZURE_SPEECH_KEY=\S/);
    }
  });
});
