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
		settings.set({ ...$settings, models: selectedModels });
		localStorage.setItem("settings", JSON.stringify($settings));
		toast.success("已更新默认模型");
	};
</script>

<div class="flex flex-col my-2">
	{#each selectedModels as selectedModel, selectedModelIdx}
		<div class="flex">
			<select
				id="models"
				class="outline-none bg-transparent text-lg font-semibold rounded-lg block w-full placeholder-gray-400"
				bind:value={selectedModel}
				{disabled}
			>
				<option class=" text-gray-700" value="" selected>选择一个模型</option>

				{#each $models as model}
					<option value={model.name} class="text-gray-700 text-lg">{model.name}</option>
				{/each}
			</select>
		</div>
	{/each}
</div>

<div class="text-left mt-1.5 text-xs text-gray-500">
	<button on:click={saveDefaultModel}>设为默认模型</button>
</div>
