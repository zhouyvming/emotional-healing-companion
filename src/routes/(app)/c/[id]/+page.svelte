<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';

	import { convertMessagesToHistory } from '$lib/utils';
	import { settings, db, chats, chatId } from '$lib/stores';
	import { createChatHandlers } from '$lib/chat/ollama';

	import MessageInput from '$lib/components/chat/MessageInput.svelte';
	import Messages from '$lib/components/chat/Messages.svelte';
	import ModelSelector from '$lib/components/chat/ModelSelector.svelte';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import { page } from '$app/stores';

	let loaded = false;
	let stopResponseFlag = false;
	let autoScroll = true;

	let selectedModels = [''];
	let title = '';
	let prompt = '';
	let uploadingFiles: { name: string; data: string; type: string }[] = [];

	let messages: any[] = [];
	let history: any = {
		messages: {},
		currentId: null
	};
	let updateCounter = 0;

	$: updateCounter, (() => {
		if (history.currentId !== null) {
			let _messages: any[] = [];
			let currentMessage = history.messages[history.currentId];
			while (currentMessage !== null) {
				_messages.unshift({ ...currentMessage });
				currentMessage = currentMessage.parentId !== null ? history.messages[currentMessage.parentId] : null;
			}
			messages = _messages;
		} else {
			messages = [];
		}
	})();

	$: isStreaming = messages.some(m => m.role === 'assistant' && !m.done && !m.error);

	function getCtx() {
		return {
			messages, history, title, selectedModels,
			stopResponseFlag, autoScroll, uploadingFiles,
			settings: $settings,
			db: $db, chats, chatId,
			get chatId() { return $chatId; },
			isNewChat: false,
			notifyUpdate: () => { updateCounter++; }
		};
	}

	const handlers = createChatHandlers(getCtx);
	const { submitPrompt, stopResponse, regenerateResponse, editMessage, deleteMessage } = handlers;

	const onTitleSet = (t: string) => { title = t; };

	const wrappedSubmit = async (userPrompt: string) => {
		prompt = "";
		await submitPrompt(userPrompt, onTitleSet, false);
		uploadingFiles = [];
	};

	const wrappedRegenerate = () => regenerateResponse(onTitleSet);
	const wrappedEdit = async (messageId: string, newContent: string) => { await editMessage(messageId, newContent, onTitleSet); };

	$: if ($page.params.id) {
		(async () => {
			let chat = await loadChat();
			await tick();
			if (chat) {
				loaded = true;
			} else {
				await goto('/');
			}
		})();
	}

	const loadChat = async () => {
		await chatId.set($page.params.id);
		const chat = await $db.getChatById($chatId);

		if (chat) {
			selectedModels = (chat?.models ?? undefined) !== undefined ? chat.models : [chat.model ?? ''];
			history = (chat?.history ?? undefined) !== undefined
				? chat.history
				: convertMessagesToHistory(chat.messages);
			title = chat.title;

			let _settings = JSON.parse(localStorage.getItem('settings') ?? '{}');
			await settings.set({
				..._settings,
				system: chat.system ?? _settings.system,
				options: chat.options ?? _settings.options
			});
			autoScroll = true;

			await tick();
			if (messages.length > 0) {
				history.messages[messages.at(-1).id].done = true;
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
	<Navbar {title} />
	<div class="min-h-screen w-full flex justify-center">
		<div class=" py-2.5 flex flex-col justify-between w-full">
			<div class="max-w-3xl mx-auto w-full px-3 md:px-0 mt-10">
				<ModelSelector bind:selectedModels disabled={messages.length > 0} />
			</div>

			<div class=" h-full mt-10 mb-32 w-full flex flex-col">
				<Messages
					{selectedModels}
					bind:history
					bind:messages
					bind:autoScroll
					
					regenerateResponse={wrappedRegenerate}
					
					
				/>
			</div>
		</div>

		<MessageInput
			bind:prompt
			bind:autoScroll
			{messages}
			bind:uploadingFiles
			submitPrompt={wrappedSubmit}
			{stopResponse}
		/>
	</div>
{/if}
