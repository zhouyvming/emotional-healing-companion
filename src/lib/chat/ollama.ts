import { v4 as uuidv4 } from "uuid";
import { tick } from "svelte";
import { goto } from "$app/navigation";
import toast from "svelte-french-toast";
import { OLLAMA_API_BASE_URL } from "$lib/constants";
import {
	splitStream,
	convertMessagesToHistory,
	datetimeNow,
	removeMessageBranch
} from "$lib/utils";
import type { Writable } from "svelte/store";
import {
	findProvider,
	getLocalOpenAIModelId,
	getLocalOpenAIProvider,
	isLocalOpenAIModel,
	sendPromptOpenAI
} from "$lib/chat/openai";
import { buildSystemPrompt, compressContext } from "$lib/chat/prompts";
import { runAgent } from "$lib/agent/runner";
import type { AgentTraceStep } from "$lib/agent/types";

interface Message {
	id: string;
	parentId: string | null;
	childrenIds: string[];
	role: "user" | "assistant" | "system";
	content: string;
	images?: string[];
	files?: UploadedFile[];
	model?: string;
	timestamp?: string;
	done?: boolean;
	error?: boolean;
	context?: any;
	info?: Record<string, any>;
	agentTrace?: AgentTraceStep[];
}

interface UploadedFile {
	name: string;
	type: string;
	data: string;
	text?: string;
	parseStatus?: "pending" | "done" | "error";
	parseError?: string;
}

interface History {
	messages: Record<string, Message>;
	currentId: string | null;
}

export function copyToClipboard(text: string) {
	if (!navigator.clipboard) {
		const textArea = document.createElement("textarea");
		textArea.value = text;
		textArea.style.top = "0";
		textArea.style.left = "0";
		textArea.style.position = "fixed";
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();
		try {
			document.execCommand("copy");
		} catch {}
		document.body.removeChild(textArea);
		return;
	}
	navigator.clipboard.writeText(text).catch(() => {});
}

async function buildWebSearchContext(userPrompt: string, settings: Record<string, any>) {
	if (!settings.webSearch) return "";

	try {
		const user = JSON.parse(localStorage.getItem("user") ?? "{}");
		const token = user.token;
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (token) headers.Authorization = `Bearer ${token}`;

		const res = await fetch("/api/web-search", {
			method: "POST",
			headers,
			body: JSON.stringify({
				query: userPrompt,
				freshness: "day",
				engine: settings.searchEngine ?? "cn.bing.com",
				customUrl: settings.customSearchUrl ?? ""
			})
		});

		if (!res.ok) {
			console.warn("[联网搜索] API 返回错误", res.status);
			return "";
		}
		const data = await res.json();
		const results = Array.isArray(data.results) ? data.results.slice(0, 5) : [];
		if (results.length === 0) return "";

		const searchedAt = data.searchedAt ? `搜索时间：${data.searchedAt}\n` : "";
		const engine = data.engine ? `搜索来源：${data.engine}\n` : "";
		return (
			`${searchedAt}${engine}` +
			results
			.map(
				(result: any, index: number) =>
					`${index + 1}. ${result.title}\n来源：${result.source || ""}\n发布时间：${
						result.publishedAt || "未标注"
					}\n摘要：${result.snippet}\n链接：${result.url}`
			)
			.join("\n\n")
		);
	} catch (err) {
		console.error("[联网搜索] 检索失败:", err);
		return "";
	}
}

async function buildKnowledgeBaseContext(kbId: string, userPrompt: string) {
	if (!kbId) return "";

	try {
		const user = JSON.parse(localStorage.getItem("user") ?? "{}");
		const token = user.token;
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (token) headers.Authorization = `Bearer ${token}`;

		const res = await fetch(`/api/knowledge-bases/${kbId}/query`, {
			method: "POST",
			headers,
			body: JSON.stringify({ query: userPrompt, k: 5 })
		});

		if (!res.ok) {
			console.warn("[知识库] API 返回错误", res.status);
			return "";
		}
		const data = await res.json();
		const results = Array.isArray(data.results) ? data.results : [];
		if (results.length === 0) return "";

		const formatted = results
			.map(
				(r: any, i: number) =>
					`---片段${i + 1}（相关度${Math.round(r.score * 100)}%）---\n${r.content}`
			)
			.join("\n\n");
		return `\n参考信息：\n${formatted}`;
	} catch (err) {
		console.error("[知识库] 检索失败:", err);
		return "";
	}
}

function buildSavedChatOptions(
	settings: Record<string, any>,
	kbId: string | undefined,
	chatMode: "chat" | "agent"
) {
	const { kbId: _savedKbId, chatMode: _savedChatMode, ...modelOptions } = settings.options ?? {};
	return {
		seed: settings.seed ?? undefined,
		temperature: settings.temperature ?? undefined,
		repeat_penalty: settings.repeat_penalty ?? undefined,
		top_k: settings.top_k ?? undefined,
		top_p: settings.top_p ?? undefined,
		num_ctx: settings.num_ctx ?? undefined,
		kbId: kbId || undefined,
		chatMode,
		...modelOptions
	};
}

interface ChatContext {
	messages: Message[];
	history: History;
	title: string;
	selectedModels: string[];
	stopRef: { value: boolean };
	abortRef: { value: AbortController | null };
	abortRefs?: AbortController[];
	autoScroll: boolean;
	settings: Record<string, any>;
	db: any;
	chats: Writable<any[]>;
	chatId: string;
	isNewChat: boolean;
	notifyUpdate: () => void;
	uploadingFiles?: UploadedFile[];
	kbId?: string;
	getKbId?: () => string;
}

export function createChatHandlers(ctx: () => ChatContext) {
	const c = () => ctx();

	const setChatTitle = async (_chatId: string, _title: string) => {
		const { db, chatId, title } = c();
		await db.updateChatById(_chatId, { title: _title });
	};

	const generateChatTitle = async (
		_chatId: string,
		userPrompt: string,
		onTitleSet: (t: string) => void
	) => {
		try {
			const { settings, selectedModels } = c();
			if (!selectedModels[0]) {
				console.warn("[标题生成] 无可用模型，使用用户输入作为标题");
				await c().db.updateChatById(_chatId, { title: userPrompt.slice(0, 50) });
				onTitleSet(userPrompt.slice(0, 50));
				return;
			}
			if (settings.titleAutoGenerate ?? true) {
				if (isLocalOpenAIModel(selectedModels[0])) {
					const provider = getLocalOpenAIProvider(settings);
					const modelForTitle = getLocalOpenAIModelId(selectedModels[0]);
					const res = await fetch("/api/local-openai/chat", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${
								JSON.parse(localStorage.getItem("user") ?? "{}").token ?? ""
							}`
						},
						body: JSON.stringify({
							baseUrl: provider.baseUrl,
							apiKey: provider.apiKey,
							payload: {
								model: modelForTitle,
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
					})
						.then(async (res) => {
							if (!res.ok) throw await res.json();
							return res.json();
						})
						.catch((error) => {
							console.warn("[标题生成] 本地 OpenAI 兼容 API 请求失败:", error);
							return null;
						});
					const content = res?.choices?.[0]?.message?.content?.trim();
					const newTitle = content ? content.slice(0, 50) : userPrompt.slice(0, 20);
					await c().db.updateChatById(_chatId, { title: newTitle });
					onTitleSet(newTitle);
					return;
				}
				const modelForTitle = selectedModels[0].includes("/") ? null : selectedModels[0];
				if (!modelForTitle) {
					await c().db.updateChatById(_chatId, { title: userPrompt.slice(0, 50) });
					onTitleSet(userPrompt.slice(0, 50));
					return;
				}
				const res = await fetch(`${settings.API_BASE_URL ?? OLLAMA_API_BASE_URL}/generate`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: modelForTitle,
						prompt: `请根据以下对话内容生成一个简洁的标题（5个词以内）。

语言规则（非常重要，必须严格遵守）：
- 检测用户输入的主要语言
- 标题必须使用与用户输入完全相同的语言
- 用户输入为中文 → 标题用中文
- 用户输入为英文 → 标题用英文
- 无法确定语言时默认使用中文

只回复标题文本，不要加引号、解释或任何额外内容。

用户输入：${userPrompt}`,
						stream: false
					})
				})
					.then(async (res) => {
						if (!res.ok) throw await res.json();
						return res.json();
					})
					.catch((error) => {
						if (error && typeof error === "object" && "detail" in error) {
							console.warn("[标题生成] API 错误:", error.detail);
						} else {
							console.warn("[标题生成] API 请求失败:", error);
						}
						return null;
					});

				let newTitle: string;
				if (res && res.response) {
					newTitle = res.response.trim().slice(0, 50) || userPrompt.slice(0, 20);
				} else {
					newTitle = userPrompt.slice(0, 20);
				}
				await c().db.updateChatById(_chatId, { title: newTitle });
				onTitleSet(newTitle);
			} else {
				await c().db.updateChatById(_chatId, { title: userPrompt.slice(0, 50) });
				onTitleSet(userPrompt.slice(0, 50));
			}
		} catch (err) {
			console.error("[标题生成] 异常:", err);
			// 最终兜底：直接使用用户输入作为标题
			try {
				const fallbackTitle = userPrompt.slice(0, 20);
				await c().db.updateChatById(_chatId, { title: fallbackTitle });
				onTitleSet(fallbackTitle);
			} catch (e) {
				console.error("[标题生成] 兜底保存也失败:", e);
			}
		}
	};

	const sendPromptOllama = async (
		model: string,
		userPrompt: string,
		parentId: string | null,
		_chatId: string,
		onTitleSet: (t: string) => void,
		titleGuard: { generated: boolean } = { generated: false },
		preparedResponseId?: string
	) => {
		const ctx = c();
		const {
			settings,
			db,
			chatId,
			history,
			messages,
			title,
			selectedModels,
			autoScroll,
			uploadingFiles
		} = ctx;

		const abortController = new AbortController();
		if (!ctx.abortRefs) ctx.abortRefs = [];
		const abortIndex = ctx.abortRefs.length;
		ctx.abortRefs.push(abortController);
		let responseMessageId = preparedResponseId || uuidv4();
		let responseMessage: Message =
			preparedResponseId && history.messages[preparedResponseId]
				? history.messages[preparedResponseId]
				: {
						parentId,
						id: responseMessageId,
						childrenIds: [],
						role: "assistant",
						content: "",
						model,
						timestamp: datetimeNow()
				  };

		responseMessage.model = model;
		history.messages[responseMessageId] = responseMessage;
		history.currentId = responseMessageId;
		if (!preparedResponseId && parentId !== null) {
			history.messages[parentId].childrenIds = [
				...history.messages[parentId].childrenIds,
				responseMessageId
			];
		}
		c().notifyUpdate();

		await tick();
		if (c().autoScroll) {
			window.scrollTo({ top: document.body.scrollHeight });
		}

		// 构建消息列表（含图片，剥离 data:...;base64, 前缀）
		let apiMessages = messages
			.filter((message) => message.id !== responseMessageId)
			.map((message) => ({
				role: message.role,
				content: message.id === parentId && message.role === "user" ? userPrompt : message.content,
				...(message.images?.length
					? {
							images: message.images.map((img: string) =>
								img.includes(",") ? img.split(",")[1] : img
							)
					  }
					: {})
			}));

		const systemPrompt = buildSystemPrompt(settings.systemPrompt, settings.emotionSensing);
		const { messages: compressed, truncated } = compressContext(
			apiMessages,
			systemPrompt.length,
			settings.num_ctx ?? 200000,
			(m) => m.content?.length || 0
		);
		if (truncated > 0) {
			apiMessages = compressed;
			apiMessages.unshift({
				role: "system",
				content: `[对话上下文已压缩：早期 ${truncated} 条消息已省略，以下是最近的对话内容]`
			});
		}

		const res = await fetch(`${settings.API_BASE_URL ?? OLLAMA_API_BASE_URL}/chat`, {
			method: "POST",
			signal: abortController.signal,
			headers: { "Content-Type": "text/event-stream" },
			body: JSON.stringify({
				model,
				messages: apiMessages,
				system: systemPrompt || undefined,
				options: {
					seed: settings.seed ?? undefined,
					temperature: settings.temperature ?? undefined,
					repeat_penalty: settings.repeat_penalty ?? undefined,
					top_k: settings.top_k ?? undefined,
					top_p: settings.top_p ?? undefined,
					num_ctx: settings.num_ctx ?? undefined,
					...(settings.options ?? {})
				},
				format: settings.requestFormat ?? undefined
			})
		}).catch((err) => {
			if (err.name === "AbortError") return null;
			console.error("[Ollama] fetch 失败:", err.message || err);
			return null;
		});

		if (res && res.ok && res.body) {
			const reader = res.body
				.pipeThrough(new TextDecoderStream())
				.pipeThrough(splitStream("\n"))
				.getReader();

			try {
				while (true) {
					const { value, done } = await reader.read();
					const currentCtx = c();

					if (done || currentCtx.stopRef.value || _chatId !== currentCtx.chatId) {
						responseMessage.done = true;
						currentCtx.notifyUpdate();
						break;
					}

					try {
						let lines = value.split("\n");
						for (const line of lines) {
							if (line !== "") {
								let data = JSON.parse(line);
								if ("detail" in data) throw data;

								if (data.done === false) {
									const chunk = data.message?.content;
									if (chunk !== undefined && !(responseMessage.content === "" && chunk === "\n")) {
										responseMessage.content += chunk;
										currentCtx.notifyUpdate();
									}
								} else {
									responseMessage.done = true;
									responseMessage.context = data.context ?? null;
									responseMessage.info = {
										total_duration: data.total_duration,
										load_duration: data.load_duration,
										sample_count: data.sample_count,
										sample_duration: data.sample_duration,
										prompt_eval_count: data.prompt_eval_count,
										prompt_eval_duration: data.prompt_eval_duration,
										eval_count: data.eval_count,
										eval_duration: data.eval_duration
									};
									if (settings.responseAutoCopy) {
										copyToClipboard(responseMessage.content);
									}
									currentCtx.notifyUpdate();
								}
							}
						}
					} catch (error: any) {
						responseMessage.error = true;
						responseMessage.done = true;
						if (!responseMessage.content) {
							responseMessage.content = "响应解析失败，请重试";
						}
						if ("detail" in error) toast.error(error.detail);
						c().notifyUpdate();
						reader.cancel();
						break;
					}

					if (currentCtx.autoScroll) {
						window.scrollTo({ top: document.body.scrollHeight });
					}
				}
			} catch (err: any) {
				// 用户主动停止或连接中断，静默处理
				if (err.name !== "AbortError" || !c().stopRef.value) {
					responseMessage.error = true;
					if (!responseMessage.content) {
						responseMessage.content = "连接中断，请重试";
					}
				}
				responseMessage.done = true;
				c().notifyUpdate();
			}
		} else {
			responseMessage.error = true;
			responseMessage.done = true;
			if (res !== null) {
				try {
					const error = await res.json();
					if ("detail" in error) toast.error(error.detail);
					else if (error.error) toast.error(error.error);
					responseMessage.content = error.detail ?? error.error ?? "连接 Ollama 失败";
				} catch {
					responseMessage.content = "连接 Ollama 失败，请检查服务是否启动或 API 地址是否正确";
				}
			} else {
				responseMessage.content = "连接 Ollama 失败，请检查服务是否启动或 API 地址是否正确";
				toast.error("连接 Ollama 失败，请检查服务是否启动");
			}
			c().notifyUpdate();
		}

		c().stopRef.value = false;
		c().abortRefs?.splice(abortIndex, 1);
		await tick();
		if (c().autoScroll) {
			window.scrollTo({ top: document.body.scrollHeight });
		}

		// 隐私模式跳过保存
		const saveCtx = c();
		const curSettings = saveCtx.settings;
		if (!curSettings.privacyMode) {
			await db.updateChatById(_chatId, {
				title: saveCtx.title || "New Chat",
				models: selectedModels,
				options: buildSavedChatOptions(
					curSettings,
					saveCtx.getKbId ? saveCtx.getKbId() : saveCtx.kbId,
					"chat"
				),
				messages: saveCtx.messages,
				history
			});
		}

		const latestMessages = c().messages;
		const needTitle = latestMessages.length === 2 || !c().title || c().title === "New Chat";
		if (needTitle && latestMessages.at(1)?.content !== "" && !titleGuard.generated) {
			titleGuard.generated = true;
			window.history.replaceState(window.history.state, "", `/chat/${_chatId}`);
			if (!curSettings.privacyMode) {
				await generateChatTitle(_chatId, userPrompt, onTitleSet);
			}
		}
	};

	const sendPrompt = async (
		userPrompt: string,
		parentId: string | null,
		_chatId: string,
		onTitleSet: (t: string) => void,
		preparedResponseIds: string[] = []
	) => {
		const ctx = c();
		const { selectedModels, chats, db } = ctx;
		const titleGuard = { generated: false };
		for (const [index, model] of selectedModels.entries()) {
			const preparedResponseId = preparedResponseIds[index];
			if (isLocalOpenAIModel(model)) {
				await sendPromptOpenAI(
					getLocalOpenAIProvider(ctx.settings),
					getLocalOpenAIModelId(model),
					userPrompt,
					parentId,
					_chatId,
					ctx as any,
					onTitleSet,
					titleGuard,
					() => c().messages,
					() => c().autoScroll,
					() => c().title,
					preparedResponseId
				);
				continue;
			}
			const provider = findProvider(model);
			if (provider) {
				const actualModel = model.split("/").slice(1).join("/") || model;
				await sendPromptOpenAI(
					provider,
					actualModel,
					userPrompt,
					parentId,
					_chatId,
					ctx as any,
					onTitleSet,
					titleGuard,
					() => c().messages,
					() => c().autoScroll,
					() => c().title,
					preparedResponseId
				);
			} else {
				await sendPromptOllama(
					model,
					userPrompt,
					parentId,
					_chatId,
					onTitleSet,
					titleGuard,
					preparedResponseId
				);
			}
		}
		if (!c().settings.privacyMode) {
			await chats.set(await db.getChats());
		}
	};

	const submitAgentPrompt = async (
		userPrompt: string,
		onTitleSet: (t: string) => void,
		isNewChat: boolean
	) => {
		const ctx = c();
		const { selectedModels, messages, history, chatId, settings, db, chats, uploadingFiles } = ctx;
		const model = selectedModels[0];

		if (!model) {
			toast.error("未选择模型");
			return;
		}
		if (messages.length !== 0 && !messages.at(-1)?.done) {
			return;
		}

		document.getElementById("chat-textarea")?.style.setProperty("height", "");

		const userMessageId = uuidv4();
		const userMessage: Message = {
			id: userMessageId,
			parentId: messages.length !== 0 ? messages.at(-1)!.id : null,
			childrenIds: [],
			role: "user",
			content: userPrompt,
			timestamp: datetimeNow()
		};

		if (uploadingFiles && uploadingFiles.length > 0) {
			userMessage.images = uploadingFiles
				.filter((f) => f.type.startsWith("image/"))
				.map((f) => f.data);
			const docs = uploadingFiles.filter((f) => !f.type.startsWith("image/"));
			userMessage.files = docs.map((f) => ({
				name: f.name,
				type: f.type,
				data: f.data,
				parseStatus: f.parseStatus,
				parseError: f.parseError
			}));
		}

		if (messages.length !== 0) {
			history.messages[messages.at(-1)!.id].childrenIds.push(userMessageId);
		}
		history.messages[userMessageId] = userMessage;
		history.currentId = userMessageId;
		ctx.notifyUpdate();

		await tick();
		if (isNewChat && c().messages.length === 1) {
			if (!settings.privacyMode) {
				await db.createNewChat({
					id: chatId,
					title: "New Chat",
					models: selectedModels,
					options: buildSavedChatOptions(settings, ctx.getKbId ? ctx.getKbId() : ctx.kbId, "agent"),
					messages: c().messages,
					history
				});
			}
			window.history.replaceState(window.history.state, "", `/chat/${chatId}`);
			if (!settings.privacyMode) {
				await chats.set(await db.getChats());
			}
		}

		const responseMessageId = uuidv4();
		const responseMessage: Message = {
			parentId: userMessageId,
			id: responseMessageId,
			childrenIds: [],
			role: "assistant",
			content: "",
			model: `${model} · Agent`,
			timestamp: datetimeNow(),
			agentTrace: []
		};
		history.messages[responseMessageId] = responseMessage;
		history.messages[userMessageId].childrenIds = [
			...history.messages[userMessageId].childrenIds,
			responseMessageId
		];
		history.currentId = responseMessageId;
		ctx.notifyUpdate();

		const controller = new AbortController();
		if (!ctx.abortRefs) ctx.abortRefs = [];
		const abortIndex = ctx.abortRefs.length;
		ctx.abortRefs.push(controller);

		const contextMessages = c()
			.messages.filter((message) => message.id !== responseMessageId)
			.map((message) => ({
				role: message.role,
				content: message.content
			}));

		try {
			const result = await runAgent({
				model,
				userPrompt,
				settings,
				messages: contextMessages,
				kbId: ctx.getKbId ? ctx.getKbId() : ctx.kbId,
				uploadedFiles: uploadingFiles,
				signal: controller.signal,
				shouldStop: () => c().stopRef.value || chatId !== c().chatId,
				onTraceUpdate: (steps) => {
					responseMessage.agentTrace = steps;
					c().notifyUpdate();
				}
			});

			responseMessage.content =
				result.answer?.trim() ||
				"已完成信息整理，但模型没有返回有效正文。请调整问题后再试。";
			responseMessage.agentTrace = result.trace;
			responseMessage.done = true;
			c().notifyUpdate();
		} catch (error: any) {
			responseMessage.error = true;
			responseMessage.done = true;
			responseMessage.content =
				error?.name === "AbortError" ? "Agent 已停止。" : error.message || "Agent 执行失败";
			c().notifyUpdate();
		} finally {
			c().stopRef.value = false;
			c().abortRefs?.splice(abortIndex, 1);
		}

		await tick();
		if (c().autoScroll) {
			window.scrollTo({ top: document.body.scrollHeight });
		}

		const saveCtx = c();
		const curSettings = saveCtx.settings;
		if (!curSettings.privacyMode) {
			await db.updateChatById(chatId, {
				title: saveCtx.title || "New Chat",
				models: selectedModels,
				options: buildSavedChatOptions(
					curSettings,
					saveCtx.getKbId ? saveCtx.getKbId() : saveCtx.kbId,
					"agent"
				),
				messages: saveCtx.messages,
				history
			});
		}

		const latestMessages = c().messages;
		const needTitle = latestMessages.length === 2 || !c().title || c().title === "New Chat";
		if (needTitle && latestMessages.at(1)?.content !== "" && !curSettings.privacyMode) {
			await generateChatTitle(chatId, userPrompt, onTitleSet);
		}
		if (!curSettings.privacyMode) {
			await chats.set(await db.getChats());
		}
	};

	const submitPrompt = async (
		userPrompt: string,
		onTitleSet: (t: string) => void,
		isNewChat: boolean
	) => {
		const ctx = c();
		const { selectedModels, messages, history, chatId, settings, db, chats, uploadingFiles } = ctx;

		if (selectedModels.length === 0 || selectedModels.includes("")) {
			toast.error("未选择模型");
			return;
		}
		if (messages.length !== 0 && !messages.at(-1)?.done) {
			return;
		}

		document.getElementById("chat-textarea")?.style.setProperty("height", "");

		let userMessageId = uuidv4();
		let userMessage: Message = {
			id: userMessageId,
			parentId: messages.length !== 0 ? messages.at(-1)!.id : null,
			childrenIds: [],
			role: "user",
			content: userPrompt,
			timestamp: datetimeNow()
		};

		let finalPrompt = userPrompt;

		// 附加上传的图片和文件
		if (uploadingFiles && uploadingFiles.length > 0) {
			userMessage.images = uploadingFiles
				.filter((f) => f.type.startsWith("image/"))
				.map((f) => f.data);

			const docs = uploadingFiles.filter((f) => !f.type.startsWith("image/"));
			userMessage.files = docs.map((f) => ({
				name: f.name,
				type: f.type,
				data: f.data,
				parseStatus: f.parseStatus,
				parseError: f.parseError
			}));

			// 将已解析的文件文本注入到本次请求 prompt 中，本地消息仍只展示附件标签。
			for (const doc of docs) {
				if (doc.text) {
					finalPrompt += `\n\n[文件：${doc.name}]\n${doc.text}`;
				} else if (doc.type === "text/plain" || doc.name.endsWith(".txt")) {
					try {
						const text = atob(doc.data.includes(",") ? doc.data.split(",")[1] : doc.data);
						finalPrompt += `\n\n[文件：${doc.name}]\n${text.slice(0, 4000)}`;
					} catch {
						/* base64 decode failed, skip */
					}
				} else if (doc.parseError) {
					finalPrompt += `\n\n[用户上传了文件：${doc.name}，但解析失败：${doc.parseError}]`;
				} else {
					finalPrompt += `\n\n[用户上传了文件：${doc.name}（${
						doc.type || "未知类型"
					}），但未能提取文本内容]`;
				}
			}
		}

		if (messages.length !== 0) {
			history.messages[messages.at(-1)!.id].childrenIds.push(userMessageId);
		}

		history.messages[userMessageId] = userMessage;
		history.currentId = userMessageId;
		ctx.notifyUpdate();

		await tick();
		if (isNewChat && c().messages.length === 1) {
			const _chatId = chatId;
			if (!settings.privacyMode) {
				await db.createNewChat({
					id: _chatId,
					title: "New Chat",
					models: selectedModels,
					options: buildSavedChatOptions(settings, ctx.getKbId ? ctx.getKbId() : ctx.kbId, "chat"),
					messages: c().messages,
					history
				});
			}
			window.history.replaceState(window.history.state, "", `/chat/${_chatId}`);
			if (!settings.privacyMode) {
				await chats.set(await db.getChats());
			}
		}

		const firstModel = selectedModels[0];
		const preparedResponseIds: string[] = [];
		if (firstModel) {
			const provider = findProvider(firstModel);
			const localProvider = isLocalOpenAIModel(firstModel) ? getLocalOpenAIProvider(settings) : null;
			const displayModel = localProvider
				? `${localProvider.name}/${getLocalOpenAIModelId(firstModel)}`
				: provider
				? `${provider.name}/${firstModel.split("/").slice(1).join("/") || firstModel}`
				: firstModel;
			const responseMessageId = uuidv4();
			const responseMessage: Message = {
				id: responseMessageId,
				parentId: userMessageId,
				childrenIds: [],
				role: "assistant",
				content: "",
				model: displayModel,
				timestamp: datetimeNow()
			};
			history.messages[responseMessageId] = responseMessage;
			history.messages[userMessageId].childrenIds = [
				...history.messages[userMessageId].childrenIds,
				responseMessageId
			];
			history.currentId = responseMessageId;
			preparedResponseIds[0] = responseMessageId;
			ctx.notifyUpdate();
			await tick();
		}

		setTimeout(() => {
			window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
		}, 50);

		const kbId = ctx.getKbId ? ctx.getKbId() : ctx.kbId;
		const kbContext = await buildKnowledgeBaseContext(kbId || "", userPrompt);
		if (kbContext) {
			finalPrompt = `${finalPrompt}\n\n以下是从知识库中检索到的与用户问题相关的参考信息。请优先基于这些信息回答，如果参考信息不足以回答问题，请如实说明。\n${kbContext}`;
		} else {
			const webSearchContext = await buildWebSearchContext(userPrompt, settings);
			if (webSearchContext) {
				finalPrompt = `${finalPrompt}\n\n[联网搜索结果，仅供回答时参考，不代表本地对话历史]\n${webSearchContext}`;
			}
		}

		await sendPrompt(finalPrompt, userMessageId, chatId, onTitleSet, preparedResponseIds);
	};

	const stopResponse = () => {
		const ctx = c();
		ctx.stopRef.value = true;
		if (ctx.abortRefs && ctx.abortRefs.length > 0) {
			for (const ctrl of ctx.abortRefs) ctrl.abort();
		} else {
			ctx.abortRef.value?.abort();
		}
	};

	const regenerateResponse = async (onTitleSet: (t: string) => void) => {
		const ctx = c();
		const { messages, history, chatId } = ctx;
		if (messages.length !== 0 && messages.at(-1)?.done === true) {
			const lastMsg = messages.at(-1);
			// 从 history 中移除旧的 AI 回复及其子分支
			if (lastMsg && lastMsg.role === "assistant") {
				delete history.messages[lastMsg.id];
				if (lastMsg.parentId && history.messages[lastMsg.parentId]) {
					history.messages[lastMsg.parentId].childrenIds = history.messages[
						lastMsg.parentId
					].childrenIds.filter((cid: string) => cid !== lastMsg.id);
				}
				history.currentId = lastMsg.parentId;
			}
			ctx.notifyUpdate();
			await tick();
			let userMessage = c().messages.at(-1)!;
			await sendPrompt(userMessage.content, userMessage.id, chatId, onTitleSet);
		}
	};

	const deleteMessage = async (messageId: string) => {
		const ctx = c();
		const { history } = ctx;

		removeMessageBranch(history, messageId);

		ctx.notifyUpdate();
		await tick();
		if (!c().settings.privacyMode) {
			await c().db.updateChatById(c().chatId, {
				messages: c().messages,
				history: c().history
			});
		}
	};

	const editMessage = async (
		messageId: string,
		newContent: string,
		onTitleSet: (t: string) => void
	) => {
		const ctx = c();
		const { history, chatId } = ctx;

		const message = history.messages[messageId];
		if (!message || message.role !== "user") return;

		const removeChildren = (id: string) => {
			for (const childId of history.messages[id]?.childrenIds ?? []) {
				removeChildren(childId);
				delete history.messages[childId];
			}
			history.messages[id].childrenIds = [];
		};
		removeChildren(messageId);

		message.content = newContent;
		message.timestamp = datetimeNow();
		history.currentId = messageId;
		ctx.notifyUpdate();
		await tick();
		if (!c().settings.privacyMode) {
			await c().db.updateChatById(c().chatId, {
				messages: c().messages,
				history: c().history
			});
		}

		await sendPrompt(newContent, messageId, chatId, onTitleSet);
	};

	return {
		sendPromptOllama,
		sendPrompt,
		submitPrompt,
		submitAgentPrompt,
		generateChatTitle,
		setChatTitle,
		stopResponse,
		regenerateResponse,
		editMessage,
		deleteMessage
	};
}
