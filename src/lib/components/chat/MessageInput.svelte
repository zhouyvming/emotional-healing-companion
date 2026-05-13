<script lang="ts">
	import toast from "svelte-french-toast";

	export let submitPrompt: Function;
	export let stopResponse: Function;

	export let autoScroll = true;
	export let prompt = "";
	export let messages = [];
	export let uploadingFiles: { name: string; data: string; type: string }[] = [];

	// 语音输入
	let recording = false;
	let recognition: any = null;

	function toggleVoice() {
		const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SpeechRecognition) {
			toast.error("浏览器不支持语音输入，请使用 Chrome 或 Edge");
			return;
		}
		if (recording) {
			recognition?.stop();
			recording = false;
			return;
		}
		recognition = new SpeechRecognition();
		recognition.lang = 'zh-CN';
		recognition.interimResults = true;
		recognition.continuous = true;
		recognition.onresult = (e: any) => {
			let transcript = '';
			for (let i = e.resultIndex; i < e.results.length; i++) {
				transcript += e.results[i][0].transcript;
			}
			prompt = transcript;
			// 手动触发textarea高度调整
			const ta = document.getElementById('chat-textarea') as HTMLTextAreaElement;
			if (ta) {
				ta.style.height = "";
				ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
			}
		};
		recognition.onerror = () => { recording = false; };
		recognition.onend = () => { recording = false; };
		recognition.start();
		recording = true;
	}

	// 文件/图片上传
	let fileInput: HTMLInputElement;

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = target.files;
		if (!files) return;
		for (const file of files) {
			processFile(file);
		}
		target.value = '';
	}

	function processFile(file: File) {
		if (file.size > 10 * 1024 * 1024) {
			toast.error('文件过大（最大 10MB）');
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			uploadingFiles = [...uploadingFiles, {
				name: file.name,
				data: reader.result as string,
				type: file.type
			}];
		};
		reader.readAsDataURL(file);
	}

	function removeFile(idx: number) {
		uploadingFiles = uploadingFiles.filter((_, i) => i !== idx);
	}

	function handlePaste(e: ClipboardEvent) {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const item of items) {
			if (item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (file) processFile(file);
			}
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const files = e.dataTransfer?.files;
		if (!files) return;
		for (const file of files) {
			processFile(file);
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}

	function doSubmit() {
		if (prompt.trim() === "" && uploadingFiles.length === 0) return;
		submitPrompt(prompt.trim());
	}
</script>

<svelte:window on:paste={handlePaste} />

<div class="fixed bottom-0 w-full">
	<div class="px-2.5 pt-2.5 -mb-0.5 mx-auto inset-x-0 bg-transparent flex justify-center">
		{#if autoScroll === false && messages.length > 0}
			<div class=" flex justify-center mb-4">
				<button
					class=" bg-white border border-gray-100 dark:border-none dark:bg-white/20 p-1.5 rounded-full"
					on:click={() => {
						autoScroll = true;
						window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
					}}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
						<path fill-rule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clip-rule="evenodd" />
					</svg>
				</button>
			</div>
		{/if}
	</div>
	<div class="bg-white dark:bg-gray-800">
		<div class="max-w-3xl px-2.5 -mb-0.5 mx-auto inset-x-0">
			<div class="bg-gradient-to-t from-white dark:from-gray-800 from-40% pb-2">
				<!-- 上传文件预览 -->
				{#if uploadingFiles.length > 0}
					<div class="flex flex-wrap gap-2 mb-2">
						{#each uploadingFiles as file, i}
							<div class="relative group">
								{#if file.type.startsWith('image/')}
									<img src={file.data} alt={file.name} class="h-16 w-16 object-cover rounded-lg border border-gray-200 dark:border-gray-600" />
								{:else}
									<div class="h-16 flex items-center px-3 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
										<span class="text-xs text-gray-500 truncate max-w-[100px]">{file.name}</span>
									</div>
								{/if}
								<button
									class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
									on:click={() => removeFile(i)}
								>
									×
								</button>
							</div>
						{/each}
					</div>
				{/if}

				<form
					class="flex flex-col relative w-full rounded-xl border dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 focus-within:border-pink-400 transition-colors"
					on:submit|preventDefault={doSubmit}
					on:dragover={handleDragOver}
					on:drop={handleDrop}
				>
					<div class=" flex">
						<!-- 文件上传按钮 -->
						<div class="flex items-center pl-3">
							<input
								type="file"
								accept="image/*,.txt,.pdf,.doc,.docx"
								multiple
								class="hidden"
								bind:this={fileInput}
								on:change={handleFileSelect}
							/>
							<button
								type="button"
								class="p-1.5 text-gray-400 hover:text-pink-500 dark:hover:text-pink-400 transition rounded-lg"
								on:click={() => fileInput?.click()}
								title="上传文件"
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
								</svg>
							</button>
						</div>

						<textarea
							id="chat-textarea"
							class="dark:bg-gray-800 dark:text-gray-100 outline-none w-full py-3 px-2 pl-2 rounded-xl resize-none focus:ring-0"
							placeholder="发送消息"
							bind:value={prompt}
							on:keydown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									if (prompt.trim() !== "") {
										doSubmit();
									}
								}
							}}
							rows="1"
							on:input={(e) => {
								e.target.style.height = "";
								e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
							}}
						/>

						<div class="self-end mb-2 flex space-x-0.5 mr-2">
							<!-- 语音输入按钮 -->
							<button
								type="button"
								class="p-1.5 rounded-lg transition {recording ? 'text-red-500 bg-red-100 dark:bg-red-900/30' : 'text-gray-400 hover:text-pink-500 dark:hover:text-pink-400'}"
								on:click={toggleVoice}
								title="语音输入"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
									<path d="M7 4a3 3 0 016 0v4a3 3 0 01-6 0V4z"/>
									<path fill-rule="evenodd" d="M5.5 9.643a.75.75 0 00-1.5 0c0 3.147 2.626 5.75 5.925 5.986a.375.375 0 01.15.728A6.252 6.252 0 004.75 10a.75.75 0 00-1.5 0 7.75 7.75 0 005.5 7.448V18.5h-2a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-2v-1.052a7.749 7.749 0 005.5-7.448.75.75 0 00-1.5 0A6.25 6.25 0 017.5 15.75a.375.375 0 01-.15-.728c3.299-.236 5.925-2.84 5.925-5.986a.75.75 0 00-1.5 0C11.775 12.687 9.197 15 10 15A4.75 4.75 0 015.5 9.643z" clip-rule="evenodd"/>
								</svg>
							</button>

							{#if messages.length == 0 || messages.at(-1)?.done == true}
								<button
									class="{prompt !== '' || uploadingFiles.length > 0
										? 'bg-pink-500 text-white hover:bg-pink-600 dark:hover:bg-pink-400 '
										: 'text-gray-400 bg-gray-100 dark:text-gray-600 dark:bg-gray-700'} transition rounded-lg p-1 mr-0.5 w-7 h-7 self-center"
									type="submit"
									disabled={prompt === "" && uploadingFiles.length === 0}
								>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
										<path fill-rule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clip-rule="evenodd" />
									</svg>
								</button>
							{:else}
								<button
									class="bg-white hover:bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-800 transition rounded-lg p-1.5"
									type="button"
									on:click={stopResponse}
								>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
										<path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm6-2.438c0-.724.588-1.312 1.313-1.312h4.874c.725 0 1.313.588 1.313 1.313v4.874c0 .725-.588 1.313-1.313 1.313H9.564a1.312 1.312 0 01-1.313-1.313V9.564z" clip-rule="evenodd" />
									</svg>
								</button>
							{/if}
						</div>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>
