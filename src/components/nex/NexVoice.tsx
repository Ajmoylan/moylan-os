import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { voice } from "~/content/voice";
import { signalNex } from "~/lib/nex-events";

export { NEX_INTRO } from "~/content/voice";

type VoiceState = "idle" | "playing" | "unavailable";

/** Muted for the rest of this visit (in memory only: no cookies or storage). */
let mutedThisVisit = false;

/** Plays the recording from the start (the element is reused for replays). */
function playFromStart(element: HTMLAudioElement): Promise<void> {
  element.currentTime = 0;
  return element.play();
}

function halt(element: HTMLAudioElement | null, release = false): void {
  if (!element) return;
  element.pause();
  element.currentTime = 0;
  if (release) {
    element.removeAttribute("src");
    element.load();
  }
}

const mimeFor = (src: string) =>
  src.endsWith(".mp3") ? "audio/mpeg" : src.endsWith(".m4a") ? "audio/mp4" : "";

/** Whether this browser can play the recording's format (checked once, in the browser only). */
let playable: boolean | null = null;
const canPlay = (src: string) => {
  if (playable === null) {
    const probe = typeof Audio === "function" ? new Audio() : null;
    playable = probe !== null && probe.canPlayType(mimeFor(src)) !== "";
  }
  return playable;
};
const never = () => () => {};

const button =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-steel px-5 text-text transition-colors hover:border-nex/60 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * NEX's voice (launch sprint): sound is off until the visitor asks. "Hear NEX" plays the one
 * prerecorded introduction; Replay and Stop control it; Mute stops it at once and keeps NEX quiet
 * for the rest of the visit. Nothing autoplays, nothing restarts after navigation (the audio is
 * released when the page changes), and nothing loads before the first play.
 *
 * The subtitles are separate (`#nex-intro`, always visible): this component only marks them while
 * NEX speaks. With the text-only configuration (no licensed recording) it renders nothing.
 * Provider-independent: it plays whatever file `content/voice.ts` names.
 */
export function NexVoice() {
  const [state, setState] = useState<VoiceState>("idle");
  const [muted, setMuted] = useState(mutedThisVisit);
  const [status, setStatus] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const src = voice.mode === "audio" ? voice.src : null;

  const speaking = (on: boolean) => {
    document.getElementById("nex-intro")?.toggleAttribute("data-speaking", on);
    signalNex(on ? "hold" : "release");
  };

  // Feature detection in the browser; the prerendered page (server snapshot) offers the controls.
  const supported = useSyncExternalStore(
    never,
    () => (src ? canPlay(src) : false),
    () => true,
  );

  useEffect(() => {
    if (!src) return;
    return () => {
      if (!audio.current) return;
      halt(audio.current, true);
      speaking(false);
    };
  }, [src]);

  if (!src) return null;

  const play = () => {
    if (muted) return;
    let current = audio.current;
    if (!current) {
      current = new Audio(src);
      current.addEventListener("ended", () => {
        setState("idle");
        setStatus("");
        speaking(false);
      });
      current.addEventListener("error", () => {
        setState("unavailable");
        speaking(false);
      });
      audio.current = current;
    }
    playFromStart(current).then(
      () => {
        setState("playing");
        setStatus("NEX is speaking.");
        speaking(true);
        signalNex("pulse");
      },
      () => setState("unavailable"),
    );
  };

  const stop = (message = "Stopped.") => {
    halt(audio.current);
    setState("idle");
    setStatus(message);
    speaking(false);
  };

  const toggleMute = () => {
    const next = !muted;
    mutedThisVisit = next;
    setMuted(next);
    if (next) stop("NEX is muted. The introduction stays above.");
    else setStatus("Sound is on. Choose Hear NEX to listen.");
  };

  const unavailable = state === "unavailable" || !supported;

  return (
    <div
      data-voice-mode={voice.mode}
      data-voice-state={!supported ? "unsupported" : unavailable ? state : muted ? "muted" : state}
      className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm"
    >
      {!unavailable && (
        <>
          {state === "playing" ? (
            <>
              <button type="button" onClick={play} className={button}>
                <span aria-hidden="true" className="text-nex">
                  ↺
                </span>
                Replay
              </button>
              <button type="button" onClick={() => stop()} className={button}>
                <span aria-hidden="true" className="text-nex">
                  ■
                </span>
                Stop
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={play}
              disabled={muted}
              aria-describedby="nex-intro"
              className={button}
            >
              <span aria-hidden="true" className="text-nex">
                ▶
              </span>
              Hear NEX
            </button>
          )}
          <button type="button" onClick={toggleMute} className={button}>
            <span aria-hidden="true" className="text-nex">
              {muted ? "🔈" : "🔇"}
            </span>
            {muted ? "Unmute NEX" : "Mute NEX"}
          </button>
          <p className="w-full text-xs text-text-muted/80">
            {voice.mode === "audio" ? voice.disclosure : ""}
          </p>
        </>
      )}
      <p role="status" className="w-full text-text-muted">
        {unavailable
          ? !supported
            ? "This browser can't play NEX's voice; the introduction is above."
            : "NEX's voice isn't available right now; the introduction is above."
          : status}
      </p>
    </div>
  );
}
