import { afterEach, describe, expect, it, vi } from "vitest";

type Patched = { target: object; name: string; descriptor: PropertyDescriptor | undefined };
const removed: Patched[] = [];

/** Deletes a native API, as on an old WebKit, until the test ends. */
function remove(target: object, name: string) {
    removed.push({ target, name, descriptor: Object.getOwnPropertyDescriptor(target, name) });
    delete (target as Record<string, unknown>)[name];
}

async function loadPolyfills() {
    vi.resetModules();
    await import("./polyfills");
}

afterEach(() => {
    for (const { target, name, descriptor } of removed.splice(0).reverse()) {
        if (descriptor) Object.defineProperty(target, name, descriptor);
        else delete (target as Record<string, unknown>)[name];
    }
});

describe("polyfills for older webviews", () => {
    it("keeps the native implementations where they exist", async () => {
        const withResolvers = Promise.withResolvers;
        const transfer = ArrayBuffer.prototype.transferToFixedLength;
        const any = AbortSignal.any;
        await loadPolyfills();
        expect(Promise.withResolvers).toBe(withResolvers);
        expect(ArrayBuffer.prototype.transferToFixedLength).toBe(transfer);
        expect(AbortSignal.any).toBe(any);
    });

    it("adds Promise.withResolvers", async () => {
        remove(Promise, "withResolvers");
        expect("withResolvers" in Promise).toBe(false);
        await loadPolyfills();

        const resolved = Promise.withResolvers<number>();
        resolved.resolve(3);
        await expect(resolved.promise).resolves.toBe(3);
        const rejected = Promise.withResolvers<number>();
        rejected.reject(new Error("no"));
        await expect(rejected.promise).rejects.toThrow("no");
    });

    it("adds ArrayBuffer transferToFixedLength as a trimming or padding copy", async () => {
        remove(ArrayBuffer.prototype, "transferToFixedLength");
        remove(ArrayBuffer.prototype, "transfer");
        await loadPolyfills();

        const source = new Uint8Array([1, 2, 3, 4]).buffer;
        expect([...new Uint8Array(source.transferToFixedLength(2))]).toEqual([1, 2]);
        expect([...new Uint8Array(source.transferToFixedLength(6))]).toEqual([1, 2, 3, 4, 0, 0]);
        expect([...new Uint8Array(source.transfer())]).toEqual([1, 2, 3, 4]);
    });

    it("adds AbortSignal.any", async () => {
        remove(AbortSignal, "any");
        await loadPolyfills();

        const first = new AbortController();
        const second = new AbortController();
        const combined = AbortSignal.any([first.signal, second.signal]);
        expect(combined.aborted).toBe(false);
        second.abort("stop");
        expect(combined.aborted).toBe(true);
        expect(combined.reason).toBe("stop");

        const already = new AbortController();
        already.abort("early");
        expect(AbortSignal.any([new AbortController().signal, already.signal]).reason).toBe(
            "early",
        );
    });
});
