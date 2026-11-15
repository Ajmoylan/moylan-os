import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NexVoiceConfig } from "~/content/voice";

/**
 * NEX's voice controls (launch sprint): sound off until asked, Hear / Replay / Stop, Mute that
 * stops at once and lasts for the visit, unavailable and unsupported audio, and the deliberate
 * text-only configuration. A fake audio element stands in for the browser's.
 */

const config = vi.hoisted(() => ({
  current: { mode: "audio", src: "/audio/nex.mp3", preview: true, disclosure: "AI voice." } as
    NexVoiceConfig | { mode: "text-only" },
}));
vi.mock("~/content/voice", () => ({
  NEX_INTRO: "Hello. I'm NEX.",
  get voice() {
    return config.current;
  },
}));

class FakeAudio {
  static instances: FakeAudio[] = [];
  static playable = "maybe";
  static rejectPlay = false;
  paused = true;
  currentTime = 0;
  src: string | undefined;
  private listeners: Record<string, (() => void)[]> = {};
  constructor(src?: string) {
    this.src = src;
    if (src) FakeAudio.instances.push(this);
  }
  canPlayType() {
    return FakeAudio.playable;
  }
  addEventListener(type: string, listener: () => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  emit(type: string) {
    for (const listener of this.listeners[type] ?? []) listener();
  }
  play() {
    if (FakeAudio.rejectPlay) return Promise.reject(new Error("blocked"));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = undefined;
  }
  load() {}
}

async function setup() {
  vi.resetModules();
  const { NexVoice } = await import("./NexVoice");
  const view = render(
    <>
      <blockquote id="nex-intro">Hello. I&apos;m NEX.</blockquote>
      <NexVoice />
    </>,
  );
  return view;
}

const speaking = () => document.getElementById("nex-intro")!.hasAttribute("data-speaking");
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.playable = "maybe";
  FakeAudio.rejectPlay = false;
  config.current = { mode: "audio", src: "/audio/nex.mp3", preview: true, disclosure: "AI voice." };
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NexVoice", () => {
  it("is silent until asked: nothing is created or played on load", async () => {
    await setup();
    expect(FakeAudio.instances).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Hear NEX" })).toBeEnabled();
    expect(screen.getByText("AI voice.")).toBeInTheDocument(); // the AI-voice disclosure
  });

  it("Hear NEX plays; Stop stops; Replay starts again from the beginning", async () => {
    await setup();
    await click("Hear NEX");
    const audio = FakeAudio.instances[0]!;
    expect(audio.paused).toBe(false);
    expect(speaking()).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("NEX is speaking.");
    audio.currentTime = 4;
    await click("Replay");
    expect(audio.currentTime).toBe(0);
    expect(audio.paused).toBe(false);
    await click("Stop");
    expect(audio.paused).toBe(true);
    expect(speaking()).toBe(false);
    expect(screen.getByRole("button", { name: "Hear NEX" })).toBeInTheDocument();
    expect(FakeAudio.instances).toHaveLength(1); // one element, reused
  });

  it("the subtitles stay when playback ends", async () => {
    await setup();
    await click("Hear NEX");
    await act(async () => FakeAudio.instances[0]!.emit("ended"));
    expect(speaking()).toBe(false);
    expect(screen.getByText("Hello. I'm NEX.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Hear NEX" })).toBeInTheDocument();
  });

  it("Mute stops playback at once and keeps NEX quiet for the visit; Unmute never autoplays", async () => {
    await setup();
    await click("Hear NEX");
    const audio = FakeAudio.instances[0]!;
    await click("Mute NEX");
    expect(audio.paused).toBe(true);
    expect(speaking()).toBe(false);
    expect(screen.getByRole("button", { name: "Hear NEX" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/muted/);
    await click("Unmute NEX");
    expect(audio.paused).toBe(true); // no automatic restart
    expect(screen.getByRole("button", { name: "Hear NEX" })).toBeEnabled();
  });

  it("leaving the page stops and releases the audio (nothing restarts after navigation)", async () => {
    const view = await setup();
    await click("Hear NEX");
    const audio = FakeAudio.instances[0]!;
    view.unmount();
    expect(audio.paused).toBe(true);
    expect(audio.src).toBeUndefined();
  });

  it("unavailable audio (a failed load or a refused play): no controls, a clear message", async () => {
    await setup();
    FakeAudio.rejectPlay = true;
    await click("Hear NEX");
    expect(screen.queryByRole("button", { name: "Hear NEX" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/isn't available/);
    expect(screen.getByText("Hello. I'm NEX.")).toBeVisible();
  });

  it("unsupported format: no controls, the introduction is still there", async () => {
    FakeAudio.playable = "";
    await setup();
    expect(screen.queryByRole("button", { name: "Hear NEX" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/can't play/);
  });

  it("text-only configuration (no licensed recording): renders no audio controls at all", async () => {
    config.current = { mode: "text-only" };
    await setup();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Hello. I'm NEX.")).toBeVisible();
  });
});
