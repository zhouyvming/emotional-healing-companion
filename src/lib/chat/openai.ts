import toast from "svelte-french-toast";
import type { Writable } from "svelte/store";
import { datetimeNow } from "$lib/utils";
import { buildSystemPrompt, compressContext } from "$lib/chat/prompts";
import { getToken } from "$lib/client/http";
import type { ChatHistory, ChatMessage, ChatSettings } from "$lib/types/chat";

export interface ApiProvider {
	id: string;
	name: string;
	baseUrl: string;
	apiKey?: string;
	hasApiKey?: boolean;
	models: { id: string; name: string }[];
}

type OpenAIContent =
	| string
	| ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

interface OpenAIMessage {
	role: string;
	content: OpenAIContent;
}

interface ChatContext {
	messages: ChatMessage[];
	history: ChatHistory;
	stopRef: { value: boolean };
	abortRef: { value: AbortController | null };
	autoScroll: boolean;
	selectedModels: string[];
	settings: ChatSettings;
	db: any;
	chats: Writable<any[]>;
	chatId: string;
	title: string;
	notifyUpdate: () => void;
	kbId?: string;
	getKbId?: () => string;
	abortRefs?: AbortController[];
}

function getAuthHeaders() {
	const token = getToken();
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

export function describeApiError(error: unknown) {
	if (error instanceof Error) {
		if (error.name === "AbortError") return "API 请求超时，请稍后重试";
		if (/401|登录|过期/.test(error.message)) return "登录已过期，请重新登录";
		if (/403/.test(error.message)) return "API 提供商或模型无权限访问";
		if (/404/.test(error.message)) return "API 提供商、模型或接口不存在";
		if (/429|rate/i.test(error.message)) return "API 调用过于频繁，请稍后重试";
		if (/5\d\d|timeout|超时/i.test(error.message)) return "上游 API 暂时不可用，请稍后重试";
		return error.message || "未知错误";
	}
	return "未知错误";
}

function isVisionModel(model: string) {
	const name = model.toLowerCase();
	return (
		name.includes("vision") ||
		name.includes("vl") ||
		name.includes("gpt-4o") ||
		name.includes("gemini") ||
		name.includes("qwen-vl")
	);
}

function contentLength(content: OpenAIContent) {
	if (typeof content === "string") return content.length;
	return content.reduce((sum, part) => sum + (part.type === "text" ? part.text.length : 0), 0);
}

export function getProviders(): ApiProvider[] {
	try {
		return JSON.parse(localStorage.getItem("apiProviders") ?? "[]");
	} catch {
		return [];
	}
}

export function findProvider(modelName: string): ApiProvider | null {
	const parts = modelName.split("/");
	return (
		getProviders().find((p) =>
			p.models.some(
				(m) => m.id === modelName || (parts.length > 1 && m.id === parts.slice(1).join("/"))
			)
		) ?? null
	);
}

export function getAllThirdPartyModels(): { name: string; provider: string }[] {
	return getProviders().flatMap((p) => p.models.map((m) => ({ name: m.id, provider: p.name })));
}

export function getThirdPartyModels(): any[] {
	try {
		return getProviders().flatMap((p) =>
			p.models.map((m) => ({
				name: `${p.name}/${m.id}`,
				details: { family: p.name, parameter_size: "API", quantization_level: "" },
				size: 0,
				source: "third-party"
			}))
		);
	} catch {
		return [];
	}
}

export async function fetchModels(providerId: string): Promise<string[]> {
	const res = await fetch("/api/openai-compatible/models", {
		method: "POST",
		headers: getAuthHeaders(),
		body: JSON.stringify({ providerId })
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.error?.message || err.error || `HTTP ${res.status}`);
	}
	const data = await res.json();
	return (data.data ?? [])
		.map((m: any) => m.id)
		.filter(
			(id: string) => !id.startsWith("dall-e") && !id.startsWith("whisper") && !id.startsWith("tts")
		);
}

export async function sendPromptOpenAI(
	provider: ApiProvider,
	model: string,
	userPrompt: string,
	parentId: string | null,
	_chatId: string,
	ctx: ChatContext,
	onTitleSet: (t: string) => void,
	titleGuard: { generated: boolean } = { generated: false },
	getMessages: () => ChatMessage[] = () => ctx.messages,
	getAutoScroll: () => boolean = () => ctx.autoScroll,
	getTitle: () => string = () => ctx.title
) {
	const { settings, db, history, selectedModels, notifyUpdate } = ctx;
	const uuid = await import("uuid");
	const { tick } = await import("svelte");

	const responseMessageId = uuid.v4();
	const responseMessage: any = {
		parentId,
		id: responseMessageId,
		childrenIds: [],
		role: "assistant",
		content: "",
		model: `${provider.name}/${model}`,
		timestamp: datetimeNow()
	};

	history.messages[responseMessageId] = responseMessage;
	history.currentId = responseMessageId;
	if (parentId !== null) {
		history.messages[parentId].childrenIds = [
			...history.messages[parentId].childrenIds,
			responseMessageId
		];
	}
	notifyUpdate();
	await tick();
	window.scrollTo({ top: document.body.scrollHeight });

	const supportsImages = isVisionModel(model);
	let apiMessages: OpenAIMessage[] = getMessages().map((msg: any) => {
		const contentText = msg.id === parentId && msg.role === "user" ? userPrompt : msg.content;
		if (msg.images?.length) {
			if (supportsImages) {
				return {
					role: msg.role,
					content: [
						{ type: "text", text: contentText },
						...msg.images.map((img: string) => ({
							type: "image_url" as const,
							image_url: { url: img.includes(",") ? img : `data:image/jpeg;base64,${img}` }
						}))
					]
				};
			}
			return {
				role: msg.role,
				content: `${contentText}\n\n[用户上传了 ${msg.images.length} 张图片，但当前第三方模型可能不支持视觉输入。]`
			};
		}
		return { role: msg.role, content: contentText };
	});

	const systemPrompt = buildSystemPrompt(settings.systemPrompt, settings.emotionSensing);
	const { messages: compressed, truncated } = compressContext(
		apiMessages,
		systemPrompt.length,
		settings.num_ctx ?? 200000,
		(m) => contentLength(m.content)
	);
	if (truncated > 0) {
		apiMessages = compressed;
		apiMessages.unshift({
			role: "system",
			content: `[对话上下文已压缩：早期 ${truncated} 条消息已省略，以下是最近的对话内容]`
		});
	}

	const controller = new AbortController();
	if (!ctx.abortRefs) ctx.abortRefs = [];
	const abortIndex = ctx.abortRefs.length;
	ctx.abortRefs.push(controller);
	const timeout = setTimeout(() => controller.abort(), 120000);

	try {
		const payload = {
			model,
			messages: [
				...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
				...apiMessages
			] as any[],
			stream: true,
			temperature: settings.temperature ?? undefined,
			top_p: settings.top_p ?? undefined,
			max_tokens: settings.max_tokens ?? undefined,
			seed: settings.seed ?? undefined,
			stop: settings.stop || undefined
		};
		const res = await fetch("/api/openai-compatible/chat", {
			method: "POST",
			headers: getAuthHeaders(),
			body: JSON.stringify({ providerId: provider.id, payload }),
			signal: controller.signal
		});

		clearTimeout(timeout);

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.error?.message || err.error || `HTTP ${res.status}`);
		}

		const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
		let buffer = "";
		while (true) {
			const streamTimeout = setTimeout(() => {
				reader.cancel().catch(() => {});
			}, 60000);
			const { value, done } = await reader.read();
			clearTimeout(streamTimeout);
			if (done || ctx.stopRef.value || _chatId !== ctx.chatId) {
				responseMessage.done = true;
				notifyUpdate();
				break;
			}

			buffer += value;
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || !trimmed.startsWith("data: ")) continue;
				const jsonStr = trimmed.slice(6);
				if (jsonStr === "[DONE]") {
					responseMessage.done = true;
					notifyUpdate();
					break;
				}
				try {
					const data = JSON.parse(jsonStr);
					const delta = data.choices?.[0]?.delta?.content;
					if (delta) {
						responseMessage.content += delta;
						notifyUpdate();
					}
				} catch {
					/* skip malformed lines */
				}
			}

			if (getAutoScroll()) {
				window.scrollTo({ top: document.body.scrollHeight });
			}
		}
	} catch (error: any) {
		clearTimeout(timeout);
		if (error.name === "AbortError" && ctx.stopRef.value) {
			responseMessage.done = true;
			notifyUpdate();
		} else {
			const message = describeApiError(error);
			responseMessage.error = true;
			responseMessage.done = true;
			if (!responseMessage.content) {
				responseMessage.content = `API 调用失败：${message}`;
			}
			toast.error(`API 请求失败：${message}`);
			notifyUpdate();
		}
	}

	ctx.stopRef.value = false;
	ctx.abortRefs?.splice(abortIndex, 1);
	await tick();
	if (getAutoScroll()) {
		window.scrollTo({ top: document.body.scrollHeight });
	}

	const curSettings = ctx.settings;
	if (!curSettings.privacyMode) {
		await db.updateChatById(_chatId, {
			title: getTitle() || "New Chat",
			models: selectedModels,
			options: {
				temperature: curSettings.temperature ?? undefined,
				top_p: curSettings.top_p ?? undefined,
				max_tokens: curSettings.max_tokens ?? undefined,
				...(curSettings.options ?? {})
			},
			messages: getMessages(),
			history
		});
	}

	const latestMessages = getMessages();
	const needTitle = latestMessages.length === 2 || !getTitle() || getTitle() === "New Chat";
	if (needTitle && latestMessages.at(1)?.content !== "" && !titleGuard.generated) {
		titleGuard.generated = true;
		window.history.replaceState(window.history.state, "", `/chat/${_chatId}`);
		if (!curSettings.privacyMode) {
			await generateOpenAITitle(provider, model, userPrompt, _chatId, onTitleSet, settings, ctx);
		}
	}
}

async function generateOpenAITitle(
	provider: ApiProvider,
	model: string,
	userPrompt: string,
	_chatId: string,
	onTitleSet: (t: string) => void,
	settings: Record<string, any>,
	ctx: ChatContext
) {
	try {
		if (!(settings.titleAutoGenerate ?? true)) {
			await ctx.db.updateChatById(_chatId, { title: userPrompt.slice(0, 50) });
			onTitleSet(userPrompt.slice(0, 50));
			return;
		}
		try {
			const res = await fetch("/api/openai-compatible/chat", {
				method: "POST",
				headers: getAuthHeaders(),
				body: JSON.stringify({
					providerId: provider.id,
					payload: {
						model,
						messages: [
							{
								role: "user",
								content: `请根据以下对话内容生成一个简洁的标题（5个词以内）。\n语言规则：检测用户输入语言，标题使用相同语言。只回复标题文本。\n\n用户输入：${userPrompt}`
							}
						],
						max_tokens: 20,
						temperature: 0.3
					}
				})
			});
			if (!res.ok) throw new Error();
			const data = await res.json();
			const content = data.choices?.[0]?.message?.content?.trim();
			const newTitle = content ? content.slice(0, 50) : userPrompt.slice(0, 20);
			await ctx.db.updateChatById(_chatId, { title: newTitle });
			onTitleSet(newTitle);
		} catch {
			const fallback = userPrompt.slice(0, 20);
			await ctx.db.updateChatById(_chatId, { title: fallback });
			onTitleSet(fallback);
		}
	} catch (err) {
		console.error("[OpenAI 标题生成] 异常:", err);
		try {
			const fallback = userPrompt.slice(0, 20);
			await ctx.db.updateChatById(_chatId, { title: fallback });
			onTitleSet(fallback);
		} catch (e) {
			console.error("[OpenAI 标题生成] 兜底保存也失败:", e);
		}
	}
}
