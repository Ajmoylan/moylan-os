#!/usr/bin/env node
/**
 * Generates NEX's introduction with Azure AI Speech (REST, no SDK, no dependency). Run by hand only
 * after Alex has approved it: it makes one billable request per sample.
 *
 * Usage (the key and region come from the environment, never from a file in the repository or the
 * command line; enter the key at a hidden prompt so it stays out of shell history, see README.md):
 *   read -rs AZURE_SPEECH_KEY && export AZURE_SPEECH_KEY
 *   export AZURE_SPEECH_REGION=uksouth
 *   node scripts/voice/synthesise.mjs samples
 *   AZURE_SPEECH_TIER=S0 node scripts/voice/synthesise.mjs final en-GB-RyanNeural [style]
 *   unset AZURE_SPEECH_KEY
 *
 * "samples" writes the shortlist to docs/references/voice-samples/ (Git-ignored; private
 * auditions, never published). "final" writes public/audio/nex-intro.mp3 (24 kHz, 48 kbit/s mono
 * MP3, ≈ 60 KB) and must be generated with a paid Standard (S0) resource: the Azure Product Terms
 * permit commercial use of prebuilt neural voice output for paid-tier customers only, so audio from
 * the Free (F0) tier is for private auditions. "final" therefore also requires
 * AZURE_SPEECH_TIER=S0, set deliberately, as the confirmation that the key is a Standard resource's.
 *
 * Inputs are validated and the output is checked and written atomically (speech.mjs): the region
 * must be an Azure region name, the voice and style Azure names, and only an MP3 response is saved.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSsml, requestSpeech, speechEndpoint, writeAudioAtomically } from "./speech.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const samplesDir = join(root, "docs", "references", "voice-samples");
const publicAudioDir = join(root, "public", "audio");
const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
if (!key || !region) {
  console.error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (e.g. uksouth) in this shell first.");
  process.exit(1);
}
try {
  speechEndpoint(region); // fail before any request on a malformed region
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const template = await readFile(join(here, "nex-intro.ssml.xml"), "utf8");

async function synthesise(voice, style, out) {
  const ssml = buildSsml(template, voice, style);
  const bytes = await requestSpeech({ region, key, ssml });
  await writeAudioAtomically(out, bytes, { root, dirs: [samplesDir, publicAudioDir] });
  console.log(`wrote ${out}`);
}

const [mode, voice, style] = process.argv.slice(2);
if (mode === "samples") {
  await synthesise("en-GB-RyanNeural", null, join(samplesDir, "ryan.mp3"));
  await synthesise("en-GB-RyanNeural", "chat", join(samplesDir, "ryan-chat.mp3"));
  await synthesise("en-GB-ThomasNeural", null, join(samplesDir, "thomas.mp3"));
} else if (mode === "final" && voice) {
  if (process.env.AZURE_SPEECH_TIER !== "S0") {
    console.error(
      "The published recording must come from a paid Standard (S0) resource (Azure Product Terms).\n" +
        "Use an S0 resource's key and set AZURE_SPEECH_TIER=S0 to confirm.",
    );
    process.exit(1);
  }
  await synthesise(voice, style ?? null, join(publicAudioDir, "nex-intro.mp3"));
  console.log('Now set src: "/audio/nex-intro.mp3" in src/content/voice.ts.');
} else {
  console.error("Usage: synthesise.mjs samples | final <voice> [style]");
  process.exit(1);
}
