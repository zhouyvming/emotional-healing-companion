<script lang="ts">
	import { models, settings } from "$lib/stores";
	import toast from "svelte-french-toast";

	export let selectedModels = [""];
	export let disabled = false;

	// 自动选择第一个可用模型
	$: if (selectedModels.length === 1 && selectedModels[0] === "" && $models.length > 0) {
		selectedModels = [$models[0].name];
	}

	const saveDefaultModel = () => {
		const updated = { ...$settings, models: [...selectedModels] };
		settings.set(updated);
		localStorage.setItem("settings", JSON.stringify(updated));
		toast.success("已更新默认模型");
	};
</script>

<div class="flex flex-col my-2">
	{#each selectedModels as selectedModel, selectedModelIdx}
		<div class="flex items-center gap-2">
			<select
				id="models"
				class="outline-none bg-transparent text-lg font-semibold rounded-lg block w-full placeholder-gray-400"
				bind:value={selectedModel}
				{disabled}
			>
				<option class=" text-gray-700" value="" selected>选择一个模型</option>

				{#each $models.filter((m) => m.name !== "hr") as model}
					<option value={model.name} class="text-gray-700 text-lg">
						{model.source === "third-party" ? "🔗 " : "🖥️ "}{model.name}
					</option>
				{/each}
			</select>
		</div>
	{/each}
</div>

<div class="flex items-center justify-between mt-1.5 text-xs text-gray-500">
	<span>{$models.filter((m) => m.name !== "hr").length} 个模型可用</span>
	<button on:click={saveDefaultModel}>设为默认模型</button>
</div>
