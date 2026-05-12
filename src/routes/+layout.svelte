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
