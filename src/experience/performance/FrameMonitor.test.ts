import { describe, expect, it } from "vitest";
import { FrameMonitor } from "./FrameMonitor";

describe("FrameMonitor", () => {
  it("reports once per window with the mean frame time", () => {
    const monitor = new FrameMonitor(1, 24);
    let report = null;
    for (let i = 0; i < 59; i++) expect(monitor.record(1 / 60)).toBeNull();
    report = monitor.record(1 / 60);
    expect(report).toMatchObject({ frames: 60, totalFrames: 60, slowWindows: 0 });
    expect(report!.averageMs).toBeCloseTo(16.67, 1);
  });

  it("counts consecutive slow windows and resets on a good one", () => {
    const monitor = new FrameMonitor(1, 24);
    const runWindow = (dt: number) => {
      let report = null;
      while (!report) report = monitor.record(dt);
      return report;
    };
    expect(runWindow(1 / 30).slowWindows).toBe(1);
    expect(runWindow(1 / 30).slowWindows).toBe(2);
    expect(runWindow(1 / 60).slowWindows).toBe(0);
    runWindow(1 / 30);
    monitor.reset();
    expect(runWindow(1 / 30).slowWindows).toBe(1);
  });

  it("reset discards the partial window, so new settings are judged on their own frames", () => {
    const monitor = new FrameMonitor(1, 24);
    for (let i = 0; i < 20; i++) monitor.record(1 / 10); // 0.95 s of slow frames
    monitor.reset();
    let report = null;
    while (!report) report = monitor.record(1 / 60);
    expect(report.frames).toBe(60);
    expect(report.slowWindows).toBe(0);
  });
});
