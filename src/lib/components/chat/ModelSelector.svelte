<script lang="ts">
	import { models, settings } from "$lib/stores";
	import toast from "svelte-french-toast";

	export let selectedModels = [""];
	export let disabled = false;
	export let compact = false;

	$: if ($models.length > 0 && selectedModels.length === 1 && !$models.some((m: any) => m.name === selectedModels[0])) {
		const thirdParty = $models.find((m: any) => m.source === "third-party");
		if (thirdParty) {
			selectedModels = [thirdParty.name];
		} else {
			const ollamaModels = $models.filter((m: any) => m.source !== "third-party");
			const smallest = ollamaModels.reduce((min: any, m: any) =>
				(m.size || 0) < (min.size || 0) ? m : min, ollamaModels[0]
			);
			selectedModels = [smallest ? smallest.name : $models[0].name];
		}
	}

	const saveDefaultModel = () => {
		const updated = { ...$settings, models: [...selectedModels] };
		settings.set(updated);
		localStorage.setItem("settings", JSON.stringify(updated));
		toast.success("已更新默认模型");
	};
</script>

{#if compact}
	<select
		class="outline-none bg-transparent text-xs rounded-md max-w-[250px] w-auto pr-5 cursor-pointer appearance-none"
		bind:value={selectedModels[0]}
		style="background-image:url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3E%3Cpath stroke=%27%238e8ea0%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27m6 8 4 4 4-4%27/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:right center;background-size:1.2em"
		{disabled}
	>
		{#if selectedModels[0] === ""}
			<option value="" selected>选择模型</option>
		{/if}
		{#each $models.filter((m) => m.name !== "hr") as model}
			<option value={model.name}>{model.source === "third-party" ? "🔗" : "🖥"} {model.name}</option>
		{/each}
	</select>
{:else}
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
{/if}
