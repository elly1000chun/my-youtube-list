const STORAGE_KEY = "my-youtube-list:v1";
const UNCATEGORIZED_ID = "uncategorized";

const initialState = {
    categories: [],
    channelCategoryMap: {},
    hiddenVideoIds: [],
    channels: [],
    selectedCategoryId: "all",
};

let state = loadState();

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ...initialState };
        }

        const parsed = JSON.parse(raw);
        return {
            ...initialState,
            ...parsed,
            categories: Array.isArray(parsed.categories) ? parsed.categories : [],
            channelCategoryMap: parsed.channelCategoryMap || {},
            hiddenVideoIds: Array.isArray(parsed.hiddenVideoIds) ? parsed.hiddenVideoIds : [],
            channels: Array.isArray(parsed.channels) ? parsed.channels : [],
        };
    } catch {
        return { ...initialState };
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getState() {
    return structuredClone(state);
}

export function getUncategorizedId() {
    return UNCATEGORIZED_ID;
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

    state.categories.push({
        id: crypto.randomUUID(),
        name: trimmedName,
    });
    saveState();
    return getState();
}

export function deleteCategory(categoryId) {
    state.categories = state.categories.filter((category) => category.id !== categoryId);

    for (const channelId of Object.keys(state.channelCategoryMap)) {
        if (state.channelCategoryMap[channelId] === categoryId) {
            delete state.channelCategoryMap[channelId];
        }
    }

    if (state.selectedCategoryId === categoryId) {
        state.selectedCategoryId = "all";
    }

    saveState();
    return getState();
}

export function selectCategory(categoryId) {
    state.selectedCategoryId = categoryId;
    saveState();
    return getState();
}

export function assignChannelToCategory(channelId, categoryId) {
    if (!categoryId || categoryId === UNCATEGORIZED_ID) {
        delete state.channelCategoryMap[channelId];
    } else {
        state.channelCategoryMap[channelId] = categoryId;
    }

    saveState();
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
        state.hiddenVideoIds.push(videoId);
        saveState();
    }

    return getState();
}

export function unhideAllVideos() {
    state.hiddenVideoIds = [];
    saveState();
    return getState();
}
