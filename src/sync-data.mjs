export const SYNC_SCHEMA_VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

export function createEmptySyncData() {
    return {
        schemaVersion: SYNC_SCHEMA_VERSION,
        updatedAt: new Date(0).toISOString(),
        categories: [],
        categoryTombstones: [],
        channelCategories: {},
        hiddenVideos: {},
    };
}

export function normalizeCategoryName(name) {
    return String(name || "").trim().toLocaleLowerCase("ko-KR");
}

export function createSyncDataFromState(state, { recentDays = 3, now = Date.now() } = {}) {
    const cutoff = now - recentDays * DAY_MS;
    const hiddenVideos = normalizeHiddenVideos(state.hiddenVideos, state.hiddenVideoIds, now, cutoff);

    return {
        schemaVersion: SYNC_SCHEMA_VERSION,
        updatedAt: new Date(now).toISOString(),
        categories: normalizeCategories(state.categories),
        categoryTombstones: normalizeCategoryTombstones(state.categoryTombstones),
        channelCategories: normalizeChannelCategories(state.channelCategoryMap, state.channelCategoryUpdatedAt, now),
        hiddenVideos,
    };
}

export function mergeSyncData(localState, remoteData, { recentDays = 3, now = Date.now() } = {}) {
    const local = createSyncDataFromState(localState, { recentDays, now });
    const remote = normalizeSyncData(remoteData, { now });
    const cutoff = now - recentDays * DAY_MS;

    const tombstones = mergeTombstones(local.categoryTombstones, remote.categoryTombstones);
    const categoryResult = mergeCategories(local.categories, remote.categories, tombstones);
    const channelCategories = mergeChannelCategories(
        local.channelCategories,
        remote.channelCategories,
        categoryResult.idAliases,
        new Set(categoryResult.categories.map((category) => category.id))
    );
    const hiddenVideos = mergeHiddenVideos(local.hiddenVideos, remote.hiddenVideos, cutoff);

    return {
        ...localState,
        categories: categoryResult.categories,
        categoryTombstones: tombstones,
        channelCategoryMap: Object.fromEntries(
            Object.entries(channelCategories).map(([channelId, entry]) => [channelId, entry.categoryId])
        ),
        channelCategoryUpdatedAt: Object.fromEntries(
            Object.entries(channelCategories).map(([channelId, entry]) => [channelId, entry.updatedAt])
        ),
        hiddenVideos,
        hiddenVideoIds: Object.keys(hiddenVideos),
    };
}

export function pruneHiddenVideoData(hiddenVideos, hiddenVideoIds, { recentDays = 3, now = Date.now() } = {}) {
    const cutoff = now - recentDays * DAY_MS;
    const nextHiddenVideos = normalizeHiddenVideos(hiddenVideos, hiddenVideoIds, now, cutoff);
    return {
        hiddenVideos: nextHiddenVideos,
        hiddenVideoIds: Object.keys(nextHiddenVideos),
    };
}

function normalizeSyncData(data, { now = Date.now() } = {}) {
    if (!data || typeof data !== "object") {
        return createEmptySyncData();
    }

    return {
        schemaVersion: SYNC_SCHEMA_VERSION,
        updatedAt: validIso(data.updatedAt, now),
        categories: normalizeCategories(data.categories),
        categoryTombstones: normalizeCategoryTombstones(data.categoryTombstones),
        channelCategories: normalizeChannelCategoriesFromRemote(data.channelCategories, now),
        hiddenVideos: normalizeHiddenVideos(data.hiddenVideos, data.hiddenVideoIds, now, -Infinity),
    };
}

function normalizeCategories(categories = []) {
    if (!Array.isArray(categories)) {
        return [];
    }

    return categories
        .map((category) => {
            const name = String(category?.name || "").trim();
            const normalizedName = normalizeCategoryName(name);
            if (!name || !normalizedName) {
                return null;
            }

            const updatedAt = validIso(category.updatedAt, Date.now());
            return {
                id: String(category.id || cryptoRandomId()),
                name,
                normalizedName,
                createdAt: validIso(category.createdAt, Date.parse(updatedAt)),
                updatedAt,
            };
        })
        .filter(Boolean);
}

function normalizeCategoryTombstones(tombstones = {}) {
    const values = Array.isArray(tombstones) ? tombstones : Object.values(tombstones);

    return values
        .map((tombstone) => {
            const name = String(tombstone?.name || "").trim();
            const normalizedName = normalizeCategoryName(tombstone?.normalizedName || name);
            if (!normalizedName) {
                return null;
            }

            return {
                id: tombstone.id ? String(tombstone.id) : "",
                name,
                normalizedName,
                deletedAt: validIso(tombstone.deletedAt, Date.now()),
            };
        })
        .filter(Boolean);
}

function normalizeChannelCategories(channelCategoryMap = {}, channelCategoryUpdatedAt = {}, now = Date.now()) {
    const channelIds = new Set([...Object.keys(channelCategoryMap || {}), ...Object.keys(channelCategoryUpdatedAt || {})]);

    return Object.fromEntries(
        [...channelIds].map((channelId) => [
                channelId,
                {
                    categoryId: channelCategoryMap?.[channelId] ? String(channelCategoryMap[channelId]) : "",
                    updatedAt: validIso(channelCategoryUpdatedAt?.[channelId], now),
                },
            ])
    );
}

function normalizeChannelCategoriesFromRemote(channelCategories = {}, now = Date.now()) {
    return Object.fromEntries(
        Object.entries(channelCategories || {})
            .map(([channelId, value]) => {
                if (typeof value === "string") {
                    return [channelId, { categoryId: value, updatedAt: validIso("", now) }];
                }

                if (!value || typeof value !== "object") {
                    return null;
                }

                return [
                    channelId,
                    {
                        categoryId: value.categoryId ? String(value.categoryId) : "",
                        updatedAt: validIso(value.updatedAt, now),
                    },
                ];
            })
            .filter(Boolean)
    );
}

function normalizeHiddenVideos(hiddenVideos = {}, hiddenVideoIds = [], now = Date.now(), cutoff = -Infinity) {
    const merged = {};

    for (const [videoId, value] of Object.entries(hiddenVideos || {})) {
        const hiddenAt = validIso(value?.hiddenAt || value, now);
        if (Date.parse(hiddenAt) >= cutoff) {
            merged[videoId] = { hiddenAt };
        }
    }

    if (Array.isArray(hiddenVideoIds)) {
        for (const videoId of hiddenVideoIds) {
            if (!merged[videoId] && String(videoId).trim()) {
                merged[String(videoId)] = { hiddenAt: new Date(now).toISOString() };
            }
        }
    }

    return merged;
}

function mergeTombstones(localTombstones, remoteTombstones) {
    const byName = new Map();

    for (const tombstone of [...localTombstones, ...remoteTombstones]) {
        const current = byName.get(tombstone.normalizedName);
        if (!current || Date.parse(tombstone.deletedAt) > Date.parse(current.deletedAt)) {
            byName.set(tombstone.normalizedName, tombstone);
        }
    }

    return [...byName.values()];
}

function mergeCategories(localCategories, remoteCategories, tombstones) {
    const tombstoneByName = new Map(tombstones.map((tombstone) => [tombstone.normalizedName, tombstone]));
    const byName = new Map();
    const idAliases = new Map();

    for (const category of [...localCategories, ...remoteCategories]) {
        const tombstone = tombstoneByName.get(category.normalizedName);
        if (tombstone && Date.parse(tombstone.deletedAt) >= Date.parse(category.updatedAt)) {
            idAliases.set(category.id, "");
            continue;
        }

        const current = byName.get(category.normalizedName);
        if (!current) {
            byName.set(category.normalizedName, category);
            continue;
        }

        const winner = Date.parse(category.updatedAt) > Date.parse(current.updatedAt) ? category : current;
        const loser = winner === category ? current : category;
        idAliases.set(loser.id, winner.id);
        byName.set(category.normalizedName, {
            ...winner,
            createdAt: earlierIso(winner.createdAt, loser.createdAt),
        });
    }

    for (const category of byName.values()) {
        idAliases.set(category.id, category.id);
    }

    const categories = [...byName.values()].sort((a, b) => {
        const createdDiff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
        return createdDiff || a.name.localeCompare(b.name, "ko-KR");
    });

    return { categories, idAliases };
}

function mergeChannelCategories(localEntries, remoteEntries, idAliases, categoryIds) {
    const merged = {};

    for (const [channelId, entry] of Object.entries({ ...localEntries, ...remoteEntries })) {
        const localEntry = localEntries[channelId];
        const remoteEntry = remoteEntries[channelId];
        const winner = latestEntry(localEntry, remoteEntry);
        const aliasedCategoryId = idAliases.get(winner.categoryId) ?? winner.categoryId;

        if (aliasedCategoryId && categoryIds.has(aliasedCategoryId)) {
            merged[channelId] = {
                categoryId: aliasedCategoryId,
                updatedAt: winner.updatedAt,
            };
        }
    }

    return merged;
}

function mergeHiddenVideos(localHiddenVideos, remoteHiddenVideos, cutoff) {
    const merged = {};

    for (const [videoId, entry] of Object.entries({ ...localHiddenVideos, ...remoteHiddenVideos })) {
        const winner = latestEntry(localHiddenVideos[videoId], remoteHiddenVideos[videoId]);
        if (Date.parse(winner.hiddenAt) >= cutoff) {
            merged[videoId] = { hiddenAt: winner.hiddenAt };
        }
    }

    return merged;
}

function latestEntry(left, right) {
    if (!left) {
        return right;
    }

    if (!right) {
        return left;
    }

    const leftTime = Date.parse(left.updatedAt || left.hiddenAt || "");
    const rightTime = Date.parse(right.updatedAt || right.hiddenAt || "");
    return rightTime > leftTime ? right : left;
}

function validIso(value, fallbackTime) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
        return new Date(parsed).toISOString();
    }

    return new Date(fallbackTime || Date.now()).toISOString();
}

function earlierIso(left, right) {
    return Date.parse(left) <= Date.parse(right) ? left : right;
}

function cryptoRandomId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `category-${Math.random().toString(36).slice(2)}`;
}
