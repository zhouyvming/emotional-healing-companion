import { isPrivateUrl } from "$lib/utils";

export function normalizeLocalOpenAIBaseUrl(baseUrl: string) {
	const url = new URL(baseUrl);
	if (!["https:", "http:"].includes(url.protocol)) {
		throw new Error("仅支持 HTTP/HTTPS 本地 API 地址");
	}
	if (!isPrivateUrl(url.toString())) {
		throw new Error("本地 OpenAI 兼容后端只允许使用本机或内网地址");
	}
	return url.toString().replace(/\/+$/, "");
}

export function assertNotSameOriginLocalBackend(baseUrl: string, requestUrl: string) {
	const target = new URL(baseUrl);
	const current = new URL(requestUrl);
	if (target.origin === current.origin) {
		throw new Error(
			"本地 OpenAI 兼容后端不能使用当前应用地址。当前项目运行在该端口，请把 vLLM/llama.cpp/LM Studio 改到其他端口，例如 LM Studio 1234、vLLM 8000、llama.cpp 8081。"
		);
	}
}

export function localOpenAIHeaders(apiKey?: string) {
	const headers: Record<string, string> = {
		"Content-Type": "application/json"
	};
	if (apiKey?.trim()) {
		headers.Authorization = `Bearer ${apiKey.trim()}`;
	}
	return headers;
}
