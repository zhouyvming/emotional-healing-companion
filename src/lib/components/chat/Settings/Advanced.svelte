<script lang="ts">
	export let options: Record<string, any> = {
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
		num_ctx: 8192
	};

	const paramDefs = [
		{ key: "seed", label: "随机种子", type: "number", min: 0, max: 9999999, step: 1, default: 0, placeholder: "0" },
		{ key: "temperature", label: "温度", type: "range", min: 0, max: 2, step: 0.05, default: 0.8 },
		{ key: "top_k", label: "Top K", type: "range", min: 1, max: 100, step: 1, default: 40 },
		{ key: "top_p", label: "Top P", type: "range", min: 0, max: 1, step: 0.05, default: 0.9 },
		{ key: "repeat_penalty", label: "重复惩罚", type: "range", min: 0, max: 2, step: 0.05, default: 1.1 },
		{ key: "repeat_last_n", label: "重复最后 N 个", type: "range", min: -1, max: 128, step: 1, default: 64 },
		{ key: "mirostat", label: "Mirostat", type: "range", min: 0, max: 2, step: 1, default: 0 },
		{ key: "mirostat_eta", label: "Mirostat Eta", type: "range", min: 0, max: 1, step: 0.05, default: 0.1 },
		{ key: "mirostat_tau", label: "Mirostat Tau", type: "range", min: 0, max: 10, step: 0.5, default: 5 },
		{ key: "tfs_z", label: "TFS Z", type: "range", min: 0, max: 2, step: 0.05, default: 1 },
		{ key: "num_ctx", label: "上下文长度", type: "range", min: 512, max: 131072, step: 512, default: 8192 },
		{ key: "stop", label: "停止序列", type: "text", placeholder: "输入停止序列" },
	];
</script>

<div class="space-y-2">
	{#each paramDefs as param}
		<div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
			<div class="flex items-center justify-between">
				<span class="text-sm">{param.label}</span>

				{#if param.type === "text"}
					<input
						class="w-40 rounded-md py-1.5 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600"
						type="text"
						placeholder={param.placeholder || ""}
						bind:value={options[param.key]}
						autocomplete="off"
					/>
				{:else if param.type === "number"}
					<input
						class="w-28 rounded-md py-1.5 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600"
						type="number"
						placeholder={param.placeholder || param.default}
						bind:value={options[param.key]}
						autocomplete="off"
						min={param.min}
					/>
				{:else}
					<button
						class="text-xs px-2.5 py-1 rounded-md transition {options[param.key] === '' ? 'text-gray-400 bg-gray-100 dark:bg-gray-700' : 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/30'}"
						on:click={() => {
							options[param.key] = options[param.key] === "" ? param.default : "";
						}}
					>
						{options[param.key] === "" ? "默认" : "自定义"}
					</button>
				{/if}
			</div>

			{#if param.type === "range" && options[param.key] !== ""}
				<div class="flex mt-2 gap-2">
					<input
						type="range"
						min={param.min}
						max={param.max}
						step={param.step}
						bind:value={options[param.key]}
						class="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-gray-600"
					/>
					<input
						bind:value={options[param.key]}
						type="number"
						class="w-16 text-center text-sm bg-transparent border border-gray-200 dark:border-gray-600 rounded-md py-0.5 dark:text-gray-300"
						min={param.min}
						max={param.max}
						step={param.step}
					/>
				</div>
			{/if}
		</div>
	{/each}
</div>
