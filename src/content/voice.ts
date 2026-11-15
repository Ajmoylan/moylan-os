/**
 * NEX's spoken introduction (launch sprint): the script, and which recording (if any) plays it.
 *
 * Provider-independent: the site only ever plays one prerecorded file from this site. Replacing
 * the voice (Azure, ElevenLabs, …) means dropping in a new file and changing `LICENSED_RECORDING`;
 * NEX's animation, navigation and subtitles never change.
 *
 * Which recording plays:
 * 1. A local preview recording, `VITE_NEX_VOICE_PREVIEW` in the Git-ignored `.env.local` (e.g. the
 *    Azure F0 "Ryan" audition, `public/audio/*.placeholder.*`, also Git-ignored). Local builds only:
 *    `scripts/postbuild.mjs` fails a CI build that contains any placeholder.
 * 2. Otherwise `LICENSED_RECORDING`: a commercially licensed file committed in public/audio/.
 * 3. Otherwise text-only: NEX's introduction is shown as text, with no audio controls. This is the
 *    deliberate production configuration until a licensed recording exists.
 *
 * Never place secrets in VITE_ variables: they are compiled into public JavaScript.
 */

/** NEX's introduction: the subtitles always show exactly this, with or without sound. */
export const NEX_INTRO =
  "Hello. I'm NEX. Welcome to MOYLAN//OS, Alex Moylan's digital world. Scroll to discover his work, or select me and I'll guide you.";

/** The commercially licensed recording, once generated (e.g. "/audio/nex-intro.mp3"); else null. */
export const LICENSED_RECORDING: string | null = null;

export type NexVoiceConfig =
  | {
      mode: "audio";
      src: string;
      /** A local audition recording, never deployed. */
      preview: boolean;
      /** Shown beside the controls (Microsoft's code of conduct: disclose synthetic voices). */
      disclosure: string;
    }
  | { mode: "text-only" };

const preview = (import.meta.env.VITE_NEX_VOICE_PREVIEW as string | undefined) || null;
const src = preview ?? LICENSED_RECORDING;

export const voice: NexVoiceConfig = src
  ? { mode: "audio", src, preview: preview !== null, disclosure: "NEX's voice is AI-generated." }
  : { mode: "text-only" };
