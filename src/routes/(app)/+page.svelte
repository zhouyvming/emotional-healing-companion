<script lang="ts">
	import { v4 as uuidv4 } from "uuid";
	import { onMount, onDestroy } from "svelte";

	import { settings, db, chats, chatId, sidebarOpen } from "$lib/stores";
	import { createChatHandlers } from "$lib/chat/ollama";
	import type { UploadingFile } from "$lib/client/fileParser";

	import MessageInput from "$lib/components/chat/MessageInput.svelte";
	import Messages from "$lib/components/chat/Messages.svelte";
	import ModelSelector from "$lib/components/chat/ModelSelector.svelte";
	import KnowledgeBaseSelector from "$lib/components/chat/KnowledgeBaseSelector.svelte";
	import Navbar from "$lib/components/layout/Navbar.svelte";
	import { page } from "$app/stores";

	const stopRef = { value: false };
	const abortRef = { value: null as AbortController | null };
	let abortRefs: AbortController[] = [];
	let autoScroll = true;

	let selectedModels = [""];
	let kbId = "";
	let title = "";
	let prompt = "";
	let uploadingFiles: UploadingFile[] = [];

	let messages: any[] = [];
	let history: any = {
		messages: {},
		currentId: null
	};
	let updateCounter = 0;

	$: updateCounter,
		(() => {
			if (history.currentId !== null && history.messages[history.currentId]) {
				let _messages: any[] = [];
				let currentMessage = history.messages[history.currentId];
				while (currentMessage !== null) {
					_messages.unshift({ ...currentMessage });
					currentMessage =
						currentMessage.parentId !== null ? history.messages[currentMessage.parentId] : null;
				}
				messages = _messages;
			} else {
				messages = [];
			}
		})();

	// 检查是否有流式消息
	$: isStreaming = messages.some((m) => m.role === "assistant" && !m.done && !m.error);

	function getCtx() {
		return {
			messages,
			history,
			title,
			selectedModels,
			stopRef,
			abortRef,
			abortRefs,
			autoScroll,
			uploadingFiles,
			kbId,
			getKbId: () => kbId,
			settings: $settings,
			db: $db,
			chats,
			chatId,
			get chatId() {
				return $chatId;
			},
			isNewChat: true,
			notifyUpdate: () => {
				updateCounter++;
			}
		};
	}

	const handlers = createChatHandlers(getCtx);
	const { submitPrompt, stopResponse, regenerateResponse, editMessage, deleteMessage } = handlers;

	const onTitleSet = (t: string) => {
		title = t;
	};

	const wrappedSubmit = async (userPrompt: string) => {
		prompt = "";
		await submitPrompt(userPrompt, onTitleSet, true);
		uploadingFiles = [];
		// 确保侧边栏拿到最新的聊天列表（含生成后的标题）
		if ($db && !$settings.privacyMode) {
			await chats.set(await $db.getChats());
		}
	};

	const wrappedRegenerate = () => regenerateResponse(onTitleSet);
	const wrappedEdit = async (messageId: string, newContent: string) => {
		await editMessage(messageId, newContent, onTitleSet);
	};
	const wrappedDelete = async (messageId: string) => {
		await deleteMessage(messageId);
	};

	let unsubChatId: () => void;
	let cleanupMediaQuery: () => void;

	onMount(async () => {
		await chatId.set(uuidv4());

		// 系统主题监听
		const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
		const handleThemeChange = () => {
			const currentTheme = localStorage.theme;
			if (currentTheme === "system") {
				document.documentElement.classList.remove("light", "dark");
				document.documentElement.classList.add(mediaQuery.matches ? "light" : "dark");
			}
		};
		mediaQuery.addEventListener("change", handleThemeChange);
		cleanupMediaQuery = () => mediaQuery.removeEventListener("change", handleThemeChange);

		unsubChatId = chatId.subscribe(async () => {
			await initNewChat();
		});
	});

	onDestroy(() => {
		if (unsubChatId) unsubChatId();
		if (cleanupMediaQuery) cleanupMediaQuery();
	});

	const initNewChat = async () => {
		autoScroll = true;
		title = "";
		messages = [];
		history = { messages: {}, currentId: null };
		uploadingFiles = [];

		let _settings = JSON.parse(localStorage.getItem("settings") ?? "{}");
		selectedModels = $page.url.searchParams.get("models")
			? $page.url.searchParams.get("models")?.split(",")
			: _settings.models ?? [""];
		settings.set({ ..._settings });
	};
</script>

<svelte:window
	on:scroll={() => {
		autoScroll = window.innerHeight + window.scrollY >= document.body.offsetHeight - 40;
	}}
/>

<Navbar {title} sidebarOpen={$sidebarOpen} />
<div class="min-h-screen w-full flex justify-center {$sidebarOpen ? 'ml-[260px]' : ''} pt-12">
	<div class="py-2.5 flex flex-col justify-between w-full max-w-5xl">
		<div class="flex-1 overflow-y-auto">
			<Messages
				bind:selectedModels
				bind:history
				bind:messages
				bind:autoScroll
				bind:prompt
				bind:uploadingFiles
				bind:kbId
				submitPrompt={wrappedSubmit}
				regenerateResponse={wrappedRegenerate}
				editMessage={wrappedEdit}
				deleteMessage={wrappedDelete}
				onBranchNavigate={async () => {
					if (!$settings.privacyMode && $db) {
						await $db.updateChatById($chatId, { messages, history });
					}
				}}
			/>
		</div>

		{#if messages.length > 0}
			<div class="px-3 md:px-0 pb-2">
				<MessageInput
					bind:prompt
					bind:autoScroll
					{messages}
					bind:selectedModels
					bind:uploadingFiles
					bind:kbId
					submitPrompt={wrappedSubmit}
					{stopResponse}
				/>
			</div>
		{/if}
	</div>
</div>
