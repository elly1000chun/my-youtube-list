import assert from "node:assert/strict";
import test from "node:test";

import { fetchRecentVideos } from "../src/youtube-api.js";

const FIXED_NOW = Date.parse("2026-06-17T00:00:00.000Z");

test("fetchRecentVideos uses uploads playlists instead of search.list", async () => {
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    const calls = [];

    Date.now = () => FIXED_NOW;
    globalThis.fetch = async (url) => {
        const requestUrl = new URL(url);
        const path = requestUrl.pathname.split("/").pop();
        const params = requestUrl.searchParams;
        calls.push({ path, params: Object.fromEntries(params.entries()) });

        if (path === "channels") {
            const ids = params.get("id").split(",");
            assert.equal(ids.length <= 50, true);

            return jsonResponse({
                items: ids
                    .filter((id) => ["channel-1", "channel-2", "channel-3"].includes(id))
                    .map((id) => ({
                        id,
                        contentDetails:
                            id === "channel-2"
                                ? { relatedPlaylists: {} }
                                : { relatedPlaylists: { uploads: `uploads-${id}` } },
                    })),
            });
        }

        if (path === "playlistItems") {
            assert.equal(params.get("maxResults"), "5");

            if (params.get("playlistId") === "uploads-channel-3") {
                return jsonResponse({ error: { message: "playlist unavailable" } }, 500);
            }

            return jsonResponse({
                items: [
                    { contentDetails: { videoId: "recent-long" } },
                    { snippet: { resourceId: { videoId: "recent-duplicate" } } },
                    { contentDetails: { videoId: "recent-duplicate" } },
                    { contentDetails: { videoId: "old-long" } },
                    { contentDetails: { videoId: "recent-short" } },
                ],
            });
        }

        if (path === "videos") {
            assert.equal(params.get("id"), "recent-long,recent-duplicate,old-long,recent-short");

            return jsonResponse({
                items: [
                    videoDetail("recent-long", "2026-06-16T00:00:00.000Z", "PT5M"),
                    videoDetail("recent-duplicate", "2026-06-15T12:00:00.000Z", "PT10M"),
                    videoDetail("old-long", "2026-06-01T00:00:00.000Z", "PT8M"),
                    videoDetail("recent-short", "2026-06-16T00:00:00.000Z", "PT2M"),
                ],
            });
        }

        return jsonResponse({ error: { message: `Unexpected path: ${path}` } }, 404);
    };

    try {
        const channels = Array.from({ length: 51 }, (_, index) => ({ id: `channel-${index + 1}` }));
        const videos = await fetchRecentVideos("token", channels);

        assert.deepEqual(
            videos.map((video) => video.id),
            ["recent-long", "recent-duplicate"]
        );

        const channelCalls = calls.filter((call) => call.path === "channels");
        assert.equal(channelCalls.length, 2);
        assert.equal(channelCalls[0].params.id.split(",").length, 50);
        assert.equal(channelCalls[1].params.id.split(",").length, 1);

        const playlistCalls = calls.filter((call) => call.path === "playlistItems");
        assert.equal(playlistCalls.length, 2);
        assert.deepEqual(
            playlistCalls.map((call) => call.params.playlistId).sort(),
            ["uploads-channel-1", "uploads-channel-3"]
        );

        assert.equal(calls.some((call) => call.path === "search"), false);
    } finally {
        globalThis.fetch = originalFetch;
        Date.now = originalNow;
    }
});

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function videoDetail(id, publishedAt, duration) {
    return {
        id,
        snippet: {
            title: id,
            description: "",
            channelId: "channel-1",
            channelTitle: "Channel 1",
            publishedAt,
            thumbnails: {},
        },
        contentDetails: { duration },
        statistics: { viewCount: "1" },
        status: { embeddable: true },
    };
}
