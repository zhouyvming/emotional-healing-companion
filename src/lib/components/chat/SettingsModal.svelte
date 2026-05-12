<script lang="ts">
	import Modal from "../common/Modal.svelte";

	import { WEB_UI_VERSION, OLLAMA_API_BASE_URL } from "$lib/constants";
	import toast from "svelte-french-toast";
	import { onMount } from "svelte";
	import { info, settings, models } from "$lib/stores";
	import Advanced from "./Settings/Advanced.svelte";

	export let show = false;

	const saveSettings = async (updated: Record<string, any>) => {
		await settings.set({ ...$settings, ...updated });
		localStorage.setItem("settings", JSON.stringify($settings));
	};

	let selectedTab = "general";

	// General
	let API_BASE_URL = OLLAMA_API_BASE_URL;
	let theme = "dark";
	let titleAutoGenerate = true;
	let responseAutoCopy = false;
	let searchEnabled = false;
	let searchProvider = 'auto';
	let systemPrompt = '';
	let searchPromptTemplate = '';
	let systemAvatarInput: HTMLInputElement;
	let systemAvatarPreview = "";

	// Model management
	let pullModelName = "";
	let pulling = false;
	let pullProgress = "";
	let deleting: Record<string, boolean> = {};
	let showDeleteModelConfirm = "";

	const pullModel = async () => {
		if (!pullModelName.trim()) {
			toast.error("请输入模型名称");
			return;
		}
		pulling = true;
		pullProgress = `正在拉取 ${pullModelName.trim()}...`;
		try {
			const res = await fetch(`${$settings?.API_BASE_URL ?? OLLAMA_API_BASE_URL}/pull`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: pullModelName.trim(), stream: true })
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "拉取失败");
			}
			const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				try {
					const lines = value.split("\n").filter(l => l !== "");
					for (const line of lines) {
						const data = JSON.parse(line);
						if (data.status) {
							pullProgress = data.status;
							if (data.completed && data.total) {
								pullProgress += ` (${Math.round(data.completed / data.total * 100)}%)`;
							}
						}
					}
				} catch {}
			}
			toast.success(`模型 ${pullModelName.trim()} 拉取成功`);
			pullModelName = "";
		} catch (error: any) {
			toast.error(error.message || "拉取失败");
		} finally {
			pulling = false;
			pullProgress = "";
		}
	};

	const deleteModel = async (modelName: string) => {
		deleting[modelName] = true;
		deleting = { ...deleting };
		try {
			const res = await fetch(`${$settings?.API_BASE_URL ?? OLLAMA_API_BASE_URL}/delete`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: modelName })
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "删除失败");
			}
			toast.success(`模型 ${modelName} 已删除`);
			showDeleteModelConfirm = "";
		} catch (error: any) {
			toast.error(error.message || "删除失败");
		} finally {
			delete deleting[modelName];
			deleting = { ...deleting };
		}
	};

	const formatSize = (bytes: number) => {
		if (!bytes) return "N/A";
		if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + " GB";
		if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + " MB";
		if (bytes > 1e3) return (bytes / 1e3).toFixed(1) + " KB";
		return bytes + " B";
	};

	// Advanced
	let requestFormat = "";
	let options: Record<string, any> = {
		seed: 0,
		temperature: "",
		repeat_penalty: "",
		repeat_last_n: "",
		mirostat: "",
		mirostat_eta: "",
		mirostat_tau: "",
		top_k: "",
		top_p: "",
		stop: "",
		tfs_z: "",
		num_ctx: ""
	};

	const checkOllamaConnection = async () => {
		if (API_BASE_URL === "") {
			API_BASE_URL = OLLAMA_API_BASE_URL;
		}
		try {
			await getModels(API_BASE_URL);
			toast.success("服务器连接已验证");
			saveSettings({ API_BASE_URL });
		} catch {
			toast.error("服务器连接失败");
		}
	};

	const toggleTheme = () => {
		theme = theme === "dark" ? "light" : "dark";
		localStorage.theme = theme;
		document.documentElement.classList.remove(theme === "dark" ? "light" : "dark");
		document.documentElement.classList.add(theme);
	};

	const handleSystemAvatarUpload = (e: Event) => {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement("canvas");
				const maxSize = 200;
				let w = img.width;
				let h = img.height;
				if (w > h) {
					if (w > maxSize) { h = h * maxSize / w; w = maxSize; }
				} else {
					if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
				}
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext("2d");
				ctx?.drawImage(img, 0, 0, w, h);
				const base64 = canvas.toDataURL("image/jpeg", 0.85);
				systemAvatarPreview = base64;
			};
			img.src = ev.target?.result as string;
		};
		reader.readAsDataURL(file);
		target.value = "";
	};

	const removeSystemAvatar = () => {
		systemAvatarPreview = "";
	};

	const saveAllSettings = () => {
		const updated: Record<string, any> = {
			API_BASE_URL: API_BASE_URL === "" ? OLLAMA_API_BASE_URL : API_BASE_URL,
			titleAutoGenerate,
			responseAutoCopy,
			searchEnabled,
			searchProvider,
			systemPrompt,
			searchPromptTemplate,
			requestFormat: requestFormat !== "" ? requestFormat : undefined,
		};

		for (const [key, value] of Object.entries(options)) {
			if (value !== "" && value !== undefined) {
				updated[key] = value;
			}
		}

		saveSettings(updated);

		// 保存系统头像到用户资料
		if (systemAvatarPreview !== "") {
			const stored = JSON.parse(localStorage.getItem("user") ?? "{}");
			const token = stored.token;
			const headers: Record<string, string> = { "Content-Type": "application/json" };
			if (token) headers["Authorization"] = `Bearer ${token}`;
			fetch("/api/user/profile", {
				method: "PUT",
				headers,
				body: JSON.stringify({ systemAvatar: systemAvatarPreview })
			}).then(async (res) => {
				if (res.ok) {
					const data = await res.json();
					const updatedUser = { ...stored, ...data.user };
					localStorage.setItem("user", JSON.stringify(updatedUser));
				}
			}).catch(() => {});
		}

		toast.success("设置已保存");
		show = false;
	};

	const getModels = async (url = "") => {
		const res = await fetch(`${url || $settings?.API_BASE_URL || OLLAMA_API_BASE_URL}/tags`, {
			method: "GET",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json"
			}
		});
		if (!res.ok) throw await res.json();
		return res.json();
	};

	onMount(() => {
		const stored = JSON.parse(localStorage.getItem("settings") ?? "{}");

		theme = localStorage.theme ?? "dark";
		titleAutoGenerate = stored.titleAutoGenerate ?? true;
		responseAutoCopy = stored.responseAutoCopy ?? false;
		searchEnabled = stored.searchEnabled ?? false;
		searchProvider = stored.searchProvider ?? 'auto';
		systemPrompt = stored.systemPrompt ?? '';
		searchPromptTemplate = stored.searchPromptTemplate ?? '';
		const userData = JSON.parse(localStorage.getItem("user") ?? "{}");
		systemAvatarPreview = userData.system_avatar ?? "";
		API_BASE_URL = stored.API_BASE_URL ?? OLLAMA_API_BASE_URL;
		requestFormat = stored.requestFormat ?? "";

		if (stored.seed !== undefined) options.seed = stored.seed;
		for (const key of Object.keys(options)) {
			if (stored[key] !== undefined) {
				options[key] = stored[key];
			}
		}
	});
</script>

<Modal bind:show>
	<div>
		<!-- Header -->
		<div class="flex justify-between items-center dark:text-gray-300 px-6 py-4">
			<div class="text-lg font-semibold">设置</div>
			<button
				class="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition"
				on:click={() => { show = false; }}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
					<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
				</svg>
			</button>
		</div>
		<hr class="dark:border-gray-800" />

		<div class="flex flex-col md:flex-row w-full p-4 md:p-5 md:space-x-5">
			<!-- Tabs -->
			<div class="tabs flex flex-row overflow-x-auto space-x-1 md:space-x-0 md:space-y-1 md:flex-col flex-shrink-0 md:w-36 dark:text-gray-200 text-sm mb-4 md:mb-0">
				<button
					class="px-3 py-2.5 min-w-fit rounded-lg flex items-center transition {selectedTab === 'general'
						? 'bg-gray-200 dark:bg-gray-700 font-medium'
						: 'hover:bg-gray-200 dark:hover:bg-gray-800'}"
					on:click={() => { selectedTab = "general"; }}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-2">
						<path fill-rule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.113a7.047 7.047 0 010-2.228L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
					</svg>
					常规
				</button>

				<button
					class="px-3 py-2.5 min-w-fit rounded-lg flex items-center transition {selectedTab === 'models'
						? 'bg-gray-200 dark:bg-gray-700 font-medium'
						: 'hover:bg-gray-200 dark:hover:bg-gray-800'}"
					on:click={() => { selectedTab = "models"; }}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-2">
						<path d="M5.25 2.25a3 3 0 00-3 3v4.5a3 3 0 003 3h.25v3.987a1 1 0 001.664.748l4.139-3.099a.73.73 0 01.447-.136h3.5a3 3 0 003-3v-4.5a3 3 0 00-3-3h-10z" />
						<path fill-rule="evenodd" d="M4.25 8.25a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5H5a.75.75 0 01-.75-.75zm.75 3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5H5z" clip-rule="evenodd" />
					</svg>
					模型
				</button>

				<button
					class="px-3 py-2.5 min-w-fit rounded-lg flex items-center transition {selectedTab === 'advanced'
						? 'bg-gray-200 dark:bg-gray-700 font-medium'
						: 'hover:bg-gray-200 dark:hover:bg-gray-800'}"
					on:click={() => { selectedTab = "advanced"; }}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-2">
						<path fill-rule="evenodd" d="M4.606 12.97a.75.75 0 01-.134 1.051 2.494 2.494 0 00-.93 2.437 2.494 2.494 0 002.437-.93.75.75 0 111.186.918 3.995 3.995 0 01-4.482 1.492.75.75 0 01-.461-.461 3.994 3.994 0 011.492-4.482.75.75 0 01.892-.025z" clip-rule="evenodd" />
						<path fill-rule="evenodd" d="M4.606 7.03a.75.75 0 00-.134-1.051 2.494 2.494 0 01-.93-2.437A2.494 2.494 0 005.98 4.473a.75.75 0 101.186-.918 3.995 3.995 0 00-4.482-1.492.75.75 0 00-.461.461 3.994 3.994 0 001.492 4.482.75.75 0 00.892.025z" clip-rule="evenodd" />
						<path d="M13.06 4.94a1.5 1.5 0 012.12 0l.94.94a1.5 1.5 0 010 2.12l-1 1a1.5 1.5 0 01-2.12 0l-.94-.94a1.5 1.5 0 010-2.12l1-1z" />
						<path d="M9.475 8.525a1.5 1.5 0 012.12 0l.93.93a1.5 1.5 0 010 2.12l-5.24 5.24a1.5 1.5 0 01-2.12 0l-.93-.93a1.5 1.5 0 010-2.12l5.24-5.24z" />
					</svg>
					高级
				</button>

				<button
					class="px-3 py-2.5 min-w-fit rounded-lg flex items-center transition {selectedTab === 'about'
						? 'bg-gray-200 dark:bg-gray-700 font-medium'
						: 'hover:bg-gray-200 dark:hover:bg-gray-800'}"
					on:click={() => { selectedTab = "about"; }}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-2">
						<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" />
					</svg>
					关于
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 min-h-[420px] max-h-[70vh] md:w-[600px] overflow-y-auto">
				{#if selectedTab === "general"}
					<div class="flex flex-col space-y-4">
						<!-- Theme -->
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">外观</div>
							<div class="space-y-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
								<div class="flex items-center justify-between">
									<span class="text-sm">主题模式</span>
									<button
										class="flex items-center gap-2 px-3 py-1.5 rounded-md transition hover:bg-gray-100 dark:hover:bg-gray-700"
										on:click={toggleTheme}
									>
										{#if theme === "dark"}
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
												<path fill-rule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clip-rule="evenodd" />
											</svg>
											<span class="text-sm">深色</span>
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
												<path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06z" />
											</svg>
											<span class="text-sm">浅色</span>
										{/if}
									</button>
								</div>

								<hr class="border-gray-100 dark:border-gray-700" />

								<div>
									<span class="text-sm">系统头像</span>
									<div class="flex items-center gap-3 mt-2">
										<div class="w-10 h-10 rounded-full bg-pink-200 dark:bg-pink-700 overflow-hidden flex items-center justify-center flex-shrink-0">
											{#if systemAvatarPreview}
												<img src={systemAvatarPreview} alt="system avatar" class="w-full h-full object-cover" />
											{:else}
												<img src="/cat.png" alt="default" class="w-full h-full object-cover" />
											{/if}
										</div>
										<div class="flex gap-2">
											<button
												class="px-3 py-1.5 text-xs font-medium bg-pink-500 hover:bg-pink-600 text-white rounded-md transition"
												on:click={() => systemAvatarInput?.click()}
											>
												上传
											</button>
											<input
												type="file"
												accept="image/*"
												class="hidden"
												bind:this={systemAvatarInput}
												on:change={handleSystemAvatarUpload}
											/>
											{#if systemAvatarPreview}
												<button
													class="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition"
													on:click={removeSystemAvatar}
												>
													移除
												</button>
											{/if}
										</div>
									</div>
								</div>
							</div>
						</div>

						<!-- Preferences -->
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">偏好设置</div>
							<div class="space-y-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
								<label class="flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
									<span class="text-sm">自动生成标题</span>
									<input type="checkbox" class="w-4 h-4 rounded accent-pink-500" bind:checked={titleAutoGenerate} />
								</label>
								<label class="flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
									<span class="text-sm">生成完成后自动复制</span>
									<input type="checkbox" class="w-4 h-4 rounded accent-pink-500" bind:checked={responseAutoCopy} />
								</label>
								<hr class="border-gray-100 dark:border-gray-700" />
								<div class="py-2.5 px-3">
									<div class="flex items-center justify-between">
										<span class="text-sm">默认开启联网搜索</span>
										<input type="checkbox" class="w-4 h-4 rounded accent-blue-500" bind:checked={searchEnabled} />
									</div>
									{#if searchEnabled}
										<div class="mt-3 space-y-2">
											<div class="text-xs text-gray-500">搜索引擎</div>
											<select class="w-full rounded-md py-1.5 px-2 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600" bind:value={searchProvider}>
												<option value="auto">自动（百度 + Bing）</option>
												<option value="baidu">百度</option>
												<option value="bing">Bing</option>
											</select>
										</div>
									{/if}
								</div>
							</div>
						</div>

						<!-- 系统提示词 -->
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">提示词设置</div>
							<div class="space-y-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
								<div>
									<div class="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
										系统提示词（定义 AI 身份、性格、回复风格）
									</div>
									<textarea
										class="w-full rounded-md py-2 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition resize-none"
										placeholder="例如：你是一个温暖贴心的情感疗愈伴侣，名叫小愈。说话语气温柔亲切，像朋友一样交流。回复简洁自然，不啰嗦。"
										rows="3"
										bind:value={systemPrompt}
									></textarea>
								</div>
								<div>
									<div class="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
										搜索指令模板（告诉 AI 如何使用搜索结果）
									</div>
									<textarea
										class="w-full rounded-md py-2 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition resize-none"
										placeholder="请基于搜索结果回答用户问题。如果搜索结果不足以回答，请如实说明。引用来源时请标注链接。"
										rows="3"
										bind:value={searchPromptTemplate}
									></textarea>
								</div>
							</div>
						</div>

						<!-- API URL -->
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">连接</div>
							<div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
								<div class="text-xs text-gray-500 dark:text-gray-400 mb-2">Ollama API 地址</div>
								<div class="flex gap-2">
									<input
										class="flex-1 rounded-md py-2 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition"
										placeholder="http://localhost:11434/api"
										bind:value={API_BASE_URL}
									/>
									<button
										class="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition text-sm"
										on:click={checkOllamaConnection}
									>
										测试
									</button>
								</div>
								<div class="mt-2 text-xs text-gray-400 dark:text-gray-500">
									默认: {OLLAMA_API_BASE_URL}
								</div>
							</div>
						</div>
					</div>
				{/if}

				{#if selectedTab === "models"}
					<div class="flex flex-col space-y-4">
						<!-- Pull Model -->
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">拉取新模型</div>
							<div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
								<div class="flex gap-2">
									<input
										class="flex-1 rounded-md py-2 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition"
										placeholder="例如: llama3:8b, qwen2.5:7b"
										bind:value={pullModelName}
										disabled={pulling}
									/>
									<button
										class="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
										on:click={pullModel}
										disabled={pulling || !pullModelName.trim()}
									>
										{pulling ? "拉取中..." : "拉取"}
									</button>
								</div>
								{#if pullProgress}
									<div class="mt-2 text-xs text-gray-500 dark:text-gray-400">{pullProgress}</div>
								{/if}
							</div>
						</div>

						<!-- Model List -->
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">已安装模型</div>
							<div class="space-y-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
								{#if $models.length === 0}
									<div class="py-4 text-center text-xs text-gray-400">暂无模型</div>
								{:else}
									{#each $models as model}
										{#if model.name !== "hr"}
											<div class="flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700">
												<div class="flex-1 min-w-0">
													<div class="text-sm font-medium truncate">{model.name}</div>
													<div class="text-xs text-gray-400 mt-0.5">
														{formatSize(model.size)} · {model.details?.family ?? ""} · {model.details?.parameter_size ?? ""} · {model.details?.quantization_level ?? ""}
													</div>
												</div>
												{#if showDeleteModelConfirm === model.name}
													<div class="flex items-center gap-1 ml-2">
														<span class="text-xs text-red-400">确认删除?</span>
														<button
															class="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition"
															on:click={() => deleteModel(model.name)}
															disabled={deleting[model.name]}
														>
															确认
														</button>
														<button
															class="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded transition"
															on:click={() => { showDeleteModelConfirm = ""; }}
														>
															取消
														</button>
													</div>
												{:else}
													<button
														class="flex-shrink-0 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition ml-2"
														on:click={() => { showDeleteModelConfirm = model.name; }}
														title="删除模型"
													>
														<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-red-400">
															<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
														</svg>
													</button>
												{/if}
											</div>
										{/if}
									{/each}
								{/if}
							</div>
						</div>
					</div>
				{/if}

				{#if selectedTab === "advanced"}
					<div class="space-y-1">
						<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">模型参数</div>
						<Advanced bind:options />
					</div>
				{/if}

				{#if selectedTab === "about"}
					<div class="flex flex-col items-center py-6 space-y-4">
						<div class="text-4xl">🐱</div>
						<div class="text-lg font-semibold dark:text-gray-200">情感疗愈伴侣</div>
						<div class="text-sm text-gray-500 dark:text-gray-400">版本 {WEB_UI_VERSION}</div>
						<div class="text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs leading-relaxed">
							基于 Ollama 的本地情感支持聊天机器人。<br />
							使用本地大语言模型提供温暖、私密的交流体验。
						</div>
						<div class="flex gap-3 pt-2">
							<a href="https://ollama.com" target="_blank"
								class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">Ollama</a>
							<a href="https://github.com/ollama-webui/ollama-webui" target="_blank"
								class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">GitHub</a>
						</div>
						<div class="text-xs text-gray-400 dark:text-gray-500 pt-4">
							Ollama 版本: {$info?.ollama?.version ?? '未知'}
						</div>
					</div>
				{/if}

				<!-- Save button -->
				{#if selectedTab !== "about" && selectedTab !== "models"}
					<div class="flex justify-center pt-4 mt-2 border-t dark:border-gray-700">
						<button
							class="px-6 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition"
							on:click={saveAllSettings}
						>
							保存设置
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</Modal>

<style>
	.tabs::-webkit-scrollbar {
		display: none;
	}

	.tabs {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

</style>
