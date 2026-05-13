<script lang="ts">
	import { marked } from "marked";

	import tippy from "tippy.js";
	import hljs from "highlight.js";
	import "highlight.js/styles/github-dark.min.css";
	import auto_render from "katex/dist/contrib/auto-render.mjs";
	import "katex/dist/katex.min.css";

	import { chatId, db, user } from "$lib/stores";
	import { tick } from "svelte";
	import { copyToClipboard } from "$lib/chat/ollama";

	import toast from "svelte-french-toast";

	export let regenerateResponse: Function;

	export let bottomPadding = false;
	export let autoScroll;
	export let selectedModels;
	export let history = {};
	export let messages = [];

	$: if (messages && messages.length > 0 && (messages.at(-1).done ?? false)) {
		(async () => {
			await tick();
			renderLatex();
			highlightNewCodeBlocks();
			createCopyCodeBlockButton();

			for (const message of messages) {
				if (message.info) {
					tippy(`#info-${message.id}`, {
						content: `<span class="text-xs">token/s: ${
							`${
								Math.round(
									((message.info.eval_count ?? 0) / (message.info.eval_duration / 1000000000)) * 100
								) / 100
							} tokens` ?? "N/A"
						}<br/>
						total_duration: ${
							Math.round(((message.info.total_duration ?? 0) / 1000000) * 100) / 100 ?? "N/A"
						}ms<br/>
						load_duration: ${
							Math.round(((message.info.load_duration ?? 0) / 1000000) * 100) / 100 ?? "N/A"
						}ms<br/>
						prompt_eval_count: ${message.info.prompt_eval_count ?? "N/A"}<br/>
						prompt_eval_duration: ${
							Math.round(((message.info.prompt_eval_duration ?? 0) / 1000000) * 100) / 100 ?? "N/A"
						}ms<br/>
						eval_count: ${message.info.eval_count ?? "N/A"}<br/>
						eval_duration: ${
							Math.round(((message.info.eval_duration ?? 0) / 1000000) * 100) / 100 ?? "N/A"
						}ms</span>`,
						allowHTML: true
					});
				}
			}
		})();
	}

	$: if (autoScroll && bottomPadding) {
		(async () => {
			await tick();
			scrollToBottom();
		})();
	}

	const highlightNewCodeBlocks = () => {
		const blocks = document.querySelectorAll("pre code:not([data-highlighted])");
		blocks.forEach((block) => {
			hljs.highlightElement(block as HTMLElement);
			block.setAttribute('data-highlighted', 'true');
		});
	};

	const createCopyCodeBlockButton = () => {
		let blocks = document.querySelectorAll("pre:not([data-copy-added])");

		blocks.forEach((block) => {
			if (navigator.clipboard && block.childNodes.length < 2 && block.id !== "user-message") {
				block.setAttribute('data-copy-added', 'true');
				let code = block.querySelector("code");
				if (!code) return;
				code.style.borderTopRightRadius = "0";
				code.style.borderTopLeftRadius = "0";

				let topBarDiv = document.createElement("div");
				topBarDiv.style.backgroundColor = "#202123";
				topBarDiv.style.overflowX = "auto";
				topBarDiv.style.display = "flex";
				topBarDiv.style.justifyContent = "space-between";
				topBarDiv.style.padding = "0 1rem";
				topBarDiv.style.paddingTop = "4px";
				topBarDiv.style.borderTopRightRadius = "8px";
				topBarDiv.style.borderTopLeftRadius = "8px";

				let langDiv = document.createElement("div");
				let codeClassNames = code?.className.split(" ");
				langDiv.textContent =
					codeClassNames[0] === "hljs" ? codeClassNames[1]?.slice(9) : codeClassNames[0]?.slice(9);
				langDiv.style.color = "white";
				langDiv.style.margin = "4px";
				langDiv.style.fontSize = "0.75rem";

				let button = document.createElement("button");
				button.textContent = "Copy Code";
				button.style.background = "none";
				button.style.fontSize = "0.75rem";
				button.style.border = "none";
				button.style.margin = "4px";
				button.style.cursor = "pointer";
				button.style.color = "#ddd";
				button.addEventListener("click", () => copyCode(block, button));

				topBarDiv.appendChild(langDiv);
				topBarDiv.appendChild(button);

				block.prepend(topBarDiv);
			}
		});

		async function copyCode(block: HTMLPreElement, button: HTMLButtonElement) {
			let code = block.querySelector("code");
			if (!code) return;
			let text = code.innerText;
			await navigator.clipboard.writeText(text);
			button.innerText = "Copied!";
			setTimeout(() => {
				button.innerText = "Copy Code";
			}, 1000);
		}
	};

	const renderLatex = () => {
		let chatMessageElements = document.getElementsByClassName("chat-assistant");
		for (const element of chatMessageElements) {
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

	const handleCopy = (text: string) => {
		copyToClipboard(text);
		toast.success("复制成功");
	};

	const showPreviousMessage = async (message: any) => {
		if (message.parentId !== null) {
			let messageId =
				history.messages[message.parentId].childrenIds[
					Math.max(history.messages[message.parentId].childrenIds.indexOf(message.id) - 1, 0)
				];

			if (message.id !== messageId) {
				let messageChildrenIds = history.messages[messageId].childrenIds;

				while (messageChildrenIds.length !== 0) {
					messageId = messageChildrenIds.at(-1);
					messageChildrenIds = history.messages[messageId].childrenIds;
				}

				history.currentId = messageId;
			}
		} else {
			let childrenIds = Object.values(history.messages)
				.filter((message: any) => message.parentId === null)
				.map((message: any) => message.id);
			let messageId = childrenIds[Math.max(childrenIds.indexOf(message.id) - 1, 0)];

			if (message.id !== messageId) {
				let messageChildrenIds = history.messages[messageId].childrenIds;

				while (messageChildrenIds.length !== 0) {
					messageId = messageChildrenIds.at(-1);
					messageChildrenIds = history.messages[messageId].childrenIds;
				}

				history.currentId = messageId;
			}
		}

		await tick();

		setTimeout(() => {
			window.scrollTo({
				top: document.body.scrollHeight
			});
		}, 100);
	};

	const showNextMessage = async (message: any) => {
		if (message.parentId !== null) {
			let messageId =
				history.messages[message.parentId].childrenIds[
					Math.min(
						history.messages[message.parentId].childrenIds.indexOf(message.id) + 1,
						history.messages[message.parentId].childrenIds.length - 1
					)
				];

			if (message.id !== messageId) {
				let messageChildrenIds = history.messages[messageId].childrenIds;

				while (messageChildrenIds.length !== 0) {
					messageId = messageChildrenIds.at(-1);
					messageChildrenIds = history.messages[messageId].childrenIds;
				}

				history.currentId = messageId;
			}
		} else {
			let childrenIds = Object.values(history.messages)
				.filter((message: any) => message.parentId === null)
				.map((message: any) => message.id);
			let messageId =
				childrenIds[Math.min(childrenIds.indexOf(message.id) + 1, childrenIds.length - 1)];

			if (message.id !== messageId) {
				let messageChildrenIds = history.messages[messageId].childrenIds;

				while (messageChildrenIds.length !== 0) {
					messageId = messageChildrenIds.at(-1);
					messageChildrenIds = history.messages[messageId].childrenIds;
				}

				history.currentId = messageId;
			}
		}

		await tick();

		setTimeout(() => {
			window.scrollTo({
				top: document.body.scrollHeight
			});
		}, 100);
	};

	const formatTime = (ts: number | string) => {
		if (!ts) return '';
		const d = new Date(ts);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	};

	const scrollToBottom = () => {
		window.scrollTo({
			top: document.body.scrollHeight
		});
	};

	$: if (messages && messages.length > 0) {
		(async () => {
			await tick();
			scrollToBottom();
		})();
	}
</script>

{#if messages.length === 0}
	<div class="h-full flex flex-col items-center justify-center">
		<div class="text-2xl font-medium dark:text-gray-300">还不快和小愈交流^_^，难道要我主动嘛！</div>
	</div>
{:else}
	<div class="flex flex-col gap-6 px-4 md:px-6 lg:px-8 max-w-4xl mx-auto w-full">
		{#each messages as message}
			<div class="flex flex-col">
				{#if message.role === 'user'}
					<div class="flex flex-col items-end mb-4">
						<div class="flex justify-end items-start gap-3">
							<div class="bg-pink-500 text-white rounded-lg py-2 px-4 max-w-[80%] break-words [&_p]:m-0">
								{@html sanitizeHtml(marked(message.content))}
							</div>
							{#if $user?.avatar}
									<img src={$user.avatar} alt="User" class="w-8 h-8 rounded-full object-cover" />
								{:else}
									<img src="/user.png" alt="User" class="w-8 h-8 rounded-full" />
								{/if}
						</div>
						{#if message.timestamp}
							<span class="text-xs text-gray-400 dark:text-gray-500 mr-11 mt-0.5">
								{formatTime(message.timestamp)}
							</span>
						{/if}
					</div>
				{:else}
					<div class="flex flex-col">
						<div class="flex justify-start items-start gap-3 mb-2">
							{#if $user?.system_avatar}
									<img src={$user.system_avatar} alt="Assistant" class="w-8 h-8 rounded-full object-cover" />
								{:else}
									<img src="/cat.png" alt="Assistant" class="w-8 h-8 rounded-full" />
								{/if}
							<div class="bg-gray-200 dark:bg-gray-700 rounded-lg py-2 px-4 max-w-[80%] break-words [&_p]:m-0">
								{@html sanitizeHtml(marked(message.content))}
							</div>
						</div>
						<div class="flex gap-2 ml-11 items-center">
							<span class="text-xs text-gray-500 dark:text-gray-400">
								{message.model || selectedModels?.[0] || 'unknown'}
							</span>
							<button
								class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
								on:click={() => handleCopy(message.content)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
								</svg>
								复制
							</button>
							<button
								class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
								on:click={() => regenerateResponse()}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
								</svg>
								重新生成
							</button>
							{#if message.timestamp}
								<span class="text-xs text-gray-400 dark:text-gray-500 ml-1">
									{formatTime(message.timestamp)}
								</span>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
