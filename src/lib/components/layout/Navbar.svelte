<script lang="ts">
	import { v4 as uuidv4 } from "uuid";

	import { goto } from "$app/navigation";
	import { chatId, db } from "$lib/stores";

	export let title: string = "情感疗愈伴侣";

	let editTitle = "";
	let showDeleteConfirm = false;
	let showRenameInput = false;

	$: if ($chatId) {
		showRenameInput = false;
		showDeleteConfirm = false;
		editTitle = "";
	}

	function startRename() {
		editTitle = title;
		showRenameInput = true;
	}

	function confirmRename() {
		if (editTitle.trim() && editTitle !== title) {
			$db.updateChatById($chatId, { title: editTitle.trim() });
			title = editTitle.trim();
		}
		showRenameInput = false;
	}

	function cancelRename() {
		showRenameInput = false;
		editTitle = "";
	}

	async function confirmDelete() {
		showDeleteConfirm = false;
		await $db.deleteChatById($chatId);
	}
</script>

<nav
	id="nav"
	class=" fixed py-2.5 top-0 flex flex-row justify-center bg-white/95 dark:bg-gray-800/90 dark:text-gray-200 backdrop-blur-xl w-full z-30"
>
	<div class=" flex max-w-3xl w-full mx-auto px-3">
		<div class="flex w-full max-w-full items-center">
			<div class="pr-2 self-center">
				<button
					class=" cursor-pointer p-1 flex dark:hover:bg-gray-700 rounded-lg transition"
					on:click={async () => {
						goto("/");
						await chatId.set(uuidv4());
					}}
				>
					<div class=" m-auto self-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="w-5 h-5"
						>
							<path
								d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z"
							/>
							<path
								d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z"
							/>
						</svg>
					</div>
				</button>
			</div>

			<div class="flex-1 self-center flex items-center min-w-0">
				{#if showRenameInput}
					<input
						bind:value={editTitle}
						class="bg-transparent border-b border-pink-400 outline-none px-1 py-0.5 text-sm flex-1 min-w-0"
						on:keydown={(e) => {
							if (e.key === 'Enter') confirmRename();
							if (e.key === 'Escape') cancelRename();
						}}
					/>
					<button class="p-1 ml-1 hover:text-pink-500 transition" on:click={confirmRename}>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
							<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
						</svg>
					</button>
					<button class="p-1 ml-0.5 hover:text-red-500 transition" on:click={cancelRename}>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
							<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
						</svg>
					</button>
				{:else}
					<span class="font-medium text-ellipsis whitespace-nowrap overflow-hidden">
						{title != "" ? title : "情感疗愈伴侣"}
					</span>
				{/if}
			</div>

			<!-- 操作按钮 -->
			<div class="flex items-center space-x-1 ml-2">
				{#if showDeleteConfirm}
					<span class="text-xs text-gray-500 mr-1">确认删除?</span>
					<button class="p-1 hover:text-red-500 transition" on:click={confirmDelete}>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
							<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
						</svg>
					</button>
					<button class="p-1 hover:text-gray-500 transition" on:click={() => { showDeleteConfirm = false; }}>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
							<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
						</svg>
					</button>
				{:else}
					<button class="p-1 hover:text-pink-500 dark:hover:text-pink-400 transition" on:click={startRename} title="重命名">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
						</svg>
					</button>
					<button class="p-1 hover:text-red-500 transition" on:click={() => { showDeleteConfirm = true; }} title="删除">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
							<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
						</svg>
					</button>
				{/if}
			</div>
		</div>
	</div>
</nav>
