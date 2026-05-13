<script>
	import "../app.css";
	import "../tailwind.css";
	import "tippy.js/dist/tippy.css";
	import { Toaster } from "svelte-french-toast";
</script>

<svelte:head>
	<title>情感疗愈伴侣 Web UI</title>
</svelte:head>

<Toaster />
<slot />

<style>
	:global(html) {
		font-size: calc(1rem * var(--font-size-scale, 1));
	}

	:global(body) {
		font-size: calc(1rem * var(--font-size-scale, 1));
	}

	@keyframes bounce {
		0%, 80%, 100% { transform: translateY(0); }
		40% { transform: translateY(-4px); }
	}

	:global(.animate-bounce) {
		animation: bounce 1.2s ease-in-out infinite;
	}
</style>
