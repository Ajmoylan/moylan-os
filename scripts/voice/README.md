# NEX's voice (Azure AI Speech)

NEX's spoken introduction is one prerecorded MP3 served from this site (`public/audio/`). It loads only when a visitor presses "Hear NEX", and its caption and AI-voice disclosure sit beside the controls. Nothing on the live site calls Azure.

## Files

- `nex-intro.ssml.xml`: the script, with the pauses and pronunciations:
  - "NEX" as /nɛks/;
  - "MOYLAN//OS" as "Moylan O S";
  - "Moylan" as /ˈmɔɪlən/.
- `synthesise.mjs`: one REST request per recording. It needs `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in the shell. The key is never stored in the repository.
- `src/content/voice.ts`: which recording the site plays.
  - **Local previews:** set `VITE_NEX_VOICE_PREVIEW` in the Git-ignored `.env.local`, for example `/audio/nex-intro.ryan-f0.placeholder.mp3`. Copy the F0 audition into `public/audio/` with `.placeholder.` in its name, which is Git-ignored.
  - **Production:** `LICENSED_RECORDING`, a committed, commercially licensed file. While it is `null`, the site is deliberately text-only.
  - **Guard:** `scripts/postbuild.mjs` fails a CI build that contains any placeholder file or reference.

## Licensing

The Azure Product Terms permit commercial use of audio generated with prebuilt neural voices for paid-tier customers only. So:

- **Free (F0)** is used only for private auditions. Its samples stay in the Git-ignored `docs/references/voice-samples/` and are never committed or published.
- **The published recording** is generated with a paid **Standard (S0)** resource. `synthesise.mjs final` refuses to run unless `AZURE_SPEECH_TIER=S0` is set, as the deliberate confirmation.
- The macOS "Daniel" placeholder is never committed or published either.

## Steps (each needs Alex's approval first)

1. **Create a Speech resource** in the Azure portal: Create a resource → "Speech service".
   - Region: UK South.
   - Pricing tier: Free F0, which includes 0.5 million neural characters a month. One F0 resource is allowed per subscription.
2. In that shell only, set the key from the resource's "Keys and Endpoint" page:
   ```bash
   export AZURE_SPEECH_KEY=…
   ```
   ```bash
   export AZURE_SPEECH_REGION=uksouth
   ```
3. Generate the shortlist, Ryan (plain), Ryan ("chat" style) and Thomas, into `docs/references/voice-samples/` (Git-ignored):
   ```bash
   node scripts/voice/synthesise.mjs samples
   ```
4. Listen and choose.
5. With Alex's approval of the confirmed S0 price, use a **Standard (S0)** resource's key and generate the final file:
   ```bash
   AZURE_SPEECH_TIER=S0 node scripts/voice/synthesise.mjs final en-GB-RyanNeural
   ```
6. Point `src/content/voice.ts` at `/audio/nex-intro.mp3`.

Each sample is about 600 billable characters (SSML markup counts, except `<speak>` and `<voice>`), so the three F0 samples total about 1,800 characters, well inside F0's 0.5 million a month, and the S0 final file about 600 characters.
