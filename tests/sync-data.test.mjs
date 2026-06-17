import assert from "node:assert/strict";
import test from "node:test";

import { mergeSyncData } from "../src/sync-data.mjs";

const NOW = Date.parse("2026-01-10T00:00:00.000Z");

function baseState(overrides = {}) {
    return {
        categories: [],
        categoryTombstones: [],
        channelCategoryMap: {},
        channelCategoryUpdatedAt: {},
        hiddenVideoIds: [],
        hiddenVideos: {},
        channels: [],
        selectedCategoryId: "all",
        sync: {},
        ...overrides,
    };
}

test("merges duplicate categories by normalized name and relinks channel mappings", () => {
    const merged = mergeSyncData(
        baseState({
            categories: [
                {
                    id: "local-tech",
                    name: "Tech",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-02T00:00:00.000Z",
                },
            ],
            channelCategoryMap: { channelA: "local-tech" },
            channelCategoryUpdatedAt: { channelA: "2026-01-02T00:00:00.000Z" },
        }),
        {
            categories: [
                {
                    id: "remote-tech",
                    name: "tech",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-03T00:00:00.000Z",
                },
            ],
            channelCategories: {
                channelA: {
                    categoryId: "remote-tech",
                    updatedAt: "2026-01-04T00:00:00.000Z",
                },
            },
        },
        { now: NOW }
    );

    assert.equal(merged.categories.length, 1);
    assert.equal(merged.categories[0].id, "remote-tech");
    assert.equal(merged.channelCategoryMap.channelA, "remote-tech");
});

test("uses the latest channel category assignment", () => {
    const merged = mergeSyncData(
        baseState({
            categories: [
                { id: "cat-a", name: "A", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
                { id: "cat-b", name: "B", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
            ],
            channelCategoryMap: { channelA: "cat-a" },
            channelCategoryUpdatedAt: { channelA: "2026-01-03T00:00:00.000Z" },
        }),
        {
            categories: [
                { id: "cat-a", name: "A", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
                { id: "cat-b", name: "B", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
            ],
            channelCategories: {
                channelA: {
                    categoryId: "cat-b",
                    updatedAt: "2026-01-04T00:00:00.000Z",
                },
            },
        },
        { now: NOW }
    );

    assert.equal(merged.channelCategoryMap.channelA, "cat-b");
});

test("keeps recent hidden videos and prunes expired hidden videos", () => {
    const merged = mergeSyncData(
        baseState({
            hiddenVideos: {
                localRecent: { hiddenAt: "2026-01-09T00:00:00.000Z" },
            },
        }),
        {
            hiddenVideos: {
                remoteOld: { hiddenAt: "2026-01-01T00:00:00.000Z" },
                remoteRecent: { hiddenAt: "2026-01-08T00:00:00.000Z" },
            },
        },
        { recentDays: 3, now: NOW }
    );

    assert.deepEqual(new Set(merged.hiddenVideoIds), new Set(["localRecent", "remoteRecent"]));
});

test("category tombstones prevent older deleted categories from returning", () => {
    const merged = mergeSyncData(
        baseState({
            categoryTombstones: [
                {
                    id: "music",
                    name: "Music",
                    normalizedName: "music",
                    deletedAt: "2026-01-05T00:00:00.000Z",
                },
            ],
        }),
        {
            categories: [
                {
                    id: "music",
                    name: "Music",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-04T00:00:00.000Z",
                },
            ],
        },
        { now: NOW }
    );

    assert.equal(merged.categories.length, 0);
});

test("latest uncategorized channel change wins over older remote assignment", () => {
    const merged = mergeSyncData(
        baseState({
            categories: [
                { id: "cat-a", name: "A", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
            ],
            channelCategoryUpdatedAt: {
                channelA: "2026-01-05T00:00:00.000Z",
            },
        }),
        {
            categories: [
                { id: "cat-a", name: "A", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
            ],
            channelCategories: {
                channelA: {
                    categoryId: "cat-a",
                    updatedAt: "2026-01-04T00:00:00.000Z",
                },
            },
        },
        { now: NOW }
    );

    assert.equal(merged.channelCategoryMap.channelA, undefined);
});
