/** Elapsed-time counter that can be paused without losing the time already counted. */
export class Stopwatch {
    private accumulated: number;
    private startedAt: number | null;

    constructor(initialMs = 0, running = true, now = Date.now()) {
        this.accumulated = initialMs;
        this.startedAt = running ? now : null;
    }

    get running(): boolean {
        return this.startedAt !== null;
    }

    elapsed(now = Date.now()): number {
        return this.accumulated + (this.startedAt === null ? 0 : Math.max(0, now - this.startedAt));
    }

    pause(now = Date.now()): void {
        if (this.startedAt === null) return;
        this.accumulated = this.elapsed(now);
        this.startedAt = null;
    }

    resume(now = Date.now()): void {
        if (this.startedAt === null) this.startedAt = now;
    }

    reset(initialMs = 0, running = true, now = Date.now()): void {
        this.accumulated = initialMs;
        this.startedAt = running ? now : null;
    }
}
