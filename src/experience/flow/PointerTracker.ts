/**
 * Pointer input for the flow map (ADR-004, ADR-007). Listens on `window` (so the scene reacts
 * while the DOM above it stays fully interactive) and keeps everything in mutable fields: nothing
 * here touches React or Zustand state, and `update()` allocates nothing, so it is safe to call
 * every animation frame.
 *
 * Only attached while pointer effects are allowed (effective motion "full"); detaching removes
 * every listener (ADR-004: no pointer interaction under reduced or off).
 */

export interface PointerSample {
  /** Position in UV space (0–1, origin bottom-left). */
  u: number;
  v: number;
  /** Velocity this frame, in NDC units per second (screen width = 2 units). */
  vx: number;
  vy: number;
  /** Smoothed velocity that eases back to rest, for the analytic fallback. */
  smoothVx: number;
  smoothVy: number;
  /** The pointer is over the page and has moved at least once. */
  active: boolean;
}

/** Cap on pointer speed (NDC/s), so a flick can't blow the field apart. */
export const MAX_POINTER_SPEED = 6;

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export class PointerTracker {
  readonly sample: PointerSample = {
    u: 0.5,
    v: 0.5,
    vx: 0,
    vy: 0,
    smoothVx: 0,
    smoothVy: 0,
    active: false,
  };
  private movedX = 0;
  private movedY = 0;
  private attached = false;

  constructor(private readonly win: Window) {}

  private readonly onMove = (event: PointerEvent) => {
    const u = event.clientX / Math.max(1, this.win.innerWidth);
    const v = 1 - event.clientY / Math.max(1, this.win.innerHeight);
    if (this.sample.active) {
      this.movedX += u - this.sample.u;
      this.movedY += v - this.sample.v;
    }
    this.sample.u = u;
    this.sample.v = v;
    this.sample.active = true;
  };

  private readonly onLeave = () => {
    this.sample.active = false;
    this.movedX = 0;
    this.movedY = 0;
  };

  get isAttached(): boolean {
    return this.attached;
  }

  attach(): void {
    if (this.attached) return;
    // Marked first, so a failure part-way through is fully undone by detach().
    this.attached = true;
    this.win.addEventListener("pointermove", this.onMove, { passive: true });
    this.win.document.documentElement.addEventListener("pointerleave", this.onLeave);
    this.win.addEventListener("blur", this.onLeave);
  }

  detach(): void {
    if (!this.attached) return;
    this.win.removeEventListener("pointermove", this.onMove);
    this.win.document.documentElement.removeEventListener("pointerleave", this.onLeave);
    this.win.removeEventListener("blur", this.onLeave);
    this.attached = false;
    this.onLeave();
    this.sample.vx = this.sample.vy = this.sample.smoothVx = this.sample.smoothVy = 0;
  }

  /** Advance one frame (`dt` seconds): turn accumulated movement into velocity. */
  update(dt: number): PointerSample {
    const s = this.sample;
    const step = Math.max(dt, 1 / 240);
    // UV → NDC is a factor of 2.
    s.vx = clamp((this.movedX * 2) / step, MAX_POINTER_SPEED);
    s.vy = clamp((this.movedY * 2) / step, MAX_POINTER_SPEED);
    this.movedX = 0;
    this.movedY = 0;
    // Ease the smoothed velocity towards the current one; it decays to rest when movement stops.
    const ease = 1 - Math.pow(0.85, Math.min(step, 0.1) * 60);
    s.smoothVx += (s.vx - s.smoothVx) * ease;
    s.smoothVy += (s.vy - s.smoothVy) * ease;
    return s;
  }
}
