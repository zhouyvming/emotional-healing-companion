<script lang="ts">
	import { v4 as uuidv4 } from "uuid";

	import { goto } from "$app/navigation";
	import { db, chats, showSettings, chatId, user } from "$lib/stores";
	import { onMount } from "svelte";
	import toast from "svelte-french-toast";

	let show = false;
	let chatListExpanded = true;
	let collapsedGroups: Set<string> = new Set(['更早']);
	let navElement;

	let search = "";
	let showDeleteHistoryConfirm = false;

	onMount(async () => {
		if (window.innerWidth > 1280) {
			show = true;
		}

		await chats.set(await $db.getChats());
	});

	const loadChat = async (id) => {
		goto(`/c/${id}`);
	};

	const deleteChatHistory = async () => {
		await $db.deleteAllChat();
	};


	// 日期分组
	function getDateGroup(timestamp: number | string): string {
		if (!timestamp) return '更早';
		const now = new Date();
		const date = new Date(timestamp);
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new Date(today.getTime() - 86400000);
		const weekAgo = new Date(today.getTime() - 7 * 86400000);

		if (date >= today) return '今天';
		if (date >= yesterday) return '昨天';
		if (date >= weekAgo) return '本周';
		return '更早';
	}

	// 过滤并分组
	$: filteredChats = $chats.filter((chat) => {
		if (search === "") return true;
		return chat.title.toLowerCase().includes(search.toLowerCase());
	});

	$: groupedChats = (() => {
		const groups: { label: string; chats: typeof filteredChats }[] = [];
		const order = ['今天', '昨天', '本周', '更早'];
		for (const label of order) {
			const items = filteredChats.filter(c => getDateGroup(c.timestamp) === label);
			if (items.length > 0) groups.push({ label, chats: items });
		}
		return groups;
	})();

	const handleExport = async () => {
		const data = await $db.exportChats();
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "ollama-chats-backup.json";
		a.click();
		URL.revokeObjectURL(url);
		toast.success("对话已导出");
	};
</script>

<div
	bind:this={navElement}
	class="h-screen {show
		? ''
		: '-translate-x-[260px]'} w-[260px] fixed top-0 left-0 z-40 transition bg-pink-50 dark:bg-pink-900 text-gray-800 dark:text-gray-200 shadow-2xl text-sm"
>
	<div class="py-2.5 my-auto flex flex-col justify-between h-screen">
		<div class="px-2.5 flex justify-center space-x-2">
			<button
				class="flex-grow flex justify-between rounded-md px-3 py-1.5 mt-2 hover:bg-pink-100 dark:hover:bg-pink-800 transition"
				on:click={async () => {
					goto("/");
					await chatId.set(uuidv4());
				}}
			>
				<div class="flex self-center">
					<div class="self-center font-medium text-sm">新的对话 +</div>
				</div>

				<div class="self-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="w-4 h-4"
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

		<div class="px-2.5 mt-1 mb-2 flex justify-center space-x-2">
			<div class="flex w-full">
				<div class="self-center pl-3 py-2 rounded-l bg-pink-100 dark:bg-pink-800">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="w-4 h-4"
					>
						<path
							fill-rule="evenodd"
							d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>

				<input
					class="w-full rounded-r py-1.5 pl-2.5 pr-4 text-sm text-gray-800 dark:text-gray-300 bg-pink-100 dark:bg-pink-800 outline-none focus:bg-white dark:focus:bg-pink-900 transition"
					placeholder="搜索"
					bind:value={search}
				/>
			</div>
		</div>

		<!-- 会话列表区域 -->
		<div class="pl-2.5 flex-1 flex flex-col min-h-0">
			<button
				class="flex items-center justify-between pr-3 py-1.5 hover:bg-pink-100 dark:hover:bg-pink-800 rounded-md transition"
				on:click={() => { chatListExpanded = !chatListExpanded; }}
			>
				<span class="text-xs text-gray-500 dark:text-gray-400 font-medium select-none">会话列表</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200 {chatListExpanded ? 'rotate-90' : ''}"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
				</svg>
			</button>

			{#if chatListExpanded}
				<div class="my-1 flex-1 flex flex-col overflow-y-auto">
					{#each groupedChats as group}
						<button
							class="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 font-medium py-1.5 pl-2 select-none sticky top-0 bg-pink-50 dark:bg-pink-900 hover:bg-pink-100 dark:hover:bg-pink-800 transition rounded-sm"
							on:click={() => {
								if (collapsedGroups.has(group.label)) {
									collapsedGroups.delete(group.label);
								} else {
									collapsedGroups.add(group.label);
								}
								collapsedGroups = new Set(collapsedGroups);
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="2"
								stroke="currentColor"
								class="w-3 h-3 transition-transform duration-200 {collapsedGroups.has(group.label) ? '' : 'rotate-90'}"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
							</svg>
							<span>{group.label}</span>
							<span class="ml-auto pr-2 text-xs">{group.chats.length}</span>
						</button>
						{#if !collapsedGroups.has(group.label)}
							<div class="flex flex-col space-y-0.5">
								{#each group.chats as chat}
								<div class="w-full pr-2 relative group">
									<button
										class="w-full flex rounded-md px-3 py-2 hover:bg-pink-100 dark:hover:bg-pink-800 {chat.id === $chatId
											? 'bg-pink-200 dark:bg-pink-700'
											: ''} transition text-left"
										on:click={() => { loadChat(chat.id); }}
									>
										<div class="flex self-center flex-1 min-w-0">
											<div class="self-center mr-2 flex-shrink-0">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													fill="none"
													viewBox="0 0 24 24"
													stroke-width="1.5"
													stroke="currentColor"
													class="w-4 h-4"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
													/>
												</svg>
											</div>
											<div class="text-left self-center overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">
												{chat.title}
											</div>
											<button
												class="flex-shrink-0 p-0.5 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition cursor-pointer"
												on:click|stopPropagation={async () => {
									try {
										await $db.deleteChatById(chat.id);
										toast.success("会话已删除");
									} catch {
										toast.error("删除失败");
									}
								}}
												title="删除会话"
											>
												<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
													<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
												</svg>
											</button>
										</div>
									</button>
								</div>
							{/each}
						</div>
					{/if}
				{/each}
					{#if filteredChats.length === 0}
						<div class="text-center text-gray-400 dark:text-gray-500 text-xs py-4">暂无会话</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="px-2.5">
			<hr class="border-gray-300 dark:border-gray-700 mb-2 w-full" />

			<div class="flex flex-col space-y-0.5">
				<!-- 清除所有对话 -->
				{#if showDeleteHistoryConfirm}
					<div class="flex justify-between rounded-md items-center py-3 px-3.5 w-full transition">
						<div class="flex items-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="w-5 h-5 mr-3"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
								/>
							</svg>
							<span>你确定吗?</span>
						</div>

						<div class="flex space-x-1.5 items-center">
							<button
								class="hover:text-white transition"
								on:click={() => {
									deleteChatHistory();
									showDeleteHistoryConfirm = false;
								}}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="w-4 h-4"
								>
									<path
										fill-rule="evenodd"
										d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
										clip-rule="evenodd"
									/>
								</svg>
							</button>
							<button
								class="hover:text-white transition"
								on:click={() => {
									showDeleteHistoryConfirm = false;
								}}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="w-4 h-4"
								>
									<path
										d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
									/>
								</svg>
							</button>
						</div>
					</div>
				{:else}
					<button
						class="flex rounded-md py-3 px-3.5 w-full hover:bg-pink-50 dark:hover:bg-pink-900 transition"
						on:click={() => {
							showDeleteHistoryConfirm = true;
						}}
					>
						<div class="mr-3">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="w-5 h-5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
								/>
							</svg>
						</div>
						<span>清除所有对话</span>
					</button>
				{/if}

				<!-- 建议及反馈 -->
				<button
					class="flex rounded-md py-3 px-3.5 w-full hover:bg-pink-50 dark:hover:bg-pink-900 transition"
					on:click={() => {
						goto('/advice_table');
					}}
				>
					<div class="self-center mr-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-5 h-5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
							/>
						</svg>
					</div>
					<div class="self-center font-medium">建议及反馈</div>
				</button>

				<!-- 导出对话 -->
				<button
					class="flex rounded-md py-3 px-3.5 w-full hover:bg-pink-50 dark:hover:bg-pink-900 transition"
					on:click={handleExport}
				>
					<div class="self-center mr-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-5 h-5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
							/>
						</svg>
					</div>
					<div class="self-center font-medium">导出对话</div>
				</button>

				<!-- 设置 -->
				<button
					class="flex rounded-md py-3 px-3.5 w-full hover:bg-pink-50 dark:hover:bg-pink-900 transition"
					on:click={async () => {
						await showSettings.set(true);
					}}
				>
					<div class="self-center mr-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="w-5 h-5"
						>
							<path
								fill-rule="evenodd"
								d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.113a7.047 7.047 0 010-2.228L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="self-center font-medium">设置</div>
				</button>

				<!-- 用户信息入口 -->
				<div class="flex items-center gap-3 rounded-md py-2.5 px-3.5 w-full hover:bg-pink-100 dark:hover:bg-pink-800 transition mt-2">
					<button class="flex items-center gap-3 flex-1 min-w-0" on:click={() => goto('/profile')}>
						<div class="flex-shrink-0 w-8 h-8 rounded-full bg-pink-200 dark:bg-pink-700 overflow-hidden flex items-center justify-center">
							{#if $user?.avatar}
								<img src={$user.avatar} alt="avatar" class="w-full h-full object-cover" />
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-pink-500 dark:text-pink-300">
									<path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
								</svg>
							{/if}
						</div>
						<div class="flex-1 text-left min-w-0">
							<div class="text-sm font-medium truncate">{$user?.username ?? '用户'}</div>
							<div class="text-xs text-gray-400 dark:text-gray-500 truncate">{$user?.email ?? ''}</div>
						</div>
					</button>
					<button
						class="flex-shrink-0 p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition"
						on:click={() => { localStorage.removeItem("user"); goto("/login"); }}
						title="退出登录"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-red-500">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
						</svg>
					</button>
				</div>

			</div>
		</div>
	</div>


		<!-- 移动端遮罩层 -->
		{#if show}
			<button
				class="fixed inset-0 z-30 bg-black/30 md:hidden border-0 cursor-default"
				on:click={() => { show = false; }}
			/>
		{/if}
	<div
		class="fixed left-0 top-[50dvh] z-40 -translate-y-1/2 transition-transform translate-x-[255px] md:translate-x-[260px] rotate-0"
	>
		<button
			class=" group"
			on:click={() => {
				show = !show;
			}}
			><span class="" data-state="closed"
				><div
					class="flex h-[72px] w-8 items-center justify-center opacity-20 group-hover:opacity-100 transition"
				>
					<div class="flex h-6 w-6 flex-col items-center">
						<div
							class="h-3 w-1 rounded-full bg-[#0f0f0f] dark:bg-white rotate-0 translate-y-[0.15rem] {show
								? 'group-hover:rotate-[15deg]'
								: 'group-hover:rotate-[-15deg]'}"
						/>
						<div
							class="h-3 w-1 rounded-full bg-[#0f0f0f] dark:bg-white rotate-0 translate-y-[-0.15rem] {show
								? 'group-hover:rotate-[-15deg]'
								: 'group-hover:rotate-[15deg]'}"
						/>
					</div>
				</div>
			</span>
		</button>
	</div>
</div>
