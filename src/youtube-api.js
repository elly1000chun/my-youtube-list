const API_BASE_URL = "https://www.googleapis.com/youtube/v3";
const RECENT_DAYS = 3;
const SHORTS_MAX_SECONDS = 180;

export function getRecentDays() {
    return RECENT_DAYS;
}

export function parseIsoDuration(duration) {
    const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) {
        return 0;
    }

    const [, hours = "0", minutes = "0", seconds = "0"] = match;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

export function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Number(totalSeconds) || 0);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatViewCount(viewCount) {
    const count = Number(viewCount || 0);
    return new Intl.NumberFormat("ko-KR", { notation: "compact" }).format(count);
}

export function formatPublishedAt(publishedAt) {
    const formatter = new Intl.DateTimeFormat("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
    return formatter.format(new Date(publishedAt));
}

async function youtubeFetch(path, accessToken, params = {}) {
    const url = new URL(`${API_BASE_URL}/${path}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, value);
        }
    });

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message = errorBody.error?.message || `${response.status} ${response.statusText}`;
        throw new Error(message);
    }

    return response.json();
}

async function listAllPages(path, accessToken, params) {
    const items = [];
    let pageToken = "";

    do {
        const data = await youtubeFetch(path, accessToken, {
            ...params,
            pageToken,
        });
        items.push(...(data.items || []));
        pageToken = data.nextPageToken || "";
    } while (pageToken);

    return items;
}

export async function fetchSubscriptions(accessToken) {
    const subscriptions = await listAllPages("subscriptions", accessToken, {
        part: "snippet,contentDetails",
        mine: "true",
        maxResults: "50",
        order: "alphabetical",
    });

    return subscriptions
        .map((subscription) => ({
            id: subscription.snippet?.resourceId?.channelId,
            title: subscription.snippet?.title || "이름 없는 채널",
            description: subscription.snippet?.description || "",
            thumbnail: getBestThumbnail(subscription.snippet?.thumbnails),
            publishedAt: subscription.snippet?.publishedAt || "",
        }))
        .filter((channel) => Boolean(channel.id));
}

export async function fetchRecentVideos(accessToken, channels) {
    const publishedAfter = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const searchResults = await runWithConcurrency(channels, 6, (channel) =>
        searchChannelVideos(accessToken, channel.id, publishedAfter)
    );
    const videoIds = [...new Set(searchResults.flat().map((item) => item.id?.videoId).filter(Boolean))];

    if (videoIds.length === 0) {
        return [];
    }

    const details = await fetchVideoDetails(accessToken, videoIds);
    return details
        .map(normalizeVideo)
        .filter((video) => video.durationSeconds > SHORTS_MAX_SECONDS)
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function searchChannelVideos(accessToken, channelId, publishedAfter) {
    const data = await youtubeFetch("search", accessToken, {
        part: "snippet",
        channelId,
        maxResults: "10",
        order: "date",
        publishedAfter,
        type: "video",
    });

    return data.items || [];
}

async function fetchVideoDetails(accessToken, videoIds) {
    const chunks = [];
    for (let index = 0; index < videoIds.length; index += 50) {
        chunks.push(videoIds.slice(index, index + 50));
    }

    const responses = await runWithConcurrency(chunks, 4, (chunk) =>
        youtubeFetch("videos", accessToken, {
            part: "snippet,contentDetails,statistics,status",
            id: chunk.join(","),
            maxResults: "50",
        })
    );

    return responses.flatMap((response) => response.items || []);
}

function normalizeVideo(video) {
    const durationSeconds = parseIsoDuration(video.contentDetails?.duration || "PT0S");

    return {
        id: video.id,
        title: video.snippet?.title || "제목 없음",
        description: video.snippet?.description || "",
        channelId: video.snippet?.channelId || "",
        channelTitle: video.snippet?.channelTitle || "알 수 없는 채널",
        publishedAt: video.snippet?.publishedAt || "",
        thumbnail: getBestThumbnail(video.snippet?.thumbnails),
        durationSeconds,
        durationLabel: formatDuration(durationSeconds),
        viewCount: video.statistics?.viewCount || "0",
        embeddable: video.status?.embeddable !== false,
    };
}

function getBestThumbnail(thumbnails = {}) {
    return thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || "";
}

async function runWithConcurrency(items, limit, task) {
    const results = new Array(items.length);
    let cursor = 0;

    async function worker() {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await task(items[index], index);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}
