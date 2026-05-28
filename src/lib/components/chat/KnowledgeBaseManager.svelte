<script lang="ts">
	import { authFetch } from "$lib/client/http";
	import toast from "svelte-french-toast";
	import KnowledgeBaseDocuments from "./KnowledgeBaseDocuments.svelte";

	let kbList: { id: string; name: string; chunk_size: number; created_at: string }[] = [];
	let loading = true;
	let newKbName = "";
	let creating = false;
	let deleting: Record<string, boolean> = {};
	let selectedKbId = "";

	async function loadList() {
		loading = true;
		try {
			const res = await authFetch("/api/knowledge-bases");
			if (res.ok) kbList = await res.json();
		} catch { /* network error */ }
		loading = false;
	}

	loadList();

	async function createKb() {
		if (!newKbName.trim()) return;
		creating = true;
		try {
			const res = await authFetch("/api/knowledge-bases", {
				method: "POST",
				body: JSON.stringify({ name: newKbName.trim() })
			});
			if (res.ok) {
				toast.success("知识库已创建");
				newKbName = "";
				await loadList();
			} else {
				const err = await res.json();
				toast.error(err.error || "创建失败");
			}
		} catch {
			toast.error("创建失败");
		}
		creating = false;
	}

	async function deleteKb(id: string) {
		deleting[id] = true;
		deleting = { ...deleting };
		try {
			const res = await authFetch(`/api/knowledge-bases/${id}`, { method: "DELETE" });
			if (res.ok) {
				toast.success("知识库已删除");
				if (selectedKbId === id) selectedKbId = "";
				await loadList();
			}
		} catch { toast.error("删除失败"); }
		delete deleting[id];
		deleting = { ...deleting };
	}
</script>

<div class="flex flex-col space-y-4">
	<!-- 创建 -->
	<div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
		<div class="flex gap-2">
			<input
				class="flex-1 rounded-md py-2 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition"
				placeholder="知识库名称"
				bind:value={newKbName}
				on:keydown={(e) => { if (e.key === "Enter") createKb(); }}
			/>
			<button
				class="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
				on:click={createKb}
				disabled={creating || !newKbName.trim()}
			>
				{creating ? "创建中..." : "创建"}
			</button>
		</div>
	</div>

	<!-- 列表 -->
	<div class="space-y-2">
		{#if loading}
			<div class="text-center text-xs text-gray-400 py-4">加载中...</div>
		{:else if kbList.length === 0}
			<div class="text-center text-xs text-gray-400 py-4">暂无知识库，请先创建一个</div>
		{:else}
			{#each kbList as kb}
				<div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
					<button
						class="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left"
						on:click={() => selectedKbId = selectedKbId === kb.id ? "" : kb.id}
					>
						<div class="flex-1 min-w-0">
							<div class="text-sm font-medium">📚 {kb.name}</div>
							<div class="text-xs text-gray-400 mt-0.5">
								切片大小 {kb.chunk_size} 字符
							</div>
						</div>
						<div class="flex items-center gap-1" on:click|stopPropagation>
							<button
								class="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-500 rounded transition"
								on:click={() => deleteKb(kb.id)}
								disabled={deleting[kb.id]}
							>
								{deleting[kb.id] ? "删除中" : "删除"}
							</button>
						</div>
					</button>

					{#if selectedKbId === kb.id}
						<div class="border-t border-gray-100 dark:border-gray-700 p-3">
							<KnowledgeBaseDocuments kbId={kb.id} />
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
