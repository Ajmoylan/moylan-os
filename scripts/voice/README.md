# NEX's voice (Azure AI Speech)

NEX's spoken introduction is one prerecorded MP3 served from this site (`public/audio/`). It loads only when a visitor presses "Hear NEX", and its caption and AI-voice disclosure sit beside the controls. Nothing on the live site calls Azure.

## Files

- `nex-intro.ssml.xml`: the script, with the pauses and pronunciations:
  - "NEX" as /nɛks/;
  - "MOYLAN//OS" as "Moylan O S";
  - "Moylan" as /ˈmɔɪlən/.
- `synthesise.mjs`: one REST request per recording. It needs `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in the shell. The key is never stored in the repository.
- `src/content/voice.ts`: which recording the site plays.
  - **Local previews:** set `VITE_NEX_VOICE_PREVIEW` in the Git-ignored `.env.local`, for example `/audio/nex-intro.ryan-f0.placeholder.mp3`. Copy the F0 audition into `public/audio/` with `.placeholder.` in its name, which is Git-ignored. Use it in the dev server, or build with `npm run build:voice-preview` (local only; never deploy that build).
  - **Production:** `LICENSED_RECORDING`, a committed, commercially licensed file. While it is `null`, the site is deliberately text-only.
  - **Guard** (`scripts/build-guards.mjs`): a production build (`npm run build`, locally or in CI) fails if it has any trace of a local preview: a placeholder file or reference, or `VITE_NEX_VOICE_PREVIEW`. So with a preview set up, a normal local build fails until you use `npm run build:voice-preview`, or remove the setting and the placeholder files. The preview build itself fails in CI.

## Licensing

The Azure Product Terms permit commercial use of audio generated with prebuilt neural voices for paid-tier customers only. So:

- **Free (F0)** is used only for private auditions. Its samples stay in the Git-ignored `docs/references/voice-samples/` and are never committed or published.
- **The published recording** is generated with a paid **Standard (S0)** resource. `synthesise.mjs final` refuses to run unless `AZURE_SPEECH_TIER=S0` is set, as the deliberate confirmation.
- The macOS "Daniel" placeholder is never committed or published either.

## Steps (each needs Alex's approval first)

1. **Create a Speech resource** in the Azure portal: Create a resource → "Speech service".
   - Region: UK South.
   - Pricing tier: Free F0, which includes 0.5 million neural characters a month. One F0 resource is allowed per subscription.
2. In that shell only, set the key from the resource's "Keys and Endpoint" page. Type or paste it at the hidden prompt, so it never appears on screen or in your shell history:
   ```bash
   read -rs AZURE_SPEECH_KEY && export AZURE_SPEECH_KEY
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
   (Set the S0 key with the same hidden `read -rs` prompt as in step 2.)
6. Point `src/content/voice.ts` at `/audio/nex-intro.mp3`.
7. Remove the key from the shell when you're done:
   ```bash
   unset AZURE_SPEECH_KEY
   ```

Each sample is about 600 billable characters (SSML markup counts, except `<speak>` and `<voice>`), so the three F0 samples total about 1,800 characters, well inside F0's 0.5 million a month, and the S0 final file about 600 characters.

## Safeguards (`speech.mjs`, tested offline in `speech.test.mjs`)

- **What is sent:** the SSML document starts at `<speak>`, so the template's notes are never sent. Only whole notes and whitespace may come before `<speak>` (each note is skipped whole, even if it mentions `<speak>`), and a comment inside the document is refused. The voice and style must be Azure names, and are XML-escaped.
- **Where it goes:** `AZURE_SPEECH_REGION` must be a region name (such as `uksouth`). The request goes only to `https://<region>.tts.speech.microsoft.com`, and redirects are refused, so the subscription key can't reach any other host.
- **What is written:** only an `audio/mpeg` MP3 response of a plausible size (1 KB–2 MB). The body is read only up to 2 MB, whatever its headers say. It is written to a temporary file, then renamed into place, only inside `docs/references/voice-samples/` or `public/audio/`, and never through a linked folder (a symbolic link anywhere between the repository and the file is refused).
- **The key:** it comes only from the environment. Enter it with `read -rs` (step 2), never on the command line, and `unset` it afterwards.
