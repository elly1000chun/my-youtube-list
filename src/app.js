import { clearAccessToken, getAccessToken, hasAccessToken, initAuth, isConfigured, requestAccessToken } from "./auth.js";
import { addCategory, assignChannelToCategory, deleteCategory, getState, hideVideo, selectCategory, syncChannels } from "./store.js";
import { fetchRecentVideos, fetchSubscriptions, getRecentDays } from "./youtube-api.js";
import { closePlayer, openPlayer, renderCategories, renderChannelManager, renderVideos } from "./ui.js";

const elements = {
    loginButton: document.querySelector("#login-button"),
    logoutButton: document.querySelector("#logout-button"),
    refreshButton: document.querySelector("#refresh-button"),
    statusText: document.querySelector("#status-text"),
    categoryForm: document.querySelector("#category-form"),
    categoryName: document.querySelector("#category-name"),
    categoryList: document.querySelector("#category-list"),
    channelManager: document.querySelector("#channel-manager"),
    channelCount: document.querySelector("#channel-count"),
    uncategorizedCount: document.querySelector("#uncategorized-count"),
    currentFilterTitle: document.querySelector("#current-filter-title"),
    videoSearch: document.querySelector("#video-search"),
    videoList: document.querySelector("#video-list"),
    emptyState: document.querySelector("#empty-state"),
    playerDialog: document.querySelector("#player-dialog"),
    playerFrame: document.querySelector("#player-frame"),
    playerTitle: document.querySelector("#player-title"),
    closePlayer: document.querySelector("#close-player"),
};

let videos = [];
let isLoading = false;

window.addEventListener("load", () => {
    init();
});

function init() {
    bindEvents();
    render();

    if (!isConfigured()) {
        setStatus("config.example.js를 복사해 config.js를 만들고 Google OAuth Client ID를 설정하세요.");
        return;
    }

    initAuth({
        onToken: () => {
            setSignedIn(true);
            loadDashboard();
        },
        onError: (error) => setStatus(error.message),
    });
}

function bindEvents() {
    elements.loginButton.addEventListener("click", () => {
        try {
            requestAccessToken();
        } catch (error) {
            setStatus(error.message);
        }
    });

    elements.logoutButton.addEventListener("click", () => {
        clearAccessToken();
        videos = [];
        setSignedIn(false);
        setStatus("로그아웃했습니다.");
        render();
    });

    elements.refreshButton.addEventListener("click", () => {
        loadDashboard();
    });

    elements.categoryForm.addEventListener("submit", (event) => {
        event.preventDefault();
        addCategory(elements.categoryName.value);
        elements.categoryName.value = "";
        render();
    });

    elements.videoSearch.addEventListener("input", () => {
        render();
    });

    elements.closePlayer.addEventListener("click", () => {
        closePlayer({
            dialog: elements.playerDialog,
            frame: elements.playerFrame,
        });
    });

    elements.playerDialog.addEventListener("close", () => {
        elements.playerFrame.replaceChildren();
    });
}

async function loadDashboard() {
    if (!hasAccessToken() || isLoading) {
        return;
    }

    isLoading = true;
    setLoading(true);

    try {
        setStatus("구독 채널을 동기화하고 있습니다.");
        const channels = await fetchSubscriptions(getAccessToken());
        syncChannels(channels);
        render();

        setStatus(`최근 ${getRecentDays()}일 동안 업로드된 영상을 불러오고 있습니다.`);
        videos = await fetchRecentVideos(getAccessToken(), channels);
        setStatus(`${channels.length}개 채널에서 ${videos.length}개 영상을 찾았습니다. Shorts 후보는 제외했습니다.`);
    } catch (error) {
        if (/401|unauthorized|invalid credentials/i.test(error.message)) {
            clearAccessToken();
            setSignedIn(false);
            setStatus("인증이 만료되었습니다. 다시 로그인하세요.");
        } else {
            setStatus(error.message);
        }
    } finally {
        isLoading = false;
        setLoading(false);
        render();
    }
}

function render() {
    const state = getState();
    const filteredVideos = getVisibleVideos(state);
    const videoCounts = getVideoCounts(state);
    const selectedCategory = getSelectedCategory(state);
    const uncategorizedChannelCount = state.channels.filter((channel) => !state.channelCategoryMap[channel.id]).length;

    elements.channelCount.textContent = `${state.channels.length}개 채널`;
    elements.uncategorizedCount.textContent = `미분류 ${uncategorizedChannelCount}개`;
    elements.currentFilterTitle.textContent = selectedCategory.name === "전체" ? "전체 최신 영상" : `${selectedCategory.name} 최신 영상`;

    renderCategories({
        container: elements.categoryList,
        state,
        videoCounts,
        onSelect: (categoryId) => {
            selectCategory(categoryId);
            render();
        },
        onDelete: (categoryId) => {
            deleteCategory(categoryId);
            render();
        },
    });

    renderChannelManager({
        container: elements.channelManager,
        state,
        onAssign: (channelId, categoryId) => {
            assignChannelToCategory(channelId, categoryId);
            render();
        },
    });

    renderVideos({
        container: elements.videoList,
        emptyState: elements.emptyState,
        videos: filteredVideos,
        onPlay: (video) =>
            openPlayer({
                dialog: elements.playerDialog,
                frame: elements.playerFrame,
                titleElement: elements.playerTitle,
                video,
            }),
        onHide: (videoId) => {
            hideVideo(videoId);
            render();
        },
    });
}

function getVisibleVideos(state) {
    const query = elements.videoSearch.value.trim().toLowerCase();
    const hiddenVideoIds = new Set(state.hiddenVideoIds);

    return videos.filter((video) => {
        if (hiddenVideoIds.has(video.id)) {
            return false;
        }

        if (!isVideoInSelectedCategory(video, state)) {
            return false;
        }

        if (!query) {
            return true;
        }

        return `${video.title} ${video.channelTitle}`.toLowerCase().includes(query);
    });
}

function getVideoCounts(state) {
    const counts = new Map([
        ["all", 0],
        ["uncategorized", 0],
    ]);

    for (const category of state.categories) {
        counts.set(category.id, 0);
    }

    for (const video of videos) {
        if (state.hiddenVideoIds.includes(video.id)) {
            continue;
        }

        const categoryId = state.channelCategoryMap[video.channelId] || "uncategorized";
        counts.set("all", (counts.get("all") || 0) + 1);
        counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
    }

    return counts;
}

function getSelectedCategory(state) {
    if (state.selectedCategoryId === "all") {
        return { id: "all", name: "전체" };
    }

    if (state.selectedCategoryId === "uncategorized") {
        return { id: "uncategorized", name: "미분류" };
    }

    return state.categories.find((category) => category.id === state.selectedCategoryId) || { id: "all", name: "전체" };
}

function isVideoInSelectedCategory(video, state) {
    if (state.selectedCategoryId === "all") {
        return true;
    }

    const categoryId = state.channelCategoryMap[video.channelId] || "uncategorized";
    return categoryId === state.selectedCategoryId;
}

function setStatus(message) {
    elements.statusText.textContent = message;
}

function setLoading(nextIsLoading) {
    elements.refreshButton.disabled = nextIsLoading || !hasAccessToken();
    elements.refreshButton.textContent = nextIsLoading ? "불러오는 중" : "새로고침";
}

function setSignedIn(isSignedIn) {
    elements.loginButton.classList.toggle("hidden", isSignedIn);
    elements.logoutButton.classList.toggle("hidden", !isSignedIn);
    elements.refreshButton.disabled = !isSignedIn;
}
