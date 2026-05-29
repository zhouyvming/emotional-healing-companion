<script lang="ts">
	import { onMount } from "svelte";

	export let selectedKbId = "";
	export let disabled = false;

	let kbList: { id: string; name: string }[] = [];

	async function loadKnowledgeBases() {
		try {
			const token = JSON.parse(localStorage.getItem("user") ?? "{}").token;
			const res = await fetch("/api/knowledge-bases", {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (res.ok) {
				kbList = await res.json();
			}
		} catch {
			kbList = [];
		}
	}

	onMount(loadKnowledgeBases);

	export { loadKnowledgeBases as refresh };
</script>

<select
	class="outline-none bg-transparent text-xs rounded-md max-w-[200px] w-auto pr-5 cursor-pointer appearance-none"
	bind:value={selectedKbId}
	{disabled}
	style="background-image:url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3E%3Cpath stroke=%27%238e8ea0%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27m6 8 4 4 4-4%27/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:right center;background-size:1.2em"
	title="选择知识库"
>
	<option value="">未选择知识库</option>
	{#if kbList.length === 0}
		<option disabled>暂无可用知识库</option>
	{:else}
		{#each kbList as kb}
			<option value={kb.id}>📚 {kb.name}</option>
		{/each}
	{/if}
</select>
