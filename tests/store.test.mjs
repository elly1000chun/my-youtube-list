import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

if (!globalThis.crypto) {
    Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: webcrypto,
    });
}

class MemoryStorage {
    #items = new Map();

    getItem(key) {
        return this.#items.has(key) ? this.#items.get(key) : null;
    }

    setItem(key, value) {
        this.#items.set(key, String(value));
    }

    removeItem(key) {
        this.#items.delete(key);
    }
}

test("unhideVideo restores one hidden video and keeps other hidden videos", async () => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: new MemoryStorage(),
    });

    const store = await import(`../src/store.js?test=${Date.now()}`);

    store.hideVideo("keep-hidden");
    store.hideVideo("restore-me");
    const restored = store.unhideVideo("restore-me");

    assert.deepEqual(restored.hiddenVideoIds, ["keep-hidden"]);
    assert.equal(restored.hiddenVideos["restore-me"], undefined);
    assert.ok(restored.hiddenVideos["keep-hidden"]);
});
