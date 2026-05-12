<script lang="ts">
	import { v4 as uuidv4 } from "uuid";
	import { onMount, tick } from "svelte";
	import { goto } from "$app/navigation";
	import { openDB } from "idb";

	import { info, showSettings, settings, models, db, chats, chatId, user } from "$lib/stores";

	import SettingsModal from "$lib/components/chat/SettingsModal.svelte";
	import Sidebar from "$lib/components/layout/Sidebar.svelte";
	import toast from "svelte-french-toast";
	import { OLLAMA_API_BASE_URL } from "$lib/constants";
	import { datetimeNow } from "$lib/utils";

	let requiredOllamaVersion = "0.1.16";
	let loaded = false;
	let connectionError = "";

	const getToken = () => {
		const userStr = localStorage.getItem("user");
		if (!userStr) return null;
		try {
			return JSON.parse(userStr).token ?? null;
		} catch {
			return null;
		}
	};

	const getCurrentUsername = () => {
		const userStr = localStorage.getItem("user");
		return userStr ? JSON.parse(userStr).username : "guest";
	};

	const migrateFromIndexedDB = async () => {
		const MIGRATION_KEY = 'chats_migrated_to_mysql';
		if (localStorage.getItem(MIGRATION_KEY)) return;

		try {
			const oldDB = await openDB('Chats');
			const allChats = await oldDB.getAll('chats');
			oldDB.close();

			if (allChats.length === 0) {
				localStorage.setItem(MIGRATION_KEY, 'true');
				return;
			}

			const username = getCurrentUsername();
			const token = getToken();
			let migrated = 0;
			for (const chat of allChats) {
				try {
					const headers: Record<string, string> = { 'Content-Type': 'application/json' };
					if (token) headers['Authorization'] = `Bearer ${token}`;
					await fetch('/api/chats', {
						method: 'POST',
						headers,
						body: JSON.stringify({ ...chat, username })
					});
					migrated++;
				} catch (e) {
					console.warn('迁移聊天失败:', chat.id, e);
				}
			}

			if (migrated > 0) {
				toast.success(`已迁移 ${migrated} 条历史会话到云端`);
			}
		} catch (e) {
			console.warn('IndexedDB 迁移跳过:', e);
		} finally {
			localStorage.setItem(MIGRATION_KEY, 'true');
		}
	};

	const getModels = async () => {
		const res = await fetch(`${$settings?.API_BASE_URL ?? OLLAMA_API_BASE_URL}/tags`, {
			method: "GET",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json"
			}
		})
			.then(async (res) => {
				if (!res.ok) throw await res.json();
				return res.json();
			})
			.catch((error) => {
				if ("detail" in error) {
					connectionError = error.detail;
				} else {
					connectionError = "无法连接到 Ollama 服务，请检查服务是否启动或 API 地址是否正确";
					toast.error("Server connection failed");
				}
				return null;
			});
		if (res) connectionError = "";

		return res?.models ?? [];
	};

	const api = (path: string, options?: RequestInit) => {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...(options?.headers as Record<string, string> ?? {})
		};
		const token = getToken();
		if (token) headers['Authorization'] = `Bearer ${token}`;

		return fetch(path, { ...options, headers })
			.then(async (res) => {
				if (res.status === 401) {
					localStorage.removeItem('user');
					goto('/login');
					throw new Error('登录已过期');
				}
				if (!res.ok) throw await res.json();
				return res.json();
			});
	};

	const getDB = () => {
		const refreshChats = async () => {
			const data = await api(`/api/chats`);
			await chats.set(data.map((item: any) => ({ title: item.title, id: item.id, timestamp: item.timestamp })));
		};

		const self = {
			getChatById: async (id: string) => {
				return api(`/api/chats/${id}`);
			},
			getChats: async () => {
				const data = await api(`/api/chats`);
				return data.map((item: any) => ({ title: item.title, id: item.id, timestamp: item.timestamp }));
			},
			exportChats: async () => {
				return api(`/api/chats`);
			},
			addChats: async (_chats: any[]) => {
				for (const chat of _chats) {
					await api('/api/chats', {
						method: 'POST',
						body: JSON.stringify(chat)
					});
				}
				await refreshChats();
			},
			addChat: async (chat: any) => {
				await api('/api/chats', {
					method: 'POST',
					body: JSON.stringify(chat)
				});
			},
			createNewChat: async (chat: any) => {
				await api('/api/chats', {
					method: 'POST',
					body: JSON.stringify({ ...chat, timestamp: datetimeNow() })
				});
				await refreshChats();
			},
			updateChatById: async (id: string, updated: any) => {
				await api(`/api/chats/${id}`, {
					method: 'PUT',
					body: JSON.stringify({ ...updated, timestamp: datetimeNow() })
				});
				await refreshChats();
			},
			deleteChatById: async (id: string) => {
				if ($chatId === id) {
					goto("/");
					await chatId.set(uuidv4());
				}
				await api(`/api/chats/${id}`, { method: 'DELETE' });
				await refreshChats();
			},
			deleteAllChat: async () => {
				await api(`/api/chats`, { method: 'DELETE' });
				await refreshChats();
			}
		};
		return self;
	};

	const getOllamaVersion = async () => {
		const res = await fetch(`${$settings?.API_BASE_URL ?? OLLAMA_API_BASE_URL}/version`, {
			method: "GET",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json"
			}
		})
			.then(async (res) => {
				if (!res.ok) throw await res.json();
				return res.json();
			})
			.catch((error) => {
				if ("detail" in error) {
					connectionError = error.detail;
				} else {
					connectionError = "无法连接到 Ollama 服务，请检查服务是否启动或 API 地址是否正确";
					toast.error("Server connection failed");
				}
				return null;
			});

		if (res) connectionError = "";

		return res?.version ?? "0";
	};

	const setOllamaVersion = async (ollamaVersion: string) => {
		await info.set({ ...$info, ollama: { version: ollamaVersion } });

		if (
			ollamaVersion.localeCompare(requiredOllamaVersion, undefined, {
				numeric: true,
				sensitivity: "case",
				caseFirst: "upper"
			}) < 0
		) {
			toast.error(`Ollama Version: ${ollamaVersion}`);
		}
	};

	onMount(async () => {
		await migrateFromIndexedDB();

		await settings.set(JSON.parse(localStorage.getItem("settings") ?? "{}"));

		const savedUser = JSON.parse(localStorage.getItem("user") ?? "null");
		await user.set(savedUser);

		await models.set(await getModels());

		let _db = await getDB();
		await db.set(_db);

		await setOllamaVersion(await getOllamaVersion());

		await tick();
		loaded = true;
	});

	const recheckConnection = async () => {
		connectionError = "";
		await models.set(await getModels());
		await setOllamaVersion(await getOllamaVersion());
	};
</script>

{#if loaded}
	<div class="app relative">
		{#if ($info?.ollama?.version ?? "0").localeCompare( requiredOllamaVersion, undefined, { numeric: true, sensitivity: "case", caseFirst: "upper" } ) < 0}
			<div class="absolute w-full h-full flex z-50">
				<div
					class="absolute rounded-xl w-full h-full backdrop-blur bg-gray-900/60 flex justify-center"
				>
					<div class="m-auto pb-44 flex flex-col justify-center">
						<div class="max-w-md">
							<div class="text-center dark:text-white text-2xl font-medium z-50">
								Connection Issue or Update Needed
							</div>

							<div class=" mt-4 text-center text-sm dark:text-gray-200 w-full">
								Oops! It seems like your Ollama needs a little attention. <br
									class=" hidden sm:flex"
								/>We've detected either a connection hiccup or observed that you're using an older
								version. Ensure you're on the latest Ollama version
								<br class=" hidden sm:flex" />(version
								<span class=" dark:text-white font-medium">{requiredOllamaVersion} or higher</span>)
								or check your connection.
							</div>

							<div class=" mt-6 mx-auto relative group w-fit">
								<button
									class="relative z-20 flex px-5 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition font-medium text-sm"
									on:click={async () => {
										await setOllamaVersion(await getOllamaVersion());
									}}
								>
									Check Again
								</button>

								<button
									class="text-xs text-center w-full mt-2 text-gray-400 underline"
									on:click={async () => {
										await setOllamaVersion(requiredOllamaVersion);
									}}>Close</button
								>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if connectionError}
			<div class="fixed top-14 left-0 right-0 z-40 flex justify-center pointer-events-none">
				<div class="pointer-events-auto mx-4 mt-4 px-5 py-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl shadow-lg max-w-lg w-full">
					<div class="flex items-start gap-3">
						<div class="text-amber-500 mt-0.5">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
								<path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
							</svg>
						</div>
						<div class="flex-1 text-sm">
							<p class="font-medium text-amber-800 dark:text-amber-200">无法连接到 Ollama</p>
							<p class="mt-1 text-amber-700 dark:text-amber-300">{connectionError}</p>
						</div>
						<button class="text-amber-400 hover:text-amber-500 transition" on:click={() => connectionError = ""}>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
								<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
							</svg>
						</button>
					</div>
					<div class="flex gap-2 mt-3">
						<button
							class="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-700 transition"
							on:click={recheckConnection}>重新检查</button>
						<button
							class="px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition"
							on:click={async () => {
								await showSettings.set(true);
								connectionError = "";
							}}>打开设置</button>
					</div>
				</div>
			</div>
		{/if}

		<div
			class=" text-gray-700 dark:text-gray-100 bg-white dark:bg-gray-800 min-h-screen overflow-auto flex flex-row"
		>
			<Sidebar />

			<SettingsModal bind:show={$showSettings} />

			<slot />
		</div>
	</div>
{/if}

