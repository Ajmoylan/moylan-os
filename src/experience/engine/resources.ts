/**
 * Transaction-safe ownership of GPU resources, listeners and DOM nodes (Milestone 2.4a).
 *
 * Every acquisition registers its release here as it happens. `release()` undoes them in reverse
 * order, exactly once, and runs every release even if one throws. Constructors register each
 * acquisition as it happens and call `rollback()` if a later step throws, so a failure part-way
 * through construction never leaks what was allocated before it.
 */

export interface Disposable {
  dispose(): void;
}

export class Resources {
  private readonly releases: (() => void)[] = [];
  private released = false;

  get isReleased(): boolean {
    return this.released;
  }

  /** Owns `resource`: it is disposed on release. Returns it, for inline use. */
  own<T extends Disposable>(resource: T): T {
    this.defer(() => resource.dispose());
    return resource;
  }

  /** Registers an undo step. After release, it runs at once (nothing may outlive the owner). */
  defer(release: () => void): void {
    if (this.released) release();
    else this.releases.push(release);
  }

  /**
   * Releases everything, newest first, once. Every step runs; the first error (if any) is rethrown
   * afterwards so a broken release is never silent.
   */
  release(): void {
    if (this.released) return;
    this.released = true;
    let failure: { error: unknown } | null = null;
    for (const undo of this.releases.splice(0).reverse()) {
      try {
        undo();
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure) throw failure.error;
  }

  /**
   * Rollback after a failed construction: releases everything and returns the *original* error for
   * the caller to rethrow (`throw resources.rollback(error)`); a secondary release error must not
   * hide the cause.
   */
  rollback(cause: unknown): unknown {
    try {
      this.release();
    } catch {
      // The construction error is the one to report.
    }
    return cause;
  }
}
