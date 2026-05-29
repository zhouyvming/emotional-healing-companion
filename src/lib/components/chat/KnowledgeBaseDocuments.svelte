<script lang="ts">
	import { authFetch } from "$lib/client/http";
	import toast from "svelte-french-toast";
	import { onDestroy } from "svelte";

	export let kbId: string;

	type KbDoc = {
		id: string;
		filename: string;
		status: string;
		chunk_count: number;
		error_message?: string;
		created_at: string;
		processed_at?: string;
	};

	let docs: KbDoc[] = [];
	let loading = true;
	let uploading = false;
	let fileInput: HTMLInputElement;
	let deleting: Record<string, boolean> = {};
	let retrying: Record<string, boolean> = {};
	let pollTimer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (pollTimer) clearTimeout(pollTimer);
	});

	async function loadDocs() {
		loading = true;
		try {
			const res = await authFetch(`/api/knowledge-bases/${kbId}/documents`);
			if (res.ok) docs = await res.json();
		} catch {
			toast.error("加载文档列表失败");
		}
		loading = false;
		schedulePoll();
	}

	function schedulePoll() {
		if (pollTimer) clearTimeout(pollTimer);
		if (docs.some((doc) => doc.status === "pending" || doc.status === "processing")) {
			pollTimer = setTimeout(loadDocs, 2500);
		}
	}

	$: if (kbId) loadDocs();

	async function handleUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = target.files;
		if (!files || files.length === 0) return;

		for (const file of files) {
			if (file.size > 10 * 1024 * 1024) {
				toast.error(`${file.name} 过大（最大 10MB）`);
				continue;
			}
			uploading = true;
			const reader = new FileReader();
			reader.onload = async () => {
				try {
					const res = await authFetch(`/api/knowledge-bases/${kbId}/documents`, {
						method: "POST",
						body: JSON.stringify({
							name: file.name,
							type: file.type,
							data: reader.result as string
						})
					});
					if (res.ok) {
						toast.success(`已上传 ${file.name}`);
						await loadDocs();
					} else {
						const err = await res.json();
						toast.error(err.error || "上传失败");
					}
				} catch {
					toast.error("上传失败");
				}
				uploading = false;
			};
			reader.readAsDataURL(file);
		}
		target.value = "";
	}

	async function retryDoc(docId: string) {
		retrying[docId] = true;
		retrying = { ...retrying };
		try {
			const res = await authFetch(`/api/knowledge-bases/${kbId}/documents/${docId}/retry`, {
				method: "POST"
			});
			if (res.ok) {
				toast.success("已重新开始处理");
				await loadDocs();
			} else {
				const err = await res.json().catch(() => ({}));
				toast.error(err.error || "重新处理失败");
			}
		} catch {
			toast.error("重新处理失败");
		}
		delete retrying[docId];
		retrying = { ...retrying };
	}

	async function deleteDoc(docId: string) {
		deleting[docId] = true;
		deleting = { ...deleting };
		try {
			const res = await authFetch(`/api/knowledge-bases/${kbId}/documents/${docId}`, {
				method: "DELETE"
			});
			if (res.ok) {
				toast.success("文档已删除");
				await loadDocs();
			} else {
				toast.error("删除失败");
			}
		} catch {
			toast.error("删除失败");
		}
		delete deleting[docId];
		deleting = { ...deleting };
	}

	function statusLabel(s: string) {
		if (s === "pending") return "排队中";
		if (s === "processing") return "处理中";
		if (s === "done") return "已完成";
		if (s === "error") return "失败";
		return s;
	}
</script>

<div class="space-y-2">
	<div class="flex items-center justify-between">
		<span class="text-xs text-gray-400">文档列表</span>
		<button
			class="px-2 py-1 text-xs bg-pink-50 hover:bg-pink-100 dark:bg-pink-900/30 dark:hover:bg-pink-900/50 text-pink-600 dark:text-pink-400 rounded transition"
			on:click={() => fileInput?.click()}
			disabled={uploading}
		>
			{uploading ? "上传中..." : "上传文档"}
		</button>
		<input
			type="file"
			accept=".txt,.md,.csv,.pdf,.doc,.docx,.xls,.xlsx,.pptx"
			multiple
			class="hidden"
			bind:this={fileInput}
			on:change={handleUpload}
		/>
	</div>

	{#if loading}
		<div class="text-center text-xs text-gray-400 py-2">加载中...</div>
	{:else if docs.length === 0}
		<div class="text-center text-xs text-gray-400 py-4">
			暂无上传文档<br />
			<span class="text-[10px]">点击右上角“上传文档”添加 PDF、Word、Excel 等文件</span>
		</div>
	{:else}
		{#each docs as doc}
			<div
				class="flex items-center justify-between gap-2 py-1.5 px-2 bg-gray-50 dark:bg-gray-900 rounded"
			>
				<div class="flex-1 min-w-0">
					<div class="text-xs truncate">{doc.filename}</div>
					<div class="text-[10px] text-gray-400">
						{statusLabel(doc.status)}
						{#if doc.status === "done"} · {doc.chunk_count} 个片段{/if}
						{#if doc.status === "error" && doc.error_message} · {doc.error_message}{/if}
					</div>
				</div>
				{#if doc.status === "error"}
					<button
						class="flex-shrink-0 px-1.5 py-0.5 text-[10px] text-pink-500 hover:text-pink-600 transition"
						on:click={() => retryDoc(doc.id)}
						disabled={retrying[doc.id]}
					>
						重试
					</button>
				{/if}
				<button
					class="flex-shrink-0 px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-500 transition"
					on:click={() => deleteDoc(doc.id)}
					disabled={deleting[doc.id]}
				>
					删除
				</button>
			</div>
		{/each}
	{/if}
</div>
