<script lang="ts">
	import { marked } from "marked";
	import tippy from "tippy.js";
	import hljs from "highlight.js";
	import "highlight.js/styles/github-dark.min.css";
	import auto_render from "katex/dist/contrib/auto-render.mjs";
	import "katex/dist/katex.min.css";

	import { chatId, db, user, settings } from "$lib/stores";
	import { tick, onDestroy } from "svelte";
	import { copyToClipboard } from "$lib/chat/ollama";
	import toast from "svelte-french-toast";
	import DOMPurify from "dompurify";

	const purifyConfig = {
		ALLOWED_TAGS: ["a", "b", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
			"hr", "i", "img", "li", "ol", "p", "pre", "span", "strong", "table", "tbody",
			"td", "th", "thead", "tr", "ul", "blockquote", "sup", "sub", "del", "input", "math",
			"semantics", "mrow", "mi", "mo", "mn", "msup", "mfrac", "msqrt", "munder", "mover",
			"mtable", "mtr", "mtd"],
		ALLOWED_ATTR: ["href", "target", "class", "id", "style", "checked", "type", "disabled"],
		ALLOW_DATA_ATTR: false
	};

	export let regenerateResponse: Function;
	export let submitPrompt: Function = () => {};
	export let stopResponse: Function = () => {};
	export let autoScroll;
	export let selectedModels;
	export let prompt = "";
	export let uploadingFiles: { name: string; data: string; type: string }[] = [];
	export let history: any = {};
	export let messages: any[] = [];
	export let onBranchNavigate: () => Promise<void> = async () => {};
	export let editMessage: Function = async () => {};
	export let deleteMessage: Function = async () => {};
	let editingMessageId: string | null = null;
	let editContent = "";

	const suggestedTopics = [
		{ emoji: "💭", text: "今天心情不太好，想聊聊天" },
		{ emoji: "❤️", text: "最近有些焦虑，需要一些安慰" },
		{ emoji: "🌟", text: "分享一件今天发生的小事" },
		{ emoji: "🫂", text: "感到孤单，想要有人陪" },
		{ emoji: "🌈", text: "告诉我一些让人开心的话" },
		{ emoji: "🧠", text: "帮我分析一下最近的情绪" }
	];

	const moodOptions = [
		{ emoji: "😊", label: "开心", score: 5 },
		{ emoji: "😌", label: "平静", score: 4 },
		{ emoji: "😐", label: "一般", score: 3 },
		{ emoji: "😔", label: "低落", score: 2 },
		{ emoji: "😢", label: "难过", score: 1 }
	];

	function fillPrompt(text: string) {
		const ta = document.getElementById("chat-textarea") as HTMLTextAreaElement | null;
		if (ta) {
			ta.value = text;
			ta.dispatchEvent(new Event("input", { bubbles: true }));
			ta.focus();
		}
	}

	$: if (messages && messages.length > 0 && (messages.at(-1).done ?? false)) {
		(async () => {
			await tick();
			renderLatex();
			highlightNewCodeBlocks();
			createCopyCodeBlockButton();
			for (const message of messages) {
				if (message.info) {
					const el = document.getElementById(`info-${message.id}`);
					if (el && !el.hasAttribute("data-tippy-added")) {
						el.setAttribute("data-tippy-added", "true");
						tippy(`#info-${message.id}`, {
							content: `<span class="text-xs">token/s: ${
								Math.round(
									((message.info.eval_count ?? 0) / (message.info.eval_duration / 1000000000)) * 100
								) / 100
							} tokens<br/>
								total_duration: ${Math.round(((message.info.total_duration ?? 0) / 1000000) * 100) / 100}ms<br/>
								load_duration: ${Math.round(((message.info.load_duration ?? 0) / 1000000) * 100) / 100}ms<br/>
								prompt_eval_count: ${message.info.prompt_eval_count ?? "N/A"}<br/>
								eval_count: ${message.info.eval_count ?? "N/A"}<br/>
								eval_duration: ${Math.round(((message.info.eval_duration ?? 0) / 1000000) * 100) / 100}ms</span>`,
							allowHTML: true
						});
					}
				}
			}
		})();
	}

	$: if (autoScroll && messages && messages.length > 0) {
		(async () => {
			await tick();
			scrollToBottom();
		})();
	}

	const highlightNewCodeBlocks = () => {
		document.querySelectorAll("pre code:not([data-highlighted])").forEach((block) => {
			hljs.highlightElement(block as HTMLElement);
			block.setAttribute("data-highlighted", "true");
		});
	};

	const createCopyCodeBlockButton = () => {
		document.querySelectorAll("pre:not([data-copy-added])").forEach((block) => {
			if (navigator.clipboard && block.childNodes.length < 2 && block.id !== "user-message") {
				block.setAttribute("data-copy-added", "true");
				const code = block.querySelector("code");
				if (!code) return;
				code.style.borderTopRightRadius = "0";
				code.style.borderTopLeftRadius = "0";
				const topBarDiv = document.createElement("div");
				topBarDiv.style.cssText =
					"background:#202123;overflow-x:auto;display:flex;justify-content:space-between;padding:0 1rem;padding-top:4px;border-radius:8px 8px 0 0";
				const langDiv = document.createElement("div");
				const codeClassNames = code.className.split(" ");
				langDiv.textContent =
					codeClassNames[0] === "hljs" ? codeClassNames[1]?.slice(9) : codeClassNames[0]?.slice(9);
				langDiv.style.cssText = "color:white;margin:4px;font-size:0.75rem";
				const button = document.createElement("button");
				button.textContent = "复制代码";
				button.style.cssText =
					"background:none;font-size:0.75rem;border:none;margin:4px;cursor:pointer;color:#ddd";
				button.addEventListener("click", async () => {
					await navigator.clipboard.writeText(code.innerText);
					button.innerText = "已复制!";
					setTimeout(() => {
						button.innerText = "复制代码";
					}, 1000);
				});
				topBarDiv.appendChild(langDiv);
				topBarDiv.appendChild(button);
				block.prepend(topBarDiv);
			}
		});
	};

	const renderLatex = () => {
		for (const element of document.getElementsByClassName("chat-assistant")) {
			auto_render(element, {
				delimiters: [
					{ left: "$$", right: "$$", display: true },
					{ left: "\\(", right: "\\)", display: true },
					{ left: "\\[", right: "\\]", display: true }
				],
				throwOnError: false
			});
		}
	};

	const sanitizeHtml = (html: string) => DOMPurify.sanitize(html, purifyConfig);

	const speakMessage = (text: string) => {
		const synth = window.speechSynthesis;
		if (synth.speaking) {
			synth.cancel();
			return;
		}
		const div = document.createElement('div');
		div.innerHTML = text;
		const plainText = div.textContent || '';
		const utterance = new SpeechSynthesisUtterance(plainText.slice(0, 2000));
		utterance.lang = 'zh-CN';
		utterance.rate = 1.0;
		synth.speak(utterance);
	};

	const handleCopy = (text: string) => {
		copyToClipboard(text);
		toast.success("复制成功");
	};
	const handleCopyMarkdown = (message: any) => {
		copyToClipboard(
			`**${message.role === "user" ? "用户" : message.model || "AI"}**\n\n${message.content}`
		);
		toast.success("已复制 Markdown");
	};

	const showPreviousMessage = async (message: any) => {
		let messageId: string | null = null;
		if (message.parentId !== null) {
			const siblings = history.messages[message.parentId].childrenIds;
			messageId = siblings[Math.max(siblings.indexOf(message.id) - 1, 0)];
		} else {
			const childrenIds = Object.values(history.messages)
				.filter((m: any) => m.parentId === null)
				.map((m: any) => m.id);
			messageId = childrenIds[Math.max(childrenIds.indexOf(message.id) - 1, 0)];
		}
		if (messageId && message.id !== messageId) {
			let msgId = messageId;
			while (history.messages[msgId]?.childrenIds?.length) {
				msgId = history.messages[msgId].childrenIds.at(-1);
			}
			history.currentId = msgId;
		}
		await tick();
		await onBranchNavigate();
		setTimeout(() => {
			window.scrollTo({ top: document.body.scrollHeight });
		}, 100);
	};

	const showNextMessage = async (message: any) => {
		let messageId: string | null = null;
		if (message.parentId !== null) {
			const siblings = history.messages[message.parentId].childrenIds;
			messageId = siblings[Math.min(siblings.indexOf(message.id) + 1, siblings.length - 1)];
		} else {
			const childrenIds = Object.values(history.messages)
				.filter((m: any) => m.parentId === null)
				.map((m: any) => m.id);
			messageId =
				childrenIds[Math.min(childrenIds.indexOf(message.id) + 1, childrenIds.length - 1)];
		}
		if (messageId && message.id !== messageId) {
			let msgId = messageId;
			while (history.messages[msgId]?.childrenIds?.length) {
				msgId = history.messages[msgId].childrenIds.at(-1);
			}
			history.currentId = msgId;
		}
		await tick();
		await onBranchNavigate();
		setTimeout(() => {
			window.scrollTo({ top: document.body.scrollHeight });
		}, 100);
	};

	const formatTime = (ts: number | string) => {
		if (!ts) return "";
		let d: Date;
		if (typeof ts === "string" && ts.includes(" ") && !ts.includes("T")) {
			// Safari 不支持 'YYYY-MM-DD HH:MM:SS' 格式，转为 ISO
			d = new Date(ts.replace(" ", "T"));
		} else {
			d = new Date(ts);
		}
		if (isNaN(d.getTime())) return "";
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
			d.getHours()
		)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	};

	const scrollToBottom = () => {
		window.scrollTo({ top: document.body.scrollHeight });
	};

	onDestroy(() => {
		window.speechSynthesis.cancel();
	});

	$: streamingMessage = messages.find((m: any) => m.role === "assistant" && !m.done && !m.error);
	$: canSend = prompt.trim() !== "" || uploadingFiles.length > 0;
	$: sendBtnClass = `px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 ${canSend ? 'bg-pink-500 text-white hover:bg-pink-600' : 'text-gray-400 bg-gray-100 dark:bg-gray-800 dark:text-gray-500'}`;

	function handleWelcomeSend() {
		if (canSend) { submitPrompt(prompt.trim()); }
	}
	function handleWelcomeFile(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = target.files;
		if (!files) return;
		for (const file of files) {
			if (file.size > 10 * 1024 * 1024) { toast.error("文件过大（最大 10MB）"); continue; }
			const reader = new FileReader();
			reader.onload = () => uploadingFiles = [...uploadingFiles, {
				name: file.name, data: reader.result as string, type: file.type
			}];
			reader.readAsDataURL(file);
		}
		target.value = "";
	}
</script>

{#if messages.length === 0}
	<div class="h-full flex flex-col items-center justify-center px-4">
		<!-- 话题列表 -->
		<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg w-full mb-6">
			{#each suggestedTopics as topic}
				<button
					class="text-left p-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-pink-400 dark:hover:border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition group"
					on:click={() => fillPrompt(topic.text)}
				>
					<div class="text-lg mb-1">{topic.emoji}</div>
					<div
						class="text-xs text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200 leading-relaxed"
					>
						{topic.text}
					</div>
				</button>
			{/each}
		</div>

		<!-- 输入框（DeepSeek 风格，居中） -->
		<div class="w-full max-w-[760px] mb-6">
			<div class="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-gray-700 focus-within:border-pink-400 transition-colors shadow-sm">
				<!-- 上传文件预览 -->
				{#if uploadingFiles.length > 0}
					<div class="flex flex-wrap gap-2 px-4 pt-3">
						{#each uploadingFiles as file, i}
							<div class="relative group">
								{#if file.type.startsWith("image/")}
									<img src={file.data} alt={file.name} class="h-14 w-14 object-cover rounded-lg border" />
								{:else}
									<div class="h-14 flex items-center px-3 bg-gray-100 dark:bg-gray-800 rounded-lg border text-xs text-gray-500 truncate max-w-[100px]">{file.name}</div>
								{/if}
								<button
									class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
									on:click={() => (uploadingFiles = uploadingFiles.filter((_, j) => j !== i))}
								>×</button>
							</div>
						{/each}
					</div>
				{/if}
				<textarea
					class="w-full bg-transparent outline-none px-4 pt-3 pb-3 resize-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400"
					placeholder="给 情感疗愈伴侣 发送消息"
					rows="2"
					bind:value={prompt}
					on:keydown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							if (prompt.trim()) { submitPrompt(prompt.trim()); }
						}
					}}
				/>
				<div class="flex items-center justify-between px-3 pb-2">
					<div class="flex items-center gap-1">
						<button class="p-1.5 text-gray-400 hover:text-pink-500 rounded-lg transition" title="上传文件"
							on:click={() => document.getElementById("msg-upload")?.click()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24"
								stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
						</button>
						<input type="file" id="msg-upload" accept="image/*,.txt,.pdf,.doc,.docx" multiple class="hidden"
							on:change={handleWelcomeFile}
						/>
						<button class="p-1.5 text-gray-400 hover:text-pink-500 rounded-lg transition" title="语音输入"
							on:click={() => toast("语音输入请使用底部输入框")}
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
								<path d="M7 4a3 3 0 016 0v4a3 3 0 01-6 0V4z" />
								<path fill-rule="evenodd" d="M5.5 9.643a.75.75 0 00-1.5 0c0 3.147 2.626 5.75 5.925 5.986a.375.375 0 01.15.728A6.252 6.252 0 004.75 10a.75.75 0 00-1.5 0 7.75 7.75 0 005.5 7.448V18.5h-2a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-2v-1.052a7.749 7.749 0 005.5-7.448.75.75 0 00-1.5 0A6.25 6.25 0 017.5 15.75a.375.375 0 01-.15-.728c3.299-.236 5.925-2.84 5.925-5.986a.75.75 0 00-1.5 0C11.775 12.687 9.197 15 10 15A4.75 4.75 0 015.5 9.643z" clip-rule="evenodd"/></svg>
						</button>
					</div>
					<button
						class={sendBtnClass}
						type="button"
						disabled={!canSend}
						on:click={handleWelcomeSend}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
							<path fill-rule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clip-rule="evenodd"/>
						</svg>
						发送
					</button>
				</div>
			</div>
		</div>

		<!-- 今日心情 -->
		<div class="flex items-center gap-2 mb-2">
			<span class="text-xs text-gray-400">今日心情：</span>
			{#each moodOptions as mood}
				<button
					class="text-xl hover:scale-125 transition-transform p-1"
					title={mood.label}
					on:click={() => {
						toast.success(`已记录心情：${mood.emoji} ${mood.label}`);
						const stored = JSON.parse(localStorage.getItem("moodHistory") ?? "[]");
						stored.push({ date: new Date().toISOString().slice(0, 10), mood: mood.label, score: mood.score });
						localStorage.setItem("moodHistory", JSON.stringify(stored));
					}}
				>
					{mood.emoji}
				</button>
			{/each}
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-6 px-4 md:px-6 lg:px-8 max-w-4xl mx-auto w-full">
		{#each messages as message}
			<div class="flex flex-col">
				{#if message.role === "user"}
					<div class="flex flex-col items-end mb-4">
						<div class="flex justify-end items-start gap-3">
							<div
								class="bg-pink-500 text-white rounded-lg py-2 px-4 max-w-[80%] break-words [&_p]:m-0"
							>
								{#if message.images?.length}
									<div class="flex flex-wrap gap-1 mb-1">
										{#each message.images as img}
											<img src={img} alt="上传图片" class="max-h-48 rounded-lg object-cover" />
										{/each}
									</div>
								{/if}
								{#if message.files?.length}
									<div class="flex flex-wrap gap-1 mb-1">
										{#each message.files as file}
											<div class="flex items-center gap-1.5 bg-white/20 rounded-md px-2 py-1">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="w-3.5 h-3.5 flex-shrink-0"
													viewBox="0 0 20 20"
													fill="currentColor"
													><path
														fill-rule="evenodd"
														d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
														clip-rule="evenodd"
													/></svg
												>
												<span class="text-xs truncate max-w-[120px]">{file.name}</span>
											</div>
										{/each}
									</div>
								{/if}
								{#if editingMessageId === message.id}
									<textarea
										class="w-full min-w-[200px] bg-white/10 rounded-md p-2 text-sm outline-none resize-none"
										rows="3"
										bind:value={editContent}
									/>
									<div class="flex gap-2 mt-1.5 justify-end">
										<button
											class="text-xs px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded transition"
											on:click={() => { editingMessageId = null; }}>取消</button
										>
										<button
											class="text-xs px-2 py-0.5 bg-white/30 hover:bg-white/40 rounded transition"
											on:click={async () => {
												if (editContent.trim()) {
													await editMessage(message.id, editContent.trim());
													editingMessageId = null;
												}
											}}>保存</button
										>
									</div>
								{:else}
									{@html sanitizeHtml(marked(message.content))}
								{/if}
							</div>
							{#if $user?.avatar}
								<img src={$user.avatar} alt="用户" class="w-8 h-8 rounded-full object-cover" />
							{:else}
								<img src="/user.png" alt="用户" class="w-8 h-8 rounded-full" />
							{/if}
						</div>
						<div class="flex items-center gap-1">
							{#if message.timestamp}
								<span class="text-xs text-gray-400 dark:text-gray-500"
									>{formatTime(message.timestamp)}</span
								>
							{/if}
							{#if !message.error}
								<button
									class="text-xs text-gray-400 hover:text-pink-500 dark:hover:text-pink-400 transition"
									on:click={() => { editingMessageId = message.id; editContent = message.content; }}
									title="编辑消息"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
										<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
									</svg>
								</button>
								<button
									class="text-xs text-gray-400 hover:text-red-500 transition"
									on:click={async () => {
										await deleteMessage(message.id);
										toast.success("消息已删除");
									}}
									title="删除消息"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
									</svg>
								</button>
							{/if}
						</div>
					</div>
				{:else}
					<div class="flex flex-col">
						<div class="flex justify-start items-start gap-3 mb-2">
							{#if $user?.system_avatar}
								<img
									src={$user.system_avatar}
									alt="小愈"
									class="w-8 h-8 rounded-full object-cover"
								/>
							{:else}
								<img src="/cat.png" alt="小愈" class="w-8 h-8 rounded-full" />
							{/if}
							<div
								class="bg-gray-200 dark:bg-gray-700 rounded-lg py-2 px-4 max-w-[80%] break-words [&_p]:m-0 chat-assistant"
							>
								{#if message.error}
									<div class="text-red-500 dark:text-red-400 text-sm">
										{@html sanitizeHtml(marked(message.content))}
									</div>
								{:else}
									{@html sanitizeHtml(marked(message.content || " "))}
								{/if}
							</div>
						</div>
						{#if message.id === streamingMessage?.id && !message.done && !message.error}
							<div class="flex items-center gap-1 ml-11 mb-2">
								<span
									class="inline-block w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce"
									style="animation-delay: 0ms"
								/>
								<span
									class="inline-block w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce"
									style="animation-delay: 150ms"
								/>
								<span
									class="inline-block w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce"
									style="animation-delay: 300ms"
								/>
							</div>
						{/if}
						<div class="flex gap-2 ml-11 items-center flex-wrap">
							<span class="text-xs text-gray-500 dark:text-gray-400"
								>{message.model || selectedModels?.[0] || "未知"}</span
							>
							<button
								class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
								on:click={() => handleCopy(message.content)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
									/></svg
								>
								复制
							</button>
								<button
									class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
									on:click={() => speakMessage(message.content)}
									title="朗读"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clip-rule="evenodd"/>
									</svg>
								</button>
							<button
								class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
								on:click={() => handleCopyMarkdown(message)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M4 6h16M4 12h16m-7 6h7"
									/></svg
								>
								MD
							</button>
							{#if message.done && !message.error}
								<button
									class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
									on:click={() => regenerateResponse()}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
										/></svg
									>
									重新生成
								</button>
							{/if}
							{#if message.done && !message.error && message.parentId && history.messages[message.parentId]?.childrenIds?.length > 1}
								<button
									class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
									on:click={() => showPreviousMessage(message)}
									title="上一个回复"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										viewBox="0 0 20 20"
										fill="currentColor"
										><path
											fill-rule="evenodd"
											d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
											clip-rule="evenodd"
										/></svg
									>
								</button>
								<button
									class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
									on:click={() => showNextMessage(message)}
									title="下一个回复"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										viewBox="0 0 20 20"
										fill="currentColor"
										><path
											fill-rule="evenodd"
											d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
											clip-rule="evenodd"
										/></svg
									>
								</button>
							{/if}
							{#if message.done && message.info}
								<button
									id="info-{message.id}"
									class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
								>
									{Math.round(
										((message.info.eval_count ?? 0) / (message.info.eval_duration / 1000000000)) *
											100
									) / 100} token/s
								</button>
							{/if}
							{#if message.timestamp}
								<span class="text-xs text-gray-400 dark:text-gray-500 ml-1"
									>{formatTime(message.timestamp)}</span
								>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
