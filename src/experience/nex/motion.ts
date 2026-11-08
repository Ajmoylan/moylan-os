import { Matrix3, Matrix4, Quaternion } from "three";
import { NEX_PARAMS, type Quat } from "./params";
import { NEX_FRAMES } from "./shape";

/**
 * NEX orbit frames (ADR-007: mutable objects, no React state): one rotation per orbit (halo,
 * core, nine rings, ten filaments), each spinning about its own normal at its reference rate,
 * plus the whole-avatar sway and the core's breathing. `update()` allocates nothing; the frames
 * array is the shaders' `uFrames` uniform value.
 */
export class NexMotion {
  readonly frames: Matrix3[] = Array.from({ length: NEX_FRAMES }, () => new Matrix3());
  readonly flow: number[];
  /** Core scale (1 … 1 + amplitude). */
  breath = 1;
  /** Breathing phase 0 … 1, for luminosity. */
  breathPhase = 0;
  private readonly bases: Matrix4[];
  private readonly spins: number[];
  private readonly sway = new Matrix4();
  private readonly spin = new Matrix4();
  private readonly m = new Matrix4();

  constructor() {
    const { halo, core, rings, filaments } = NEX_PARAMS;
    const basis = (q: Quat) =>
      new Matrix4().makeRotationFromQuaternion(new Quaternion(q[0], q[1], q[2], q[3]).normalize());
    this.bases = [
      new Matrix4(),
      basis(core.q),
      ...rings.map((r) => basis(r.q)),
      ...filaments.map((f) => basis(f.q)),
    ];
    this.spins = [
      halo.spin,
      core.spin,
      ...rings.map((r) => r.spin),
      ...filaments.map((f) => f.spin),
    ];
    this.flow = [0, 0, ...rings.map((r) => r.flow), ...filaments.map((f) => f.flow)];
    this.update(0);
  }

  update(time: number): void {
    const { breath, sway } = NEX_PARAMS;
    const cycle = (period: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * time) / period);
    this.breathPhase = cycle(breath.period);
    this.breath = 1 + breath.amplitude * this.breathPhase;
    this.sway.makeRotationY(sway.amplitude * cycle(sway.period));
    for (let i = 0; i < NEX_FRAMES; i++) {
      this.m.multiplyMatrices(this.sway, this.bases[i]!);
      this.m.multiply(this.spin.makeRotationY(this.spins[i]! * time));
      this.frames[i]!.setFromMatrix4(this.m);
    }
  }
}
