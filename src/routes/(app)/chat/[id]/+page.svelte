<script lang="ts">
	import { tick } from "svelte";
	import { goto } from "$app/navigation";

	import { convertMessagesToHistory } from "$lib/utils";
	import { settings, db, chats, chatId, sidebarOpen } from "$lib/stores";
	import { createChatHandlers } from "$lib/chat/ollama";
	import type { UploadingFile } from "$lib/client/fileParser";

	import MessageInput from "$lib/components/chat/MessageInput.svelte";
	import Messages from "$lib/components/chat/Messages.svelte";
	import Navbar from "$lib/components/layout/Navbar.svelte";
	import { page } from "$app/stores";
	import { browser } from "$app/environment";

	let loaded = false;
	const stopRef = { value: false };
	const abortRef = { value: null as AbortController | null };
	let abortRefs: AbortController[] = [];
	let autoScroll = true;

	let selectedModels = [""];
	let agentMode = browser && localStorage.getItem("chatMode") === "agent";
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
	let loadedChatId = "";
	let loadSeq = 0;

	$: if (browser) {
		localStorage.setItem("chatMode", agentMode ? "agent" : "chat");
	}

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
			isNewChat: false,
			notifyUpdate: () => {
				updateCounter++;
			}
		};
	}

	const handlers = createChatHandlers(getCtx);
	const {
		submitPrompt,
		submitAgentPrompt,
		stopResponse,
		regenerateResponse,
		editMessage,
		deleteMessage
	} = handlers;

	const onTitleSet = (t: string) => {
		title = t;
	};

	const wrappedSubmit = async (userPrompt: string) => {
		prompt = "";
		if (agentMode) {
			await submitAgentPrompt(userPrompt, onTitleSet, false);
		} else {
			await submitPrompt(userPrompt, onTitleSet, false);
		}
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

	function stripSessionOptions(options: Record<string, any> = {}) {
		const { kbId: _kbId, chatMode: _chatMode, ...modelOptions } = options;
		return modelOptions;
	}

	function inferAgentMode(chat: any, loadedHistory: any) {
		if (chat?.options?.chatMode === "agent") return true;
		if (chat?.options?.chatMode === "chat") return false;
		return Object.values(loadedHistory?.messages ?? {}).some(
			(message: any) =>
				Array.isArray(message?.agentTrace) ||
				(typeof message?.model === "string" && message.model.includes("· Agent"))
		);
	}

	$: if ($page.params.id && $db && $page.params.id !== loadedChatId) {
		(async () => {
			const id = $page.params.id;
			const seq = ++loadSeq;
			loaded = false;
			let chat = await loadChat(id, seq);
			if (seq !== loadSeq) return;
			await tick();
			if (chat) {
				loadedChatId = id;
				loaded = true;
			} else {
				await goto("/");
			}
		})();
	}

	const loadChat = async (id: string, seq: number) => {
		await chatId.set(id);
		const chat = await $db.getChatById(id);
		if (seq !== loadSeq) return null;

		if (chat) {
			selectedModels = (chat?.models ?? undefined) !== undefined ? chat.models : [chat.model ?? ""];
			history =
				(chat?.history ?? undefined) !== undefined
					? chat.history
					: convertMessagesToHistory(chat.messages);
			title = chat.title;
			kbId = typeof chat.options?.kbId === "string" ? chat.options.kbId : "";
			agentMode = inferAgentMode(chat, history);

			let _settings = JSON.parse(localStorage.getItem("settings") ?? "{}");
			await settings.set({
				..._settings,
				system: chat.system ?? _settings.system,
				options: stripSessionOptions(chat.options ?? _settings.options)
			});
			autoScroll = true;
			updateCounter++;

			await tick();
			if (messages.length > 0) {
				const lastMsg = messages.at(-1);
				if (lastMsg.role === "assistant" && lastMsg.done !== true && !lastMsg.error) {
					lastMsg.done = true;
					lastMsg.error = true;
					lastMsg.content =
						(lastMsg.content || "") + "\n\n*[此回复在上次对话中断，内容可能不完整]*";
				}
			}
			await tick();

			return chat;
		}
		return null;
	};
</script>

<svelte:window
	on:scroll={() => {
		autoScroll = window.innerHeight + window.scrollY >= document.body.offsetHeight - 40;
	}}
/>

{#if loaded}
	<Navbar {title} sidebarOpen={$sidebarOpen} showActions={true} />
	<div class="ui-page flex justify-center {$sidebarOpen ? 'ml-[260px]' : ''} pt-12">
		<div class="flex w-full max-w-5xl flex-col justify-between py-2.5">
			<div class="flex-1 overflow-y-auto">
				<Messages
					bind:selectedModels
					bind:history
					bind:messages
					bind:autoScroll
					bind:prompt
					bind:uploadingFiles
					bind:kbId
					bind:agentMode
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
				<div class="px-3 pb-3 md:px-0">
					<MessageInput
						bind:prompt
						bind:autoScroll
						{messages}
						bind:selectedModels
						bind:uploadingFiles
						bind:kbId
						bind:agentMode
						submitPrompt={wrappedSubmit}
						{stopResponse}
					/>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class="ui-page flex items-center justify-center">
		<div class="flex items-center gap-2">
			<span
				class="inline-block w-2 h-2 bg-rose-400 rounded-full animate-bounce"
				style="animation-delay: 0ms"
			/>
			<span
				class="inline-block w-2 h-2 bg-rose-400 rounded-full animate-bounce"
				style="animation-delay: 150ms"
			/>
			<span
				class="inline-block w-2 h-2 bg-rose-400 rounded-full animate-bounce"
				style="animation-delay: 300ms"
			/>
		</div>
	</div>
{/if}
