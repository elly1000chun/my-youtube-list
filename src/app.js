import { clearAccessToken, getAccessToken, hasAccessToken, hasSavedSession, initAuth, isConfigured, requestAccessToken } from "./auth.js";
import { startSettingsSync, stopSettingsSync } from "./drive-sync.js";
import { addCategory, assignChannelToCategory, deleteCategory, getState, hideVideo, pruneHiddenVideos, resetUserData, selectCategory, setIncludeShorts, syncChannels } from "./store.js";
import { fetchRecentVideos, fetchSubscriptions, getRecentDays, isShortsCandidate } from "./youtube-api.js";
import { closePlayer, openPlayer, renderCategories, renderChannelManager, renderVideos } from "./ui.js";

const elements = {
    loginButton: document.querySelector("#login-button"),
    logoutButton: document.querySelector("#logout-button"),
    refreshButton: document.querySelector("#refresh-button"),
    statusText: document.querySelector("#status-text"),
    syncStatus: document.querySelector("#sync-status"),
    appVersion: document.querySelector("#app-version"),
    categoryForm: document.querySelector("#category-form"),
    categoryName: document.querySelector("#category-name"),
    categoryList: document.querySelector("#category-list"),
    channelManagerToggle: document.querySelector("#channel-manager-toggle"),
    channelPanel: document.querySelector("#channel-panel"),
    resetDataButton: document.querySelector("#reset-data-button"),
    channelManager: document.querySelector("#channel-manager"),
    channelCount: document.querySelector("#channel-count"),
    uncategorizedCount: document.querySelector("#uncategorized-count"),
    currentFilterTitle: document.querySelector("#current-filter-title"),
    includeShorts: document.querySelector("#include-shorts"),
    videoSearch: document.querySelector("#video-search"),
    videoList: document.querySelector("#video-list"),
    emptyState: document.querySelector("#empty-state"),
    emptyStateTitle: document.querySelector("#empty-state-title"),
    emptyStateDescription: document.querySelector("#empty-state-description"),
    playerDialog: document.querySelector("#player-dialog"),
    playerFrame: document.querySelector("#player-frame"),
    playerTitle: document.querySelector("#player-title"),
    closePlayer: document.querySelector("#close-player"),
};

let videos = [];
let isLoading = false;
let hasLoadedVideos = false;
let isChannelManagerOpen = false;

window.addEventListener("load", () => {
    init();
});

function init() {
    bindEvents();
    loadAppVersion();
    render();

    if (!isConfigured()) {
        setStatus("config.example.js를 복사해 config.js를 만들고 Google OAuth Client ID를 설정하세요.");
        return;
    }

    initAuth({
        onToken: () => {
            setSignedIn(true);
            startSettingsSync({
                accessToken: getAccessToken(),
                recentDays: getRecentDays(),
                onStatus: setSyncStatusText,
                onStateChanged: render,
            });
            loadDashboard();
        },
        onError: (error) => setStatus(error.message),
    });

    if (hasSavedSession()) {
        requestAccessToken({ prompt: "", silent: true });
    }
}

async function loadAppVersion() {
    if (!elements.appVersion) {
        return;
    }

    try {
        const response = await fetch("./version.json", { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        elements.appVersion.textContent = data.version ? `v${data.version}` : "";
    } catch {
        elements.appVersion.textContent = "";
    }
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
        stopSettingsSync();
        clearAccessToken();
        videos = [];
        hasLoadedVideos = false;
        setSignedIn(false);
        setSyncStatusText("");
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

    elements.resetDataButton.addEventListener("click", () => {
        const confirmed = confirm("모든 카테고리, 채널 분류, 제외한 영상 기록을 삭제할까요?");
        if (!confirmed) {
            return;
        }

        videos = [];
        hasLoadedVideos = false;
        elements.videoSearch.value = "";
        resetUserData();
        render();
    });

    elements.channelManagerToggle.addEventListener("click", () => {
        isChannelManagerOpen = !isChannelManagerOpen;
        render();
    });

    elements.videoSearch.addEventListener("input", () => {
        render();
    });

    elements.includeShorts.addEventListener("change", () => {
        setIncludeShorts(elements.includeShorts.checked);
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
    pruneHiddenVideos(getRecentDays());

    try {
        setStatus("구독 채널을 동기화하고 있습니다.");
        const channels = await fetchSubscriptions(getAccessToken());
        syncChannels(channels);
        render();

        setStatus(`최근 ${getRecentDays()}일 동안 업로드된 영상을 불러오고 있습니다.`);
        videos = await fetchRecentVideos(getAccessToken(), channels);
        hasLoadedVideos = true;
        setStatus(`${channels.length}개 채널에서 ${videos.length}개 영상을 찾았습니다.`);
    } catch (error) {
        if (/401|unauthorized|invalid credentials/i.test(error.message)) {
            clearAccessToken();
            setSignedIn(false);
            hasLoadedVideos = false;
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
    setSyncStatusText(hasAccessToken() ? state.sync.status : "", state.sync.lastError);
    const filteredVideos = getVisibleVideos(state);
    const videoCounts = getVideoCounts(state);
    const selectedCategory = getSelectedCategory(state);
    const uncategorizedChannelCount = state.channels.filter((channel) => !state.channelCategoryMap[channel.id]).length;

    elements.includeShorts.checked = state.includeShorts;
    elements.channelCount.textContent = `${state.channels.length}개 채널`;
    elements.uncategorizedCount.textContent = `미분류 ${uncategorizedChannelCount}개`;
    elements.currentFilterTitle.textContent = selectedCategory.name === "전체" ? "전체 최신 영상" : `${selectedCategory.name} 최신 영상`;
    elements.channelPanel.classList.toggle("hidden", !isChannelManagerOpen);
    elements.channelManagerToggle.textContent = isChannelManagerOpen ? "채널 분류 닫기" : "채널 분류 편집";
    elements.channelManagerToggle.setAttribute("aria-expanded", String(isChannelManagerOpen));

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
        emptyStateTitle: elements.emptyStateTitle,
        emptyStateDescription: elements.emptyStateDescription,
        emptyStateContent: getEmptyStateContent(state, filteredVideos, selectedCategory),
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

        if (!state.includeShorts && isShortsCandidate(video)) {
            return false;
        }

        if (!query) {
            return true;
        }

        return `${video.title} ${video.channelTitle}`.toLowerCase().includes(query);
    });
}

function getEmptyStateContent(state, filteredVideos, selectedCategory) {
    if (filteredVideos.length > 0) {
        return { title: "", description: "" };
    }

    if (!hasAccessToken()) {
        return {
            title: "아직 불러온 영상이 없습니다.",
            description: "Google 로그인 후 구독 채널의 최신 업로드를 확인하세요.",
        };
    }

    if (isLoading) {
        return {
            title: "영상을 불러오는 중입니다.",
            description: "구독 채널의 최신 업로드를 확인하고 있습니다.",
        };
    }

    if (hasLoadedVideos && videos.length === 0) {
        return {
            title: "최신 영상이 없습니다.",
            description: `최근 ${getRecentDays()}일 동안 구독 채널에 새로 올라온 영상이 없습니다.`,
        };
    }

    if (!hasLoadedVideos) {
        return {
            title: "아직 불러온 영상이 없습니다.",
            description: "새로고침을 눌러 구독 채널의 최신 업로드를 확인하세요.",
        };
    }

    const hiddenVideoIds = new Set(state.hiddenVideoIds);
    const query = elements.videoSearch.value.trim();
    const selectedCategoryVideos = videos.filter((video) => isVideoInSelectedCategory(video, state));
    const selectedVisibleBeforeShorts = selectedCategoryVideos.filter((video) => !hiddenVideoIds.has(video.id));
    const selectedVisibleBeforeSearch = selectedVisibleBeforeShorts.filter((video) => state.includeShorts || !isShortsCandidate(video));
    const allVideosAreHidden = videos.length > 0 && videos.every((video) => hiddenVideoIds.has(video.id));

    if (allVideosAreHidden) {
        return {
            title: "모든 동영상이 제외되었습니다.",
            description: "목록에서 제외한 동영상은 사용자 데이터 삭제 전까지 다시 표시되지 않습니다.",
        };
    }

    if (selectedCategoryVideos.length === 0 && selectedCategory.id !== "all") {
        return {
            title: `${selectedCategory.name} 최신 영상이 없습니다.`,
            description: "다른 카테고리를 선택하거나 채널 분류를 조정해 보세요.",
        };
    }

    if (selectedCategoryVideos.length > 0 && selectedVisibleBeforeShorts.length === 0) {
        return {
            title: "선택한 카테고리의 모든 동영상이 제외되었습니다.",
            description: "다른 카테고리를 선택하거나 전체 최신 영상을 확인해 보세요.",
        };
    }

    if (selectedVisibleBeforeShorts.length > 0 && selectedVisibleBeforeSearch.length === 0) {
        return {
            title: "쇼츠 제외 설정으로 표시할 영상이 없습니다.",
            description: "쇼츠 포함을 켜면 짧은 영상을 다시 볼 수 있습니다.",
        };
    }

    if (query && selectedVisibleBeforeSearch.length > 0) {
        return {
            title: "검색 결과가 없습니다.",
            description: "다른 영상 제목이나 채널명으로 검색해 보세요.",
        };
    }

    return {
        title: "표시할 영상이 없습니다.",
        description: "필터 조건을 바꾸거나 새로고침해 보세요.",
    };
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

        if (!state.includeShorts && isShortsCandidate(video)) {
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

function setSyncStatusText(status, errorMessage = "") {
    if (!elements.syncStatus) {
        return;
    }

    const labels = {
        pending: "저장 대기",
        syncing: "저장 중",
        synced: "저장됨",
        failed: "동기화 실패",
    };

    elements.syncStatus.textContent = labels[status] || "";
    elements.syncStatus.title = errorMessage || "";
    elements.syncStatus.dataset.status = status || "";
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
