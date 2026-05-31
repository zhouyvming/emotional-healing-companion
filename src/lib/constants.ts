export const OLLAMA_API_BASE_URL = "/api/ollama";
export const LEGACY_BROWSER_OLLAMA_API_BASE_URL = "http://localhost:11434/api";
export function normalizeOllamaApiBaseUrl(value?: unknown) {
	if (typeof value !== "string" || value.trim() === "") return OLLAMA_API_BASE_URL;
	const trimmed = value.trim().replace(/\/+$/, "");
	return trimmed === LEGACY_BROWSER_OLLAMA_API_BASE_URL ? OLLAMA_API_BASE_URL : trimmed;
}
export function toUserOllamaApiBaseUrl(value?: unknown) {
	if (typeof value !== "string" || value.trim() === "") return "";
	const normalized = normalizeOllamaApiBaseUrl(value);
	return normalized === OLLAMA_API_BASE_URL ? "" : normalized;
}
export const LOCAL_OPENAI_API_BASE_URL = "http://localhost:1234/v1";
export const LOCAL_OPENAI_MODEL_PREFIX = "local/";
export const LOCAL_OPENAI_PROVIDER_ID = "__local_openai__";
export const LOCAL_OPENAI_PROVIDER_NAME = "本地兼容";
export const WEB_UI_VERSION = "v0.0.1-lite";
