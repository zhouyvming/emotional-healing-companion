<script lang="ts">
	import { v4 as uuidv4 } from "uuid";

	import { goto } from "$app/navigation";
	import { db, chats, showSettings, chatId, user, sidebarOpen } from "$lib/stores";
	import { onMount } from "svelte";
	import toast from "svelte-french-toast";

	let show = window.innerWidth > 1280;
	sidebarOpen.set(show);
	let chatListExpanded = true;
	let collapsedGroups: Set<string> = new Set(["更早"]);
	let navElement;

	let search = "";
	let showDeleteHistoryConfirm = false;
	let pinnedIds: string[] = JSON.parse(localStorage.getItem("pinnedChats") ?? "[]");

	function togglePin(cid: string) {
		const idx = pinnedIds.indexOf(cid);
		if (idx >= 0) {
			pinnedIds.splice(idx, 1);
		} else {
			pinnedIds.unshift(cid);
		}
		pinnedIds = [...pinnedIds];
		localStorage.setItem("pinnedChats", JSON.stringify(pinnedIds));
	}

	onMount(async () => {
		await chats.set(await $db.getChats());
	});

	const loadChat = async (id) => {
		goto(`/chat/${id}`);
	};

	const deleteChatHistory = async () => {
		await $db.deleteAllChat();
		goto("/");
		await chatId.set(uuidv4());
	};

	// 日期分组
	function getDateGroup(timestamp: number | string): string {
		if (!timestamp) return "更早";
		const now = new Date();
		let ts = timestamp;
		// Safari 兼容：'YYYY-MM-DD HH:MM:SS' 需转为 ISO 格式
		if (typeof ts === "string" && ts.includes(" ") && !ts.includes("T")) {
			ts = ts.replace(" ", "T");
		}
		const date = new Date(ts);
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new Date(today.getTime() - 86400000);
		const weekAgo = new Date(today.getTime() - 7 * 86400000);

		if (date >= today) return "今天";
		if (date >= yesterday) return "昨天";
		if (date >= weekAgo) return "本周";
		return "更早";
	}

	// 过滤并分组
	$: filteredChats = $chats.filter((chat) => {
		if (search === "") return true;
		return chat.title.toLowerCase().includes(search.toLowerCase());
	});

	$: {
		// 清理已删除聊天的置顶引用
		const existingIds = new Set($chats.map((c: any) => c.id));
		const cleaned = pinnedIds.filter((id: string) => existingIds.has(id));
		if (cleaned.length !== pinnedIds.length) {
			pinnedIds = cleaned;
			localStorage.setItem("pinnedChats", JSON.stringify(pinnedIds));
		}
	}
	$: pinnedChats = $chats.filter((c) => pinnedIds.includes(c.id));
	$: unpinnedFiltered = filteredChats.filter((c) => !pinnedIds.includes(c.id));
	$: groupedChats = (() => {
		const groups: { label: string; chats: typeof filteredChats }[] = [];
		if (pinnedChats.length > 0) {
			groups.push({ label: "已置顶", chats: pinnedChats });
		}
		const order = ["今天", "昨天", "本周", "更早"];
		for (const label of order) {
			const items = unpinnedFiltered.filter((c) => getDateGroup(c.timestamp) === label);
			if (items.length > 0) groups.push({ label, chats: items });
		}
		return groups;
	})();
</script>

<div
	bind:this={navElement}
	class="{show
		? ''
		: '-translate-x-[260px]'} fixed left-0 top-0 z-40 h-[100dvh] w-[260px] border-r border-rose-100/80 bg-white/95 text-sm text-gray-800 shadow-lg shadow-rose-950/5 backdrop-blur-xl transition dark:border-gray-800 dark:bg-gray-950/95 dark:text-gray-200 dark:shadow-none"
>
	<div class="relative z-40 my-auto flex h-[100dvh] flex-col overflow-hidden py-2.5">
		<div class="px-2.5 mt-1 mb-2">
			<div class="relative">
				<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-rose-500">
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
					class="ui-field h-10 border-gray-200 bg-white/90 py-2 pl-9 pr-3 dark:border-gray-800 dark:bg-gray-900/90"
					placeholder="搜索"
					bind:value={search}
				/>
			</div>
		</div>

		<div class="px-2.5 flex justify-center space-x-2 mb-1">
			<button
				class="flex-grow flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 bg-rose-500 text-white hover:bg-rose-600 dark:bg-rose-500 dark:hover:bg-rose-400 transition text-sm font-medium"
				on:click={async () => {
					goto("/");
					await chatId.set(uuidv4());
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="w-4 h-4"
				>
					<path
						d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
					/>
				</svg>
				<span class="font-medium">新对话</span>
			</button>
		</div>

		<!-- 会话列表区域 -->
		<div class="pl-2.5 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2.5">
			<button
				class="flex min-h-[36px] items-center justify-between pr-3 py-1.5 hover:bg-rose-50 dark:hover:bg-gray-900 rounded-lg transition"
				on:click={() => {
					chatListExpanded = !chatListExpanded;
				}}
			>
				<span class="text-xs text-gray-500 dark:text-gray-400 font-medium select-none"
					>会话列表</span
				>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="2"
					stroke="currentColor"
					class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200 {chatListExpanded
						? 'rotate-90'
						: ''}"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
				</svg>
			</button>

			{#if chatListExpanded}
				<div class="my-1 flex-1 flex flex-col overflow-y-auto">
					{#each groupedChats as group}
						<button
							class="sticky top-0 flex min-h-[32px] items-center gap-1 rounded-lg bg-white/95 py-1.5 pl-2 text-xs font-medium text-gray-400 transition hover:bg-rose-50 dark:bg-gray-950/95 dark:text-gray-500 dark:hover:bg-gray-900"
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
								class="w-3 h-3 transition-transform duration-200 {collapsedGroups.has(group.label)
									? ''
									: 'rotate-90'}"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M8.25 4.5l7.5 7.5-7.5 7.5"
								/>
							</svg>
							<span>{group.label}</span>
							<span class="ml-auto pr-2 text-xs">{group.chats.length}</span>
						</button>
						{#if !collapsedGroups.has(group.label)}
							<div class="flex flex-col space-y-0.5">
								{#each group.chats as chat}
									<div class="w-full pr-2 relative group">
										<button
											class="flex min-h-[38px] w-full rounded-lg px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-gray-900 {chat.id ===
											$chatId
												? 'bg-rose-100 text-rose-900 dark:bg-gray-800 dark:text-rose-200'
												: ''} transition text-left"
											on:click={() => {
												loadChat(chat.id);
											}}
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
												<div
													class="text-left self-center overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0"
												>
													{chat.title}
												</div>
												<button
													class="flex min-h-[32px] min-w-[32px] flex-shrink-0 items-center justify-center rounded-md opacity-100 transition hover:bg-amber-100 md:opacity-0 md:group-hover:opacity-100 dark:hover:bg-amber-900/30 cursor-pointer {pinnedIds.includes(
														chat.id
													)
														? 'text-amber-500'
														: 'text-gray-400'}"
													on:click|stopPropagation={() => togglePin(chat.id)}
													title={pinnedIds.includes(chat.id) ? "取消置顶" : "置顶"}
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 20 20"
														fill="currentColor"
														class="w-3.5 h-3.5"
													>
														<path
															d="M11.77 1.16a1.5 1.5 0 012.12 0l.95.95a1.5 1.5 0 010 2.12l-.95.95a1.5 1.5 0 01-2.12 0l-.95-.95a1.5 1.5 0 010-2.12l.95-.95zM8.083 6.035a1.5 1.5 0 01-1.061.44H3.467l3.462 3.462A1.5 1.5 0 017.39 11H6.93a1.5 1.5 0 01-1.06-.44L2.22 6.91a1.5 1.5 0 01-.28-1.692l.886-1.77a1.5 1.5 0 011.558-.836l5.268.388a1.5 1.5 0 011.207 2.207l-.776 1.828z"
														/>
													</svg>
												</button>

												<button
													class="flex min-h-[32px] min-w-[32px] flex-shrink-0 items-center justify-center rounded-md text-gray-400 opacity-100 transition hover:bg-red-100 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 dark:hover:bg-red-900/30 cursor-pointer"
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
													<svg
														xmlns="http://www.w3.org/2000/svg"
														fill="none"
														viewBox="0 0 24 24"
														stroke-width="2"
														stroke="currentColor"
														class="w-3.5 h-3.5"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															d="M6 18L18 6M6 6l12 12"
														/>
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

		<div
			class="flex-shrink-0 border-t border-gray-200 bg-white/95 px-2.5 pt-2 pb-[max(env(safe-area-inset-bottom),0.875rem)] dark:border-gray-800 dark:bg-gray-950/95 md:pb-2"
		>
			<div class="flex flex-col gap-1">
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
						class="flex min-h-[38px] w-full items-center rounded-lg px-3 py-1.5 transition hover:bg-rose-50 dark:hover:bg-gray-900"
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

				<!-- 设置 -->
				<button
					class="flex min-h-[38px] w-full items-center rounded-lg px-3 py-1.5 transition hover:bg-rose-50 dark:hover:bg-gray-900"
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
				<div
					class="mt-1 flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 py-1.5 transition hover:bg-rose-50 dark:hover:bg-gray-900"
				>
					<button class="flex items-center gap-3 flex-1 min-w-0" on:click={() => goto("/profile")}>
						<div
							class="flex-shrink-0 w-8 h-8 rounded-full bg-rose-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center"
						>
							{#if $user?.avatar}
								<img src={$user.avatar} alt="avatar" class="w-full h-full object-cover" />
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="w-5 h-5 text-rose-500 dark:text-rose-300"
								>
									<path
										d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z"
									/>
								</svg>
							{/if}
						</div>
						<div class="flex-1 text-left min-w-0">
							<div class="text-sm font-medium truncate">{$user?.username ?? "用户"}</div>
							<div class="text-xs text-gray-400 dark:text-gray-500 truncate">
								{$user?.email ?? ""}
							</div>
						</div>
					</button>
					<button
						class="flex-shrink-0 p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition"
						on:click={() => {
							localStorage.removeItem("user");
							goto("/login");
						}}
						title="退出登录"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-5 h-5 text-red-500"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
							/>
						</svg>
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- 移动端遮罩层 -->
	{#if show}
		<button
			class="fixed inset-y-0 left-[260px] right-0 z-30 bg-black/30 md:hidden border-0 cursor-default"
			on:click={() => {
				show = false;
				sidebarOpen.set(false);
			}}
		/>
	{/if}
	<div
		class="fixed left-0 top-[50dvh] z-50 -translate-y-1/2 translate-x-[260px] rotate-0 transition-transform"
	>
		<button
			class="group rounded-r-xl border border-l-0 border-rose-100 bg-white/95 shadow-md shadow-rose-950/10 dark:border-gray-800 dark:bg-gray-950/95 md:border-0 md:bg-transparent md:shadow-none"
			on:click={() => {
				show = !show;
				sidebarOpen.set(show);
			}}
			><span class="" data-state="closed"
				><div
					class="flex h-11 w-8 items-center justify-center opacity-80 transition group-hover:opacity-100 md:h-[72px] md:opacity-30"
				>
					<div class="flex h-6 w-6 flex-col items-center">
						<div
							class="h-3 w-1 rounded-full bg-gray-500 dark:bg-gray-300 rotate-0 translate-y-[0.15rem] {show
								? 'group-hover:rotate-[15deg]'
								: 'group-hover:rotate-[-15deg]'}"
						/>
						<div
							class="h-3 w-1 rounded-full bg-gray-500 dark:bg-gray-300 rotate-0 translate-y-[-0.15rem] {show
								? 'group-hover:rotate-[-15deg]'
								: 'group-hover:rotate-[15deg]'}"
						/>
					</div>
				</div>
			</span>
		</button>
	</div>
</div>
