const DEFAULT_SERVER_OLLAMA_API_BASE_URL = "http://localhost:11434/api";

export function getServerOllamaApiBaseUrl() {
	return (process.env.OLLAMA_API_BASE_URL || DEFAULT_SERVER_OLLAMA_API_BASE_URL).replace(/\/+$/, "");
}

export function buildOllamaUpstreamUrl(path: string, search = "") {
	const cleanPath = path
		.split("/")
		.map((part) => encodeURIComponent(decodeURIComponent(part)))
		.join("/");
	return `${getServerOllamaApiBaseUrl()}/${cleanPath}${search}`;
}
