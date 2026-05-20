import { v4 as uuidv4 } from "uuid";
import { tick } from "svelte";
import { goto } from "$app/navigation";
import toast from "svelte-french-toast";
import { OLLAMA_API_BASE_URL } from "$lib/constants";
import { splitStream, convertMessagesToHistory, datetimeNow } from "$lib/utils";
import type { Writable } from "svelte/store";
import { findProvider, sendPromptOpenAI } from "$lib/chat/openai";

interface Message {
	id: string;
	parentId: string | null;
	childrenIds: string[];
	role: "user" | "assistant" | "system";
	content: string;
	images?: string[];
	files?: { name: string; type: string; data: string }[];
	model?: string;
	timestamp?: string;
	done?: boolean;
	error?: boolean;
	context?: any;
	info?: Record<string, any>;
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

// URL 检测与抓取
async function fetchUrlContent(url: string): Promise<string | null> {
	try {
		const res = await fetch(`/api/fetch-url`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url })
		});
		if (!res.ok) return null;
		const data = await res.json();
		return data.content?.slice(0, 4000) ?? null;
	} catch {
		return null;
	}
}

	// 网页搜索（通过服务端代理，避免 CORS 和反爬拦截）
	async function webSearch(query: string): Promise<string | null> {
		try {
			const settings = JSON.parse(localStorage.getItem("settings") ?? "{}");
			const engine = settings.searchEngine || "cn.bing.com";
			const customUrl = settings.customSearchUrl || "";
			const token = JSON.parse(localStorage.getItem("user") ?? "{}").token;
			const res = await fetch("/api/web-search", {
				method: "POST",
				headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
				body: JSON.stringify({ query, engine, customUrl })
			});
			if (!res.ok) return null;
			const data = await res.json();
			if (!data.results?.length) return null;
			return data.results.map((r: any, i: number) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}`).join("\n\n");
		} catch {
			return null;
		}
	}



// 情绪分析 prompt
function getEmotionPrompt(recentMessages: string): string {
	return `[内部情绪分析指引]
请根据用户的最新消息感知其情绪状态（如开心、焦虑、悲伤、愤怒、平静等），并在回复中以温暖共情的方式适当回应。
不要直白地说"我感知到你很XX"，而是自然地用匹配用户情绪的语调来回应。
如果用户情绪低落，优先倾听和共情，不要急于给建议。`;
}

interface ChatContext {
	messages: Message[];
	history: History;
	title: string;
	selectedModels: string[];
	stopRef: { value: boolean };
	abortRef: { value: AbortController | null };
	autoScroll: boolean;
	settings: Record<string, any>;
	db: any;
	chats: Writable<any[]>;
	chatId: Writable<string>;
	isNewChat: boolean;
	notifyUpdate: () => void;
	uploadingFiles?: { name: string; data: string; type: string }[];
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
				const res = await fetch(`${settings.API_BASE_URL ?? OLLAMA_API_BASE_URL}/generate`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: selectedModels[0].split("/").pop() || selectedModels[0],
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
		titleGuard: { generated: boolean } = { generated: false }
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
		ctx.abortRef.value = abortController;
		let responseMessageId = uuidv4();
		let responseMessage: Message = {
			parentId,
			id: responseMessageId,
			childrenIds: [],
			role: "assistant",
			content: "",
			model,
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
		c().notifyUpdate();

		await tick();
		window.scrollTo({ top: document.body.scrollHeight });

		// 构建消息列表（含图片，剥离 data:...;base64, 前缀）
		const apiMessages = messages.map((message) => ({
			role: message.role,
			content: message.content,
			...(message.images?.length
				? {
						images: message.images.map((img: string) =>
							img.includes(",") ? img.split(",")[1] : img
						)
				  }
				: {})
		}));

		// 注入情绪感知 system prompt
		let systemPrompt = settings.systemPrompt ?? "";
		if (settings.emotionSensing !== false) {
			systemPrompt = systemPrompt
				? `${systemPrompt}\n\n${getEmotionPrompt(userPrompt)}`
				: getEmotionPrompt(userPrompt);
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
		}).catch((err) => (err.name === "AbortError" ? null : null));

		if (res && res.ok) {
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
			responseMessage.content = "连接 Ollama 失败，请检查服务是否启动或 API 地址是否正确";
			responseMessage.done = true;
			if (res !== null) {
				try {
					const error = await res.json();
					if ("detail" in error) toast.error(error.detail);
					else toast.error(error.error);
					responseMessage.content = error.detail ?? error.error ?? responseMessage.content;
				} catch {}
			} else {
				toast.error("连接 Ollama 失败，请检查服务是否启动");
			}
			c().notifyUpdate();
		}

		c().stopRef.value = false;
		await tick();
		if (c().autoScroll) {
			window.scrollTo({ top: document.body.scrollHeight });
		}

		// 隐私模式跳过保存
		const curSettings = c().settings;
		if (!curSettings.privacyMode) {
			await db.updateChatById(_chatId, {
				title: c().title || "New Chat",
				models: selectedModels,
				options: {
					seed: curSettings.seed ?? undefined,
					temperature: curSettings.temperature ?? undefined,
					repeat_penalty: curSettings.repeat_penalty ?? undefined,
					top_k: curSettings.top_k ?? undefined,
					top_p: curSettings.top_p ?? undefined,
					num_ctx: curSettings.num_ctx ?? undefined,
					...(curSettings.options ?? {})
				},
				messages: c().messages,
				history
			});
		}

		const latestMessages = c().messages;
		const needTitle = latestMessages.length === 2 || !c().title || c().title === "New Chat";
		if (
			needTitle &&
			latestMessages.at(1)?.content !== "" &&
			!titleGuard.generated
		) {
			titleGuard.generated = true;
			window.history.replaceState(window.history.state, "", `/c/${_chatId}`);
			if (!curSettings.privacyMode) {
				await generateChatTitle(_chatId, userPrompt, onTitleSet);
			} else {
			}
		} else {
		}
	};

	const sendPrompt = async (
		userPrompt: string,
		parentId: string | null,
		_chatId: string,
		onTitleSet: (t: string) => void
	) => {
		const ctx = c();
		const { selectedModels, chats, db } = ctx;
		const titleGuard = { generated: false };
		await Promise.all(
			selectedModels.map(async (model) => {
				// 检测第三方 API 模型（格式：提供商名/模型ID）
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
						() => c().title
					);
				} else {
					await sendPromptOllama(model, userPrompt, parentId, _chatId, onTitleSet, titleGuard);
				}
			})
		);
		if (!c().settings.privacyMode) {
			await chats.set(await db.getChats());
		}
	};

	const submitPrompt = async (
		userPrompt: string,
		onTitleSet: (t: string) => void,
		isNewChat: boolean
	) => {
		const ctx = c();
		const { selectedModels, messages, history, chatId, settings, db, uploadingFiles } = ctx;


		if (selectedModels.includes("")) {
			toast.error("未选择模型");
			return;
		}
		if (messages.length != 0 && !messages.at(-1)?.done) {
			return;
		}

		document.getElementById("chat-textarea")?.style.setProperty("height", "");

		let finalPrompt = userPrompt;

		// URL 检测与抓取
		const urlRegex = /https?:\/\/[^\s]+/g;
		const urls = userPrompt.match(urlRegex);
		if (urls && urls.length > 0) {
			toast("正在读取链接内容...");
			for (const url of urls) {
				const content = await fetchUrlContent(url);
				if (content) {
					finalPrompt = finalPrompt.replace(url, "") + `\n\n[链接内容：${url}]\n${content}`;
				}
			}
		}

		// 网页搜索
		if (settings.webSearch) {
			const searchQuery = userPrompt.replace(urlRegex, "").trim();
			if (searchQuery.length > 5) {
				toast("正在联网搜索...");
				const searchResults = await webSearch(searchQuery);
				if (searchResults) {
				finalPrompt = `[以下是根据「${searchQuery}」搜索到的网络信息，请参考这些信息回答用户问题]

${searchResults}

[用户输入]
${finalPrompt}`;
				}
			}
		}

		let userMessageId = uuidv4();
		let userMessage: Message = {
			id: userMessageId,
			parentId: messages.length !== 0 ? messages.at(-1)!.id : null,
			childrenIds: [],
			role: "user",
			content: finalPrompt,
			timestamp: datetimeNow()
		};

		// 附加上传的图片和文件
		if (uploadingFiles && uploadingFiles.length > 0) {
			userMessage.images = uploadingFiles
				.filter((f) => f.type.startsWith("image/"))
				.map((f) => f.data);

			const docs = uploadingFiles.filter((f) => !f.type.startsWith("image/"));
			userMessage.files = docs.map((f) => ({ name: f.name, type: f.type, data: f.data }));

			// 提取文本文件内容，注入到 prompt 中
			for (const doc of docs) {
				if (doc.type === "text/plain" || doc.name.endsWith(".txt")) {
					try {
						const text = atob(doc.data.includes(",") ? doc.data.split(",")[1] : doc.data);
						finalPrompt += `\n\n[文件：${doc.name}]\n${text.slice(0, 4000)}`;
					} catch {
						/* base64 decode failed, skip */
					}
				} else {
					finalPrompt += `\n\n[用户上传了文件：${doc.name}（${
						doc.type || "未知类型"
					}），但当前暂不支持解析该格式的内容]`;
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
					options: {
						seed: settings.seed ?? undefined,
						temperature: settings.temperature ?? undefined,
						repeat_penalty: settings.repeat_penalty ?? undefined,
						top_k: settings.top_k ?? undefined,
						top_p: settings.top_p ?? undefined,
						num_ctx: settings.num_ctx ?? undefined,
						...(settings.options ?? {})
					},
					messages: c().messages,
					history
				});
			}
		}

		setTimeout(() => {
			window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
		}, 50);

		await sendPrompt(finalPrompt, userMessageId, chatId, onTitleSet);
	};

	const stopResponse = () => {
		const ctx = c();
		ctx.stopRef.value = true;
		ctx.abortRef.value?.abort();
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
		const { history, messages } = ctx;

		const message = history.messages[messageId];
		if (!message) return;

		const removeChildren = (id: string) => {
			for (const childId of history.messages[id]?.childrenIds ?? []) {
				removeChildren(childId);
				delete history.messages[childId];
			}
		};
		removeChildren(messageId);

		if (message.parentId && history.messages[message.parentId]) {
			history.messages[message.parentId].childrenIds = history.messages[
				message.parentId
			].childrenIds.filter((cid) => cid !== messageId);
		}

		if (history.currentId === messageId) {
			history.currentId = message.parentId;
		}

		delete history.messages[messageId];
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
		generateChatTitle,
		setChatTitle,
		stopResponse,
		regenerateResponse,
		editMessage,
		deleteMessage
	};
}
