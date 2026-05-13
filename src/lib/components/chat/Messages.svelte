<script lang="ts">
	import { marked } from "marked";
	import tippy from "tippy.js";
	import hljs from "highlight.js";
	import "highlight.js/styles/github-dark.min.css";
	import auto_render from "katex/dist/contrib/auto-render.mjs";
	import "katex/dist/katex.min.css";

	import { chatId, db, user, settings } from "$lib/stores";
	import { tick } from "svelte";
	import { copyToClipboard } from "$lib/chat/ollama";
	import toast from "svelte-french-toast";

	export let regenerateResponse: Function;
	export let bottomPadding = false;
	export let autoScroll;
	export let selectedModels;
	export let history: any = {};
	export let messages: any[] = [];

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
		const ta = document.getElementById('chat-textarea') as HTMLTextAreaElement | null;
		if (ta) {
			ta.value = text;
			ta.dispatchEvent(new Event('input', { bubbles: true }));
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
						if (el && !el.hasAttribute('data-tippy-added')) {
							el.setAttribute('data-tippy-added', 'true');
							tippy(`#info-${message.id}`, {
								content: `<span class="text-xs">token/s: ${Math.round(((message.info.eval_count ?? 0) / (message.info.eval_duration / 1000000000)) * 100) / 100} tokens<br/>
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

	$: if (autoScroll && bottomPadding) {
		(async () => { await tick(); scrollToBottom(); })();
	}

	const highlightNewCodeBlocks = () => {
		document.querySelectorAll("pre code:not([data-highlighted])").forEach((block) => {
			hljs.highlightElement(block as HTMLElement);
			block.setAttribute('data-highlighted', 'true');
		});
	};

	const createCopyCodeBlockButton = () => {
		document.querySelectorAll("pre:not([data-copy-added])").forEach((block) => {
			if (navigator.clipboard && block.childNodes.length < 2 && block.id !== "user-message") {
				block.setAttribute('data-copy-added', 'true');
				const code = block.querySelector("code");
				if (!code) return;
				code.style.borderTopRightRadius = "0";
				code.style.borderTopLeftRadius = "0";
				const topBarDiv = document.createElement("div");
				topBarDiv.style.cssText = "background:#202123;overflow-x:auto;display:flex;justify-content:space-between;padding:0 1rem;padding-top:4px;border-radius:8px 8px 0 0";
				const langDiv = document.createElement("div");
				const codeClassNames = code.className.split(" ");
				langDiv.textContent = codeClassNames[0] === "hljs" ? codeClassNames[1]?.slice(9) : codeClassNames[0]?.slice(9);
				langDiv.style.cssText = "color:white;margin:4px;font-size:0.75rem";
				const button = document.createElement("button");
				button.textContent = "复制代码";
				button.style.cssText = "background:none;font-size:0.75rem;border:none;margin:4px;cursor:pointer;color:#ddd";
				button.addEventListener("click", async () => {
					await navigator.clipboard.writeText(code.innerText);
					button.innerText = "已复制!";
					setTimeout(() => { button.innerText = "复制代码"; }, 1000);
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

	const sanitizeHtml = (html: string) => {
		return html
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
			.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
	};

	const handleCopy = (text: string) => { copyToClipboard(text); toast.success("复制成功"); };
	const handleCopyMarkdown = (message: any) => {
		copyToClipboard(`**${message.role === 'user' ? '用户' : message.model || 'AI'}**\n\n${message.content}`);
		toast.success("已复制 Markdown");
	};

	const showPreviousMessage = async (message: any) => {
		let messageId: string | null = null;
		if (message.parentId !== null) {
			const siblings = history.messages[message.parentId].childrenIds;
			messageId = siblings[Math.max(siblings.indexOf(message.id) - 1, 0)];
		} else {
			const childrenIds = Object.values(history.messages).filter((m: any) => m.parentId === null).map((m: any) => m.id);
			messageId = childrenIds[Math.max(childrenIds.indexOf(message.id) - 1, 0)];
		}
		if (messageId && message.id !== messageId) {
			let msgId = messageId;
			while (history.messages[msgId].childrenIds.length !== 0) { msgId = history.messages[msgId].childrenIds.at(-1); }
			history.currentId = msgId;
		}
		await tick();
		setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight }); }, 100);
	};

	const showNextMessage = async (message: any) => {
		let messageId: string | null = null;
		if (message.parentId !== null) {
			const siblings = history.messages[message.parentId].childrenIds;
			messageId = siblings[Math.min(siblings.indexOf(message.id) + 1, siblings.length - 1)];
		} else {
			const childrenIds = Object.values(history.messages).filter((m: any) => m.parentId === null).map((m: any) => m.id);
			messageId = childrenIds[Math.min(childrenIds.indexOf(message.id) + 1, childrenIds.length - 1)];
		}
		if (messageId && message.id !== messageId) {
			let msgId = messageId;
			while (history.messages[msgId].childrenIds.length !== 0) { msgId = history.messages[msgId].childrenIds.at(-1); }
			history.currentId = msgId;
		}
		await tick();
		setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight }); }, 100);
	};

	const formatTime = (ts: number | string) => {
		if (!ts) return '';
		const d = new Date(ts);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	};

	const scrollToBottom = () => { window.scrollTo({ top: document.body.scrollHeight }); };

	$: if (messages && messages.length > 0) {
		(async () => { await tick(); scrollToBottom(); })();
	}

	$: streamingMessage = messages.find((m: any) => m.role === 'assistant' && !m.done && !m.error);
</script>

{#if messages.length === 0}
	<div class="h-full flex flex-col items-center justify-center px-4">
		<div class="text-sm text-gray-400 dark:text-gray-500 mb-8">选择一个话题开始吧~</div>
		<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg w-full mb-8">
			{#each suggestedTopics as topic}
				<button
					class="text-left p-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-pink-400 dark:hover:border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition group"
					on:click={() => fillPrompt(topic.text)}
				>
					<div class="text-lg mb-1">{topic.emoji}</div>
					<div class="text-xs text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200 leading-relaxed">{topic.text}</div>
				</button>
			{/each}
		</div>
		<div class="flex items-center gap-2 mb-2">
			<span class="text-xs text-gray-400">今日心情：</span>
			{#each moodOptions as mood}
				<button
					class="text-xl hover:scale-125 transition-transform p-1"
					title={mood.label}
					on:click={() => {
						toast.success(`已记录心情：${mood.emoji} ${mood.label}`);
						const stored = JSON.parse(localStorage.getItem('moodHistory') ?? '[]');
						stored.push({ date: new Date().toISOString().slice(0, 10), mood: mood.label, score: mood.score });
						localStorage.setItem('moodHistory', JSON.stringify(stored));
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
				{#if message.role === 'user'}
					<div class="flex flex-col items-end mb-4">
						<div class="flex justify-end items-start gap-3">
							<div class="bg-pink-500 text-white rounded-lg py-2 px-4 max-w-[80%] break-words [&_p]:m-0">
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
											<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>
											<span class="text-xs truncate max-w-[120px]">{file.name}</span>
										</div>
									{/each}
								</div>
								{/if}
							{@html sanitizeHtml(marked(message.content))}
							</div>
							{#if $user?.avatar}
								<img src={$user.avatar} alt="用户" class="w-8 h-8 rounded-full object-cover" />
							{:else}
								<img src="/user.png" alt="用户" class="w-8 h-8 rounded-full" />
							{/if}
						</div>
						{#if message.timestamp}
							<span class="text-xs text-gray-400 dark:text-gray-500 mr-11 mt-0.5">{formatTime(message.timestamp)}</span>
						{/if}
					</div>
				{:else}
					<div class="flex flex-col">
						<div class="flex justify-start items-start gap-3 mb-2">
							{#if $user?.system_avatar}
								<img src={$user.system_avatar} alt="小愈" class="w-8 h-8 rounded-full object-cover" />
							{:else}
								<img src="/cat.png" alt="小愈" class="w-8 h-8 rounded-full" />
							{/if}
							<div class="bg-gray-200 dark:bg-gray-700 rounded-lg py-2 px-4 max-w-[80%] break-words [&_p]:m-0 chat-assistant">
								{#if message.error}
									<div class="text-red-500 dark:text-red-400 text-sm">{@html sanitizeHtml(marked(message.content))}</div>
								{:else}
									{@html sanitizeHtml(marked(message.content || ' '))}
								{/if}
							</div>
						</div>
						{#if message.id === streamingMessage?.id && !message.done && !message.error}
							<div class="flex items-center gap-1 ml-11 mb-2">
								<span class="inline-block w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
								<span class="inline-block w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
								<span class="inline-block w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
							</div>
						{/if}
						<div class="flex gap-2 ml-11 items-center flex-wrap">
							<span class="text-xs text-gray-500 dark:text-gray-400">{message.model || selectedModels?.[0] || '未知'}</span>
							<button class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1" on:click={() => handleCopy(message.content)}>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
								复制
							</button>
							<button class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1" on:click={() => handleCopyMarkdown(message)}>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
								MD
							</button>
							{#if message.done && !message.error}
								<button class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1" on:click={() => regenerateResponse()}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
									重新生成
								</button>
							{/if}
							{#if message.done && !message.error && message.parentId && history.messages[message.parentId]?.childrenIds?.length > 1}
								<button class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1" on:click={() => showPreviousMessage(message)} title="上一个回复">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" /></svg>
								</button>
								<button class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1" on:click={() => showNextMessage(message)} title="下一个回复">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" /></svg>
								</button>
							{/if}
							{#if message.done && message.info}
								<button id="info-{message.id}" class="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1">
									{Math.round(((message.info.eval_count ?? 0) / (message.info.eval_duration / 1000000000)) * 100) / 100} token/s
								</button>
							{/if}
							{#if message.timestamp}
								<span class="text-xs text-gray-400 dark:text-gray-500 ml-1">{formatTime(message.timestamp)}</span>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
