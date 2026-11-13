/**
 * Standard APIs that pdf.js 6 (even its "legacy" build) and Onyx call without checking, but that
 * older system webviews lack: macOS uses the WebKit of the installed Safari, and these arrived in
 * Safari 17.4. Each one is installed only when missing, so current webviews keep the native one.
 *
 * Loaded first by the app (src/index.tsx) and by the pdf.js worker (books/pdf.worker.ts), which
 * runs in its own global scope.
 */

function define<T extends object>(target: T, name: string, value: unknown) {
    if (name in target) return;
    Object.defineProperty(target, name, { value, writable: true, configurable: true });
}

define(Promise, "withResolvers", function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
});

/**
 * A copy instead of a real transfer: the original buffer is not detached, which no caller relies
 * on (pdf.js uses it to trim a buffer it then discards).
 */
function transferCopy(this: ArrayBuffer, newLength?: number) {
    const length = newLength === undefined ? this.byteLength : Math.max(0, Math.trunc(newLength));
    const copy = new ArrayBuffer(length);
    new Uint8Array(copy).set(new Uint8Array(this, 0, Math.min(length, this.byteLength)));
    return copy;
}
define(ArrayBuffer.prototype, "transferToFixedLength", transferCopy);
define(ArrayBuffer.prototype, "transfer", transferCopy);

if (typeof AbortSignal !== "undefined" && typeof AbortController !== "undefined") {
    define(AbortSignal, "any", function any(signals: Iterable<AbortSignal>) {
        const controller = new AbortController();
        for (const signal of signals) {
            if (signal.aborted) {
                controller.abort(signal.reason);
                return controller.signal;
            }
        }
        for (const signal of signals) {
            signal.addEventListener("abort", () => controller.abort(signal.reason), {
                once: true,
                signal: controller.signal,
            });
        }
        return controller.signal;
    });
}

export {};
