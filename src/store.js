import { createSyncDataFromState, mergeSyncData, pruneHiddenVideoData } from "./sync-data.mjs";

const STORAGE_KEY = "my-youtube-list:v2";
const LEGACY_STORAGE_KEY = "my-youtube-list:v1";
const UNCATEGORIZED_ID = "uncategorized";
const DEFAULT_HIDDEN_VIDEO_RETENTION_DAYS = 3;
const DEFAULT_CATEGORY_NAMES = ["LOL", "Music"];

const initialState = {
    categories: [],
    categoryTombstones: [],
    channelCategoryMap: {},
    channelCategoryUpdatedAt: {},
    hiddenVideoIds: [],
    hiddenVideos: {},
    channels: [],
    selectedCategoryId: "all",
    includeShorts: true,
    sync: {
        status: "pending",
        lastSyncedAt: "",
        lastError: "",
        fileId: "",
    },
};

let state = loadState();
const listeners = new Set();
saveState();

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!raw) {
            return normalizeState(initialState);
        }

        return normalizeState(JSON.parse(raw));
    } catch {
        return normalizeState(initialState);
    }
}

function normalizeState(rawState) {
    const now = new Date().toISOString();
    const parsed = rawState && typeof rawState === "object" ? rawState : {};
    const hidden = pruneHiddenVideoData(parsed.hiddenVideos, parsed.hiddenVideoIds, {
        recentDays: DEFAULT_HIDDEN_VIDEO_RETENTION_DAYS,
    });

    const normalized = {
        ...initialState,
        ...parsed,
        categories: Array.isArray(parsed.categories)
            ? parsed.categories
                  .map((category) => ({
                      id: String(category.id),
                      name: String(category.name || "").trim(),
                      createdAt: normalizeDate(category.createdAt, now),
                      updatedAt: normalizeDate(category.updatedAt, now),
                  }))
                  .filter((category) => category.id && category.name)
            : [],
        categoryTombstones: Array.isArray(parsed.categoryTombstones) ? parsed.categoryTombstones : [],
        channelCategoryMap: parsed.channelCategoryMap || {},
        channelCategoryUpdatedAt: parsed.channelCategoryUpdatedAt || {},
        hiddenVideoIds: hidden.hiddenVideoIds,
        hiddenVideos: hidden.hiddenVideos,
        channels: Array.isArray(parsed.channels) ? parsed.channels : [],
        selectedCategoryId: parsed.selectedCategoryId || "all",
        includeShorts: typeof parsed.includeShorts === "boolean" ? parsed.includeShorts : true,
        sync: {
            ...initialState.sync,
            ...(parsed.sync || {}),
        },
    };

    ensureDefaultCategories(normalized);
    return normalized;
}

function saveState({ notifySync = false } = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    if (notifySync) {
        for (const listener of listeners) {
            listener(getState());
        }
    }
}

function markPendingChange() {
    state.sync = {
        ...state.sync,
        status: "pending",
        lastError: "",
    };
}

function timestamp() {
    return new Date().toISOString();
}

function normalizeDate(value, fallback) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function tombstoneKey(category) {
    return String(category.normalizedName || category.name || "").trim().toLocaleLowerCase("ko-KR");
}

function createCategory(name, now = timestamp()) {
    return {
        id: crypto.randomUUID(),
        name,
        createdAt: now,
        updatedAt: now,
    };
}

function ensureDefaultCategories(nextState) {
    if (nextState.categories.length > 0) {
        return;
    }

    const now = timestamp();
    nextState.categories = DEFAULT_CATEGORY_NAMES.map((name) => createCategory(name, now));
}

export function getState() {
    return structuredClone(state);
}

export function getUncategorizedId() {
    return UNCATEGORIZED_ID;
}

export function subscribeToSyncChanges(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getSyncData({ recentDays = DEFAULT_HIDDEN_VIDEO_RETENTION_DAYS } = {}) {
    return createSyncDataFromState(state, { recentDays });
}

export function mergeRemoteSyncData(remoteData, { recentDays = DEFAULT_HIDDEN_VIDEO_RETENTION_DAYS } = {}) {
    state = normalizeState(mergeSyncData(state, remoteData, { recentDays }));
    saveState();
    return getState();
}

export function setSyncStatus(status, { lastError = "", fileId = "" } = {}) {
    state.sync = {
        ...state.sync,
        status,
        lastError,
        fileId: fileId || state.sync.fileId,
        lastSyncedAt: status === "synced" ? timestamp() : state.sync.lastSyncedAt,
    };
    saveState();
    return getState();
}

export function pruneHiddenVideos(recentDays = DEFAULT_HIDDEN_VIDEO_RETENTION_DAYS) {
    const hidden = pruneHiddenVideoData(state.hiddenVideos, state.hiddenVideoIds, { recentDays });
    state.hiddenVideos = hidden.hiddenVideos;
    state.hiddenVideoIds = hidden.hiddenVideoIds;
    saveState({ notifySync: true });
    return getState();
}

export function addCategory(name) {
    const trimmedName = name.trim();
    if (!trimmedName) {
        return state;
    }

    const exists = state.categories.some((category) => category.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
        return state;
    }

    state.categories.push(createCategory(trimmedName));
    markPendingChange();
    saveState({ notifySync: true });
    return getState();
}

export function resetUserData() {
    state = normalizeState(initialState);
    markPendingChange();
    saveState({ notifySync: true });
    return getState();
}

export function deleteCategory(categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);
    if (!category) {
        return getState();
    }

    const deletedAt = timestamp();
    state.categories = state.categories.filter((item) => item.id !== categoryId);
    state.categoryTombstones = [
        ...state.categoryTombstones.filter((item) => tombstoneKey(item) !== tombstoneKey(category)),
        {
            id: category.id,
            name: category.name,
            normalizedName: tombstoneKey(category),
            deletedAt,
        },
    ];

    for (const channelId of Object.keys(state.channelCategoryMap)) {
        if (state.channelCategoryMap[channelId] === categoryId) {
            delete state.channelCategoryMap[channelId];
            state.channelCategoryUpdatedAt[channelId] = deletedAt;
        }
    }

    if (state.selectedCategoryId === categoryId) {
        state.selectedCategoryId = "all";
    }

    markPendingChange();
    saveState({ notifySync: true });
    return getState();
}

export function selectCategory(categoryId) {
    state.selectedCategoryId = categoryId;
    saveState();
    return getState();
}

export function setIncludeShorts(includeShorts) {
    state.includeShorts = Boolean(includeShorts);
    saveState();
    return getState();
}

export function assignChannelToCategory(channelId, categoryId) {
    if (!categoryId || categoryId === UNCATEGORIZED_ID) {
        delete state.channelCategoryMap[channelId];
    } else {
        state.channelCategoryMap[channelId] = categoryId;
    }

    state.channelCategoryUpdatedAt[channelId] = timestamp();
    markPendingChange();
    saveState({ notifySync: true });
    return getState();
}

export function syncChannels(channels) {
    const sortedChannels = [...channels].sort((a, b) => a.title.localeCompare(b.title));
    const knownChannelIds = new Set(sortedChannels.map((channel) => channel.id));

    for (const channelId of Object.keys(state.channelCategoryMap)) {
        if (!knownChannelIds.has(channelId)) {
            delete state.channelCategoryMap[channelId];
        }
    }

    state.channels = sortedChannels;
    saveState();
    return getState();
}

export function hideVideo(videoId) {
    if (!state.hiddenVideoIds.includes(videoId)) {
        const hiddenAt = timestamp();
        state.hiddenVideoIds.push(videoId);
        state.hiddenVideos[videoId] = { hiddenAt };
        markPendingChange();
        saveState({ notifySync: true });
    }

    return getState();
}

export function unhideVideo(videoId) {
    if (state.hiddenVideoIds.includes(videoId)) {
        state.hiddenVideoIds = state.hiddenVideoIds.filter((id) => id !== videoId);
        delete state.hiddenVideos[videoId];
        markPendingChange();
        saveState({ notifySync: true });
    }

    return getState();
}

export function unhideAllVideos() {
    state.hiddenVideoIds = [];
    state.hiddenVideos = {};
    markPendingChange();
    saveState({ notifySync: true });
    return getState();
}
