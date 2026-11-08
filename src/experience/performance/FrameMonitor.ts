/**
 * Frame-time monitor (ARCHITECTURE §9.2, runtime adaptation). Allocation-free per frame; reports
 * once per window. The stage uses reports to step quality down on sustained slowness (see
 * quality.ts) and to publish measurements on the stage element (a DOM write once per window, never
 * per frame).
 */

export interface FrameReport {
  /** Mean frame time over the window, in milliseconds. */
  averageMs: number;
  /** Frames rendered in the window. */
  frames: number;
  /** Total frames since the monitor started. */
  totalFrames: number;
  /** Consecutive slow windows, including this one (0 if this window was fine). */
  slowWindows: number;
}

export class FrameMonitor {
  private elapsed = 0;
  private frames = 0;
  private total = 0;
  private slow = 0;

  constructor(
    /** Window length in seconds. */
    private readonly windowSeconds = 1,
    /** A window is "slow" above this mean frame time (default ≈ 42 fps). */
    private readonly slowMs = 24,
  ) {}

  /** Record one frame of `dt` seconds. Returns a report when a window completes. */
  record(dt: number): FrameReport | null {
    this.elapsed += dt;
    this.frames += 1;
    this.total += 1;
    if (this.elapsed < this.windowSeconds) return null;
    const averageMs = (this.elapsed / this.frames) * 1000;
    this.slow = averageMs > this.slowMs ? this.slow + 1 : 0;
    const report = {
      averageMs,
      frames: this.frames,
      totalFrames: this.total,
      slowWindows: this.slow,
    };
    this.elapsed = 0;
    this.frames = 0;
    return report;
  }

  /**
   * Start a fresh measurement: discard the current window and the slowness history. Called when
   * the workload changes (DPR, particle count or motion), so the new settings are judged only on
   * frames rendered with them.
   */
  reset(): void {
    this.elapsed = 0;
    this.frames = 0;
    this.slow = 0;
  }
}
