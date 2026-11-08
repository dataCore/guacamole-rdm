/** Input events of one session in their original order. While something
 *  is held back, every later event waits behind it, so keys and mouse
 *  never overtake each other. */
export class InputQueue {
  #held: (() => void)[] | null = null;
  #maxTimer: ReturnType<typeof setTimeout> | undefined;
  #releaseTimer: ReturnType<typeof setTimeout> | undefined;

  get holding(): boolean {
    return this.#held !== null;
  }

  /** Send now, or behind whatever is held. */
  send(event: () => void): void {
    if (this.#held) this.#held.push(event);
    else event();
  }

  /** Hold back `event` and everything after it until release() or
   *  releaseIn(), at the latest `maxMs` after the hold started. */
  hold(event: () => void, maxMs: number): void {
    if (this.#held) {
      this.#held.push(event);
      return;
    }
    this.#held = [event];
    this.#maxTimer = setTimeout(() => this.release(), maxMs);
  }

  /** Release after `ms` (now for 0), replacing an earlier releaseIn();
   *  the limit set by hold() still applies. */
  releaseIn(ms: number): void {
    if (!this.#held) return;
    clearTimeout(this.#releaseTimer);
    if (ms > 0) this.#releaseTimer = setTimeout(() => this.release(), ms);
    else this.release();
  }

  /** Send everything held, in order. The queue is open again before the
   *  first event runs, so an event that throws cannot leave it stuck. */
  release(): void {
    const events = this.#held ?? [];
    this.clear();
    for (const event of events) event();
  }

  /** Drop everything held without sending it. */
  clear(): void {
    clearTimeout(this.#maxTimer);
    clearTimeout(this.#releaseTimer);
    this.#held = null;
  }
}
