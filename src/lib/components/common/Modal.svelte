<script lang="ts">
	import { onMount } from "svelte";
	import { fade } from "svelte/transition";

	export let show = true;
	export let widthClass = "w-[640px]";
	let mounted = false;

	onMount(() => {
		mounted = true;
	});

	$: if (mounted) {
		if (show) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "unset";
		}
	}
</script>

{#if show}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-50 flex h-screen min-h-screen w-full justify-center overflow-hidden overscroll-contain bg-gray-950/50 px-4 backdrop-blur-sm"
		on:click={() => {
			show = false;
		}}
	>
		<div
			class="m-auto max-h-[calc(100dvh-2rem)] overflow-hidden rounded-lg {widthClass} border border-rose-100/80 bg-[#fbfaf9] shadow-2xl shadow-rose-950/15 dark:border-gray-800 dark:bg-gray-950 dark:shadow-none"
			transition:fade={{ delay: 100, duration: 200 }}
			on:click={(e) => {
				e.stopPropagation();
			}}
		>
			<slot />
		</div>
	</div>
{/if}
