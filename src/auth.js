const SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/drive.appdata",
].join(" ");

const SESSION_KEY = "my-youtube-list:google-session";

let tokenClient = null;
let accessToken = "";
let nextRequestIsSilent = false;

export function getAccessToken() {
    return accessToken;
}

export function hasAccessToken() {
    return Boolean(accessToken);
}

export function clearAccessToken({ forgetSession = true } = {}) {
    accessToken = "";
    if (forgetSession) {
        localStorage.removeItem(SESSION_KEY);
    }
}

export function isConfigured() {
    return Boolean(window.APP_CONFIG?.googleClientId);
}

export function hasSavedSession() {
    return localStorage.getItem(SESSION_KEY) === "true";
}

export function initAuth({ onToken, onError }) {
    if (!isConfigured()) {
        onError?.(new Error("config.js에 googleClientId가 설정되어 있지 않습니다."));
        return;
    }

    if (!window.google?.accounts?.oauth2) {
        onError?.(new Error("Google Identity Services 스크립트를 불러오지 못했습니다."));
        return;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: window.APP_CONFIG.googleClientId,
        scope: SCOPES,
        callback: (response) => {
            const isSilentRequest = nextRequestIsSilent;
            nextRequestIsSilent = false;

            if (response?.error) {
                if (isSilentRequest) {
                    return;
                }
                onError?.(new Error(response.error));
                return;
            }

            accessToken = response.access_token;
            localStorage.setItem(SESSION_KEY, "true");
            onToken?.(response);
        },
    });
}

export function requestAccessToken({ prompt, silent = false } = {}) {
    if (!tokenClient) {
        throw new Error("인증 클라이언트가 초기화되지 않았습니다.");
    }

    nextRequestIsSilent = silent;
    tokenClient.requestAccessToken({ prompt: prompt ?? (accessToken ? "" : "consent") });
}
