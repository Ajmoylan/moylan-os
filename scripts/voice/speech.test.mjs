// @vitest-environment jsdom
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_AUDIO_BYTES,
  buildSsml,
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

  it("drops any notes before <speak> whole, however they are written (no pattern sanitising)", () => {
    // Inputs a single non-global comment replacement left partly in place.
    for (const notes of ["<!--a--><!--b-->", "<!<!---->--", "<!-- x --> <!-- y -->", "<!--"]) {
      const ssml = buildSsml(
        `${notes}\n${template.slice(template.indexOf("<speak"))}`,
        "en-GB-RyanNeural",
      );
      expect(ssml.startsWith("<speak")).toBe(true);
      expect(ssml).not.toContain("<!");
    }
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

  it("writes (and replaces) the file in one step, leaving no temporary file", async () => {
    const out = join(dir, "audio", "nex-intro.mp3");
    await writeAudioAtomically(out, mp3(2048), [join(dir, "audio")]);
    await writeAudioAtomically(out, id3(3072), [join(dir, "audio")]);
    expect((await readFile(out)).length).toBe(3072);
    expect(await readdir(join(dir, "audio"))).toEqual(["nex-intro.mp3"]);
  });

  it("refuses paths outside its directories (including via ..)", async () => {
    const allowed = [join(dir, "audio")];
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
    await writeAudioAtomically(out, mp3(2048), [join(dir, "audio")]);
    expect(await readFile(victim, "utf8")).toBe("keep me");
    expect((await lstat(out)).isSymbolicLink()).toBe(false);
  });

  it("cleans up its temporary file when the final step fails", async () => {
    const out = join(dir, "audio", "nex-intro.mp3");
    await mkdir(out, { recursive: true }); // a directory where the file should go: rename fails
    await writeFile(join(out, "x"), "");
    await expect(writeAudioAtomically(out, mp3(), [join(dir, "audio")])).rejects.toThrow();
    expect((await readdir(join(dir, "audio"))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
