<script lang="ts">
	import Modal from "../common/Modal.svelte";
	import { WEB_UI_VERSION, OLLAMA_API_BASE_URL } from "$lib/constants";
	import toast from "svelte-french-toast";
	import { onMount } from "svelte";
	import { info, settings, models } from "$lib/stores";
	import Advanced from "./Settings/Advanced.svelte";
import { getThirdPartyModels } from "$lib/chat/openai";

	export let show = false;

	const saveSettings = async (updated: Record<string, any>) => {
		await settings.set({ ...$settings, ...updated });
		localStorage.setItem("settings", JSON.stringify($settings));
	};

	let selectedTab = "general";

	// General
	let API_BASE_URL = OLLAMA_API_BASE_URL;
	let theme = "dark";
	let fontSize = "normal";
	let proactiveGreeting = true;
	let privacyMode = false;
	let webSearch = false;
	let emotionSensing = true;
	let titleAutoGenerate = true;
	let responseAutoCopy = false;
	let systemPrompt = "";
	let systemAvatarInput: HTMLInputElement;
	let systemAvatarPreview = "";

	// Model management
	let pullModelName = "";
	let pulling = false;
	let pullProgress = "";
	let deleting: Record<string, boolean> = {};
	let showDeleteModelConfirm = "";

	// API 提供商管理
	let providers: { id: string; name: string; baseUrl: string; apiKey: string; models: { id: string; name: string }[] }[] = [];
	let newProviderName = "";
	let newProviderUrl = "";
	let newProviderKey = "";

	function loadProviders() {
		try { providers = JSON.parse(localStorage.getItem('apiProviders') ?? '[]'); } catch { providers = []; }
	}
	function refreshAllModels() {
		const ollamaModels = ($models || []).filter((m: any) => !m.details?.family || !getThirdPartyModels().some((t: any) => t.details?.family === m.details?.family));
		models.set([...ollamaModels, ...getThirdPartyModels()]);
	}

	function saveProviders() {
		localStorage.setItem('apiProviders', JSON.stringify(providers));
		refreshAllModels();
	}
	function addProvider() {
		if (!newProviderName || !newProviderUrl || !newProviderKey) return;
		providers = [...providers, {
			id: Date.now().toString(36),
			name: newProviderName.trim(),
			baseUrl: newProviderUrl.trim(),
			apiKey: newProviderKey.trim(),
			models: []
		}];
		newProviderName = ""; newProviderUrl = ""; newProviderKey = "";
		saveProviders();
		toast.success('提供商已添加');
	}
	function removeProvider(idx: number) {
		providers = providers.filter((_, i) => i !== idx);
		saveProviders();
		toast.success('提供商已删除');
	}
	async function fetchProviderModels(idx: number) {
		const p = providers[idx];
		toast('正在获取模型列表...');
		try {
			const baseUrl = p.baseUrl.replace(/\/+$/, '');
			const res = await fetch(baseUrl + '/models', {
				headers: { 'Authorization': `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }
			});
			if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message || `HTTP ${res.status}`); }
			const data = await res.json();
			const models = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id })).filter((m: any) => !m.id.startsWith('dall-e') && !m.id.startsWith('whisper') && !m.id.startsWith('tts'));
			providers[idx].models = models;
			providers = [...providers];
			saveProviders();
			toast.success(`获取到 ${models.length} 个模型`);
		} catch (e: any) {
			toast.error('获取失败：' + (e.message || '未知错误'));
		}
	}

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

	const applyTheme = (t: string) => {
		document.documentElement.classList.remove("light", "dark");
		if (t === "system") {
			document.documentElement.classList.add(
				window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
			);
		} else {
			document.documentElement.classList.add(t);
		}
		localStorage.theme = t;
	};

	const setTheme = (t: string) => {
		theme = t;
		applyTheme(t);
	};

	const applyFontSize = (size: string) => {
		const scale = size === "small" ? "0.875" : size === "large" ? "1.15" : "1";
		document.documentElement.style.setProperty("--font-size-scale", scale);
		localStorage.setItem("fontSize", size);
	};

	const setFontSize = (size: string) => {
		fontSize = size;
		applyFontSize(size);
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
			theme,
			fontSize,
			proactiveGreeting,
			privacyMode,
			webSearch,
			emotionSensing,
			titleAutoGenerate,
			responseAutoCopy,
			systemPrompt,
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

	const themeLabel = () => {
		if (theme === "dark") return "深色";
		if (theme === "light") return "浅色";
		return "跟随系统";
	};

	const fontSizeLabel = () => {
		if (fontSize === "small") return "小";
		if (fontSize === "large") return "大";
		return "标准";
	};

	onMount(() => {
		const stored = JSON.parse(localStorage.getItem("settings") ?? "{}");
			loadProviders();

		theme = stored.theme ?? localStorage.theme ?? "dark";
		if (theme === "system") {
			applyTheme("system");
		}
		fontSize = stored.fontSize ?? localStorage.getItem("fontSize") ?? "normal";
		proactiveGreeting = stored.proactiveGreeting ?? true;
		privacyMode = stored.privacyMode ?? false;
		titleAutoGenerate = stored.titleAutoGenerate ?? true;
		responseAutoCopy = stored.responseAutoCopy ?? false;
		systemPrompt = stored.systemPrompt ?? "";
			webSearch = stored.webSearch ?? false;
			emotionSensing = stored.emotionSensing ?? true;
		const userData = JSON.parse(localStorage.getItem("user") ?? "{}");
		systemAvatarPreview = userData.system_avatar ?? "";
		API_BASE_URL = stored.API_BASE_URL ?? OLLAMA_API_BASE_URL;
		requestFormat = stored.requestFormat ?? "";

		if (stored.seed !== undefined && stored.seed !== '') options.seed = stored.seed;
		for (const key of Object.keys(options)) {
			if (stored[key] !== undefined && stored[key] !== '') {
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
					class="px-3 py-2.5 min-w-fit rounded-lg flex items-center transition {selectedTab === 'preferences'
						? 'bg-gray-200 dark:bg-gray-700 font-medium'
						: 'hover:bg-gray-200 dark:hover:bg-gray-800'}"
					on:click={() => { selectedTab = "preferences"; }}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-2">
						<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
					</svg>
					偏好
				</button>

				<button
					class="px-3 py-2.5 min-w-fit rounded-lg flex items-center transition {selectedTab === 'persona'
						? 'bg-gray-200 dark:bg-gray-700 font-medium'
						: 'hover:bg-gray-200 dark:hover:bg-gray-800'}"
					on:click={() => { selectedTab = "persona"; }}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-2">
						<path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
					</svg>
					人设
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
						class="px-3 py-2.5 min-w-fit rounded-lg flex items-center transition {selectedTab === 'api'
							? 'bg-gray-200 dark:bg-gray-700 font-medium'
							: 'hover:bg-gray-200 dark:hover:bg-gray-800'}"
						on:click={() => { selectedTab = "api"; }}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-2">
							<path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd" />
						</svg>
						API
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
			<div class="flex-1 h-[520px] w-[600px] overflow-y-auto">
				{#if selectedTab === "general"}
					<div class="flex flex-col space-y-4">
						<!-- 外观 -->
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">外观</div>
							<div class="space-y-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
								<button class="flex items-center justify-between py-2.5 px-3 w-full hover:bg-gray-50 dark:hover:bg-gray-700 transition" on:click={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}>
									<span class="text-sm">主题模式</span>
									<div class="flex items-center gap-1.5">
										{#if theme === "dark"}
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
												<path fill-rule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clip-rule="evenodd" />
											</svg>
										{:else if theme === "light"}
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
												<path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06z" />
											</svg>
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
												<path fill-rule="evenodd" d="M2.106 11.883a.75.75 0 01-.027-1.044A9.001 9.001 0 0110 1.75a.75.75 0 01.738.884 7.25 7.25 0 107.378 7.378.75.75 0 01.884-.738 9.001 9.001 0 01-9.09 7.917.75.75 0 01-.485-.176 8.99 8.99 0 01-7.319-5.132z" clip-rule="evenodd" />
											</svg>
										{/if}
										<span class="text-xs text-gray-500">{themeLabel()}</span>
									</div>
								</button>

								<hr class="border-gray-100 dark:border-gray-700" />

								<button class="flex items-center justify-between py-2.5 px-3 w-full hover:bg-gray-50 dark:hover:bg-gray-700 transition" on:click={() => setFontSize(fontSize === "normal" ? "large" : fontSize === "large" ? "small" : "normal")}>
									<span class="text-sm">字体大小</span>
									<div class="flex items-center gap-2">
										<span class="text-xs text-gray-500">{fontSizeLabel()}</span>
									</div>
								</button>

								<hr class="border-gray-100 dark:border-gray-700" />

								<div>
									<span class="text-sm block py-2.5 px-3">系统头像</span>
									<div class="flex items-center gap-3 px-3 pb-3">
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

						<!-- 连接 -->
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

				{#if selectedTab === "preferences"}
					<div class="flex flex-col space-y-4">
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">偏好设置</div>
							<div class="space-y-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
								<label class="flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
									<div>
										<span class="text-sm">主动问候</span>
										<div class="text-xs text-gray-400">打开应用时 AI 主动打招呼</div>
									</div>
									<input type="checkbox" class="w-4 h-4 rounded accent-pink-500" bind:checked={proactiveGreeting} />
								</label>
								<label class="flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
									<div>
										<span class="text-sm">隐私模式</span>
										<div class="text-xs text-gray-400">对话内容不保存到数据库</div>
									</div>
									<input type="checkbox" class="w-4 h-4 rounded accent-pink-500" bind:checked={privacyMode} />
								</label>
								<label class="flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
									<span class="text-sm">自动生成标题</span>
									<input type="checkbox" class="w-4 h-4 rounded accent-pink-500" bind:checked={titleAutoGenerate} />
								</label>
								<label class="flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
									<span class="text-sm">生成完成后自动复制</span>
									<input type="checkbox" class="w-4 h-4 rounded accent-pink-500" bind:checked={responseAutoCopy} />
								</label>
								<label class="flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
									<div>
										<span class="text-sm">联网搜索</span>
										<div class="text-xs text-gray-400">发送前自动搜索相关信息</div>
									</div>
									<input type="checkbox" class="w-4 h-4 rounded accent-pink-500" bind:checked={webSearch} />
								</label>
								<label class="flex items-center justify-between py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
									<div>
										<span class="text-sm">情绪感知</span>
										<div class="text-xs text-gray-400">AI 自动感知并回应你的情绪状态</div>
									</div>
									<input type="checkbox" class="w-4 h-4 rounded accent-pink-500" bind:checked={emotionSensing} />
								</label>
							</div>
						</div>
					</div>
				{/if}

				{#if selectedTab === "persona"}
					<div class="flex flex-col space-y-4">
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">AI 人设</div>
							<div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
								<div class="text-xs text-gray-500 dark:text-gray-400 mb-2">自定义 AI 的身份、性格和说话风格</div>
								<textarea bind:value={systemPrompt} class="w-full rounded-md py-2 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition resize-none" rows="4" placeholder="例如：你是一个温柔知心的情感陪伴AI，名叫小愈。你用温暖、共情的语气与用户交流..."/>
							</div>
						</div>
					</div>
				{/if}


				{#if selectedTab === "models"}
					<div class="flex flex-col space-y-4">
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
														<button class="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition" on:click={() => deleteModel(model.name)} disabled={deleting[model.name]}>确认</button>
														<button class="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded transition" on:click={() => { showDeleteModelConfirm = ""; }}>取消</button>
													</div>
												{:else}
													<button class="flex-shrink-0 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition ml-2" on:click={() => { showDeleteModelConfirm = model.name; }} title="删除模型">
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
				{#if selectedTab === "api"}
					<div class="flex flex-col space-y-4">
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">第三方 API 提供商</div>
							<div class="text-xs text-gray-400 dark:text-gray-500 mb-3">支持 OpenAI、DeepSeek、通义千问等兼容 OpenAI API 格式的模型服务</div>

							{#each providers as provider, i}
								<div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 mb-2">
									<div class="flex items-center justify-between mb-2">
										<span class="text-sm font-medium">{provider.name}</span>
										<div class="flex gap-1">
											<button class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded transition" on:click={() => fetchProviderModels(i)}>获取模型</button>
											<button class="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-500 rounded transition" on:click={() => removeProvider(i)}>删除</button>
										</div>
									</div>
									<div class="text-xs text-gray-400 truncate mb-1">{provider.baseUrl}</div>
									{#if provider.models.length > 0}
										<div class="flex flex-wrap gap-1 mt-2">
											{#each provider.models as m}
												<span class="text-xs bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded-full">{m.name}</span>
											{/each}
										</div>
									{:else}
										<div class="text-xs text-gray-400 mt-1">尚未获取模型列表</div>
									{/if}
								</div>
							{/each}

							{#if providers.length === 0}
								<div class="text-xs text-gray-400 text-center py-4">暂无配置的 API 提供商</div>
							{/if}
						</div>

						<!-- 添加提供商 -->
						<div>
							<div class="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">添加提供商</div>
							<div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 space-y-2">
								<input class="w-full rounded-md py-2 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition" placeholder="提供商名称（如 DeepSeek）" bind:value={newProviderName} />
								<input class="w-full rounded-md py-2 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition" placeholder="API 地址（如 https://api.deepseek.com/v1）" bind:value={newProviderUrl} />
								<div class="flex gap-2">
									<input class="flex-1 rounded-md py-2 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition" placeholder="API Key" bind:value={newProviderKey} />
									<button
										class="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
										on:click={addProvider}
										disabled={!newProviderName || !newProviderUrl || !newProviderKey}
									>
										添加
									</button>
								</div>
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
							<a href="https://ollama.com" target="_blank" class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">Ollama</a>
							<a href="https://github.com/zhouyvming/emotional-healing-companion" target="_blank" class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">GitHub</a>
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
