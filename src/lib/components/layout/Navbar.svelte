<script lang="ts">
	import { v4 as uuidv4 } from "uuid";

	import { goto } from "$app/navigation";
	import { chatId, db } from "$lib/stores";

	export let title: string = "情感疗愈伴侣";
	export let sidebarOpen = true;
	export let showActions = false;

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
	class="fixed top-0 z-30 flex flex-row justify-center border-b border-rose-100/70 bg-white/90 py-2.5 text-gray-800 backdrop-blur-xl transition-all dark:border-gray-800 dark:bg-gray-950/90 dark:text-gray-200"
	style="left: {sidebarOpen ? '260px' : '0'}; right: 0; width: {sidebarOpen
		? 'calc(100% - 260px)'
		: '100%'};"
>
	<div class="mx-auto flex w-full max-w-5xl px-3">
		<div class="flex w-full max-w-full items-center">
			<div class="self-center pr-2">
				<button
					class="ui-icon-btn cursor-pointer"
					aria-label="新建对话"
					title="新建对话"
					on:click={async () => {
						goto("/");
						await chatId.set(uuidv4());
					}}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="h-5 w-5"
					>
						<path
							d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z"
						/>
						<path
							d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z"
						/>
					</svg>
				</button>
			</div>

			{#if showActions}
				<div class="flex items-center gap-1 pr-2">
					{#if showDeleteConfirm}
						<span class="mr-1 text-xs text-gray-500">确认删除?</span>
						<button
							class="ui-icon-btn hover:text-red-500"
							on:click={confirmDelete}
							aria-label="确认删除"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4"
							>
								<path
									fill-rule="evenodd"
									d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
						<button
							class="ui-icon-btn"
							on:click={() => {
								showDeleteConfirm = false;
							}}
							aria-label="取消删除"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4"
							>
								<path
									d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
								/>
							</svg>
						</button>
					{:else}
						<button
							class="ui-icon-btn hover:text-rose-500 dark:hover:text-rose-400"
							on:click={startRename}
							title="重命名"
							aria-label="重命名"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="h-4 w-4"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
								/>
							</svg>
						</button>
						<button
							class="ui-icon-btn hover:text-red-500"
							on:click={() => {
								showDeleteConfirm = true;
							}}
							title="删除"
							aria-label="删除"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="h-4 w-4"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
								/>
							</svg>
						</button>
					{/if}
				</div>
			{/if}

			<div class="flex min-w-0 flex-1 items-center self-center">
				{#if showRenameInput}
					<input
						bind:value={editTitle}
						class="min-w-0 flex-1 border-b border-gray-300 bg-transparent px-1 py-0.5 text-sm outline-none focus:border-gray-500 dark:border-gray-700 dark:focus:border-gray-500"
						on:keydown={(e) => {
							if (e.key === "Enter") confirmRename();
							if (e.key === "Escape") cancelRename();
						}}
					/>
					<button
						class="ui-icon-btn ml-1 hover:text-rose-500"
						on:click={confirmRename}
						aria-label="保存标题"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="h-4 w-4"
						>
							<path
								fill-rule="evenodd"
								d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
					<button
						class="ui-icon-btn ml-0.5 hover:text-red-500"
						on:click={cancelRename}
						aria-label="取消重命名"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="h-4 w-4"
						>
							<path
								d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
							/>
						</svg>
					</button>
				{:else}
					<span class="overflow-hidden text-ellipsis whitespace-nowrap font-medium">
						{title != "" ? title : "情感疗愈伴侣"}
					</span>
				{/if}
			</div>
		</div>
	</div>
</nav>
