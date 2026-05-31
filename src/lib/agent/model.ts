import { OLLAMA_API_BASE_URL } from "$lib/constants";
import { getToken } from "$lib/client/http";
import {
	findProvider,
	getLocalOpenAIModelId,
	getLocalOpenAIProvider,
	isLocalOpenAIModel
} from "$lib/chat/openai";
import type { ChatSettings } from "$lib/types/chat";

interface AgentModelMessage {
	role: string;
	content: string;
}

function authHeaders() {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	const token = getToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

export async function callAgentModel(options: {
	model: string;
	settings: ChatSettings;
	messages: AgentModelMessage[];
	json?: boolean;
	signal?: AbortSignal;
}) {
	const { model, settings, messages, json, signal } = options;

	if (isLocalOpenAIModel(model)) {
		const provider = getLocalOpenAIProvider(settings);
		const actualModel = getLocalOpenAIModelId(model);
		const res = await fetch("/api/local-openai/chat", {
			method: "POST",
			headers: authHeaders(),
			signal,
			body: JSON.stringify({
				baseUrl: provider.baseUrl,
				apiKey: provider.apiKey,
				payload: {
					model: actualModel,
					messages,
					stream: false,
					temperature: settings.temperature ?? undefined,
					top_p: settings.top_p ?? undefined,
					max_tokens: settings.max_tokens ?? undefined,
					response_format: json ? { type: "json_object" } : undefined
				}
			})
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
		return String(data.choices?.[0]?.message?.content || "");
	}

	const provider = findProvider(model);
	if (provider) {
		const actualModel = model.split("/").slice(1).join("/") || model;
		const res = await fetch("/api/openai-compatible/chat", {
			method: "POST",
			headers: authHeaders(),
			signal,
			body: JSON.stringify({
				providerId: provider.id,
				payload: {
					model: actualModel,
					messages,
					stream: false,
					temperature: settings.temperature ?? undefined,
					top_p: settings.top_p ?? undefined,
					max_tokens: settings.max_tokens ?? undefined,
					response_format: json ? { type: "json_object" } : undefined
				}
			})
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
		return String(data.choices?.[0]?.message?.content || "");
	}

	const res = await fetch(`${settings.API_BASE_URL ?? OLLAMA_API_BASE_URL}/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		signal,
		body: JSON.stringify({
			model,
			messages,
			stream: false,
			format: json ? "json" : undefined,
			options: {
				seed: settings.seed ?? undefined,
				temperature: settings.temperature ?? undefined,
				repeat_penalty: settings.repeat_penalty ?? undefined,
				top_k: settings.top_k ?? undefined,
				top_p: settings.top_p ?? undefined,
				num_ctx: settings.num_ctx ?? undefined,
				...(settings.options ?? {})
			}
		})
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
	return String(data.message?.content || data.response || "");
}
