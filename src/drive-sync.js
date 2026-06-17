import {
    getSyncData,
    mergeRemoteSyncData,
    setSyncStatus,
    subscribeToSyncChanges,
} from "./store.js";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const SETTINGS_FILE_NAME = "my-youtube-list-settings.json";
const SETTINGS_MIME_TYPE = "application/json";
const RETRY_DELAY_MS = 15000;
const SAVE_DEBOUNCE_MS = 700;

let controller = null;

export function startSettingsSync({ accessToken, recentDays, onStatus, onStateChanged }) {
    stopSettingsSync();

    controller = createSettingsSyncController({
        accessToken,
        recentDays,
        onStatus,
        onStateChanged,
    });
    controller.start();
    return controller;
}

export function stopSettingsSync() {
    controller?.stop();
    controller = null;
}

function createSettingsSyncController({ accessToken, recentDays, onStatus, onStateChanged }) {
    let fileId = "";
    let stopped = false;
    let isSaving = false;
    let debounceTimer = 0;
    let retryTimer = 0;
    let unsubscribe = null;

    async function start() {
        unsubscribe = subscribeToSyncChanges(() => scheduleSave());

        try {
            updateStatus("syncing");
            fileId = await findSettingsFile(accessToken);

            if (fileId) {
                const remoteData = await downloadSettings(accessToken, fileId);
                mergeRemoteSyncData(remoteData, { recentDays });
                onStateChanged?.();
                await uploadCurrentSettings();
            } else {
                fileId = await createSettingsFile(accessToken);
                await uploadCurrentSettings();
            }
        } catch (error) {
            handleFailure(error);
        }
    }

    function stop() {
        stopped = true;
        unsubscribe?.();
        clearTimeout(debounceTimer);
        clearTimeout(retryTimer);
    }

    function scheduleSave() {
        if (stopped) {
            return;
        }

        updateStatus("pending");
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            uploadCurrentSettings().catch(handleFailure);
        }, SAVE_DEBOUNCE_MS);
    }

    async function uploadCurrentSettings() {
        if (stopped || isSaving) {
            return;
        }

        isSaving = true;
        clearTimeout(retryTimer);

        try {
            updateStatus("syncing");
            if (!fileId) {
                fileId = (await findSettingsFile(accessToken)) || (await createSettingsFile(accessToken));
            }

            await uploadSettings(accessToken, fileId, getSyncData({ recentDays }));
            updateStatus("synced", { fileId });
        } finally {
            isSaving = false;
        }
    }

    function handleFailure(error) {
        if (stopped) {
            return;
        }

        updateStatus("failed", { lastError: error.message || String(error), fileId });
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
            uploadCurrentSettings().catch(handleFailure);
        }, RETRY_DELAY_MS);
    }

    function updateStatus(status, options = {}) {
        setSyncStatus(status, options);
        onStatus?.(status, options.lastError || "");
    }

    return { start, stop, scheduleSave };
}

async function findSettingsFile(accessToken) {
    const query = `name='${SETTINGS_FILE_NAME.replaceAll("'", "\\'")}'`;
    const params = new URLSearchParams({
        spaces: "appDataFolder",
        pageSize: "10",
        fields: "files(id,name,modifiedTime)",
        q: query,
    });
    const data = await driveFetch(accessToken, `${DRIVE_API_BASE}/files?${params}`);
    const files = [...(data.files || [])].sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
    return files[0]?.id || "";
}

async function downloadSettings(accessToken, fileId) {
    const params = new URLSearchParams({ alt: "media" });
    const response = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message = errorBody.error?.message || `${response.status} ${response.statusText}`;
        throw new Error(message);
    }

    const text = await response.text();
    if (!text.trim()) {
        return {};
    }

    return JSON.parse(text);
}

async function createSettingsFile(accessToken) {
    const data = await driveFetch(accessToken, `${DRIVE_API_BASE}/files?fields=id,name`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: SETTINGS_FILE_NAME,
            mimeType: SETTINGS_MIME_TYPE,
            parents: ["appDataFolder"],
        }),
    });

    return data.id;
}

async function uploadSettings(accessToken, fileId, syncData) {
    const params = new URLSearchParams({
        uploadType: "media",
        fields: "id,modifiedTime",
    });
    return driveFetch(accessToken, `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?${params}`, {
        method: "PATCH",
        headers: {
            "Content-Type": SETTINGS_MIME_TYPE,
        },
        body: JSON.stringify(syncData),
    });
}

async function driveFetch(accessToken, url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {}),
        },
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message = errorBody.error?.message || `${response.status} ${response.statusText}`;
        throw new Error(message);
    }

    if (response.status === 204) {
        return {};
    }

    return response.json();
}
