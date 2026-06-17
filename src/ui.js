import { formatPublishedAt, formatViewCount } from "./youtube-api.js";

export function renderCategories({ container, state, videoCounts, onSelect, onDelete }) {
    const categories = [
        { id: "all", name: "전체" },
        ...state.categories,
        { id: "uncategorized", name: "미분류" },
    ];

    container.replaceChildren(
        ...categories.map((category) => {
            const item = document.createElement("div");
            item.className = "category-item";

            const button = document.createElement("button");
            button.type = "button";
            button.className = `category-button ${state.selectedCategoryId === category.id ? "active" : ""}`;
            button.addEventListener("click", () => onSelect(category.id));

            const name = document.createElement("span");
            name.className = "category-name";
            name.textContent = category.name;

            const count = document.createElement("span");
            count.textContent = String(videoCounts.get(category.id) || 0);

            button.append(name, count);
            item.append(button);

            if (category.id !== "all" && category.id !== "uncategorized") {
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "secondary-button delete-category";
                deleteButton.textContent = "x";
                deleteButton.ariaLabel = `${category.name} 삭제`;
                deleteButton.addEventListener("click", () => onDelete(category.id));
                item.append(deleteButton);
            }

            return item;
        })
    );
}

export function renderChannelManager({ container, state, onAssign }) {
    if (state.channels.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "로그인 후 구독 채널이 표시됩니다.";
        container.replaceChildren(empty);
        return;
    }

    const options = [
        { id: "uncategorized", name: "미분류" },
        ...state.categories,
    ];

    const sortedChannels = [...state.channels].sort((a, b) => {
        const aIsUncategorized = !state.channelCategoryMap[a.id];
        const bIsUncategorized = !state.channelCategoryMap[b.id];

        if (aIsUncategorized !== bIsUncategorized) {
            return aIsUncategorized ? -1 : 1;
        }

        return a.title.localeCompare(b.title, "ko-KR");
    });

    container.replaceChildren(
        ...sortedChannels.map((channel) => {
            const row = document.createElement("div");
            row.className = "channel-row";

            const title = document.createElement("span");
            title.className = "channel-title";
            title.textContent = channel.title;

            const select = document.createElement("select");
            select.ariaLabel = `${channel.title} 카테고리`;
            select.append(
                ...options.map((category) => {
                    const option = document.createElement("option");
                    option.value = category.id;
                    option.textContent = category.name;
                    return option;
                })
            );
            select.value = state.channelCategoryMap[channel.id] || "uncategorized";
            select.addEventListener("change", () => onAssign(channel.id, select.value));

            row.append(title, select);
            return row;
        })
    );
}

export function renderVideos({ container, emptyState, videos, onPlay, onHide }) {
    emptyState.classList.toggle("hidden", videos.length > 0);

    container.replaceChildren(
        ...videos.map((video) => {
            const card = document.createElement("article");
            card.className = "video-card";

            const thumbnailButton = document.createElement("button");
            thumbnailButton.type = "button";
            thumbnailButton.className = "thumbnail-button";
            thumbnailButton.addEventListener("click", () => onPlay(video));

            const img = document.createElement("img");
            img.src = video.thumbnail;
            img.alt = "";
            img.loading = "lazy";

            const duration = document.createElement("span");
            duration.className = "duration-badge";
            duration.textContent = video.durationLabel;

            thumbnailButton.append(img, duration);

            const body = document.createElement("div");
            body.className = "video-body";

            const title = document.createElement("h3");
            title.className = "video-title";
            title.textContent = video.title;

            const meta = document.createElement("div");
            meta.className = "video-meta";
            meta.append(
                textNode(video.channelTitle),
                textNode(`조회수 ${formatViewCount(video.viewCount)}회`),
                textNode(formatPublishedAt(video.publishedAt))
            );

            const description = document.createElement("p");
            description.className = "video-description";
            description.textContent = video.description || "설명 없음";

            const actions = document.createElement("div");
            actions.className = "video-actions";

            const playButton = document.createElement("button");
            playButton.type = "button";
            playButton.className = "video-action";
            playButton.textContent = "재생";
            playButton.addEventListener("click", () => onPlay(video));

            const openButton = document.createElement("a");
            openButton.className = "video-action";
            openButton.href = `https://www.youtube.com/watch?v=${video.id}`;
            openButton.target = "_blank";
            openButton.rel = "noreferrer";
            openButton.textContent = "YouTube에서 열기";

            const hideButton = document.createElement("button");
            hideButton.type = "button";
            hideButton.className = "video-action";
            hideButton.textContent = "목록에서 제외";
            hideButton.addEventListener("click", () => onHide(video.id));

            actions.append(playButton, openButton, hideButton);
            body.append(title, meta, description, actions);
            card.append(thumbnailButton, body);
            return card;
        })
    );
}

export function openPlayer({ dialog, frame, titleElement, video }) {
    titleElement.textContent = video.title;
    frame.replaceChildren();

    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${video.id}?autoplay=1`;
    iframe.title = video.title;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    frame.append(iframe);

    if (dialog.showModal) {
        dialog.showModal();
    }
}

export function closePlayer({ dialog, frame }) {
    frame.replaceChildren();
    if (dialog.open) {
        dialog.close();
    }
}

function textNode(text) {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
}
