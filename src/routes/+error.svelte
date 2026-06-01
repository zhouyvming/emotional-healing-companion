<script>
	import { page } from "$app/stores";
</script>

<div class="ui-page">
	<div class=" flex h-full">
		<div class="m-auto my-10 dark:text-gray-300 text-3xl font-semibold">
			{$page.status}: {$page.error?.message ?? "未知错误"}
		</div>
	</div>
</div>
