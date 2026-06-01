<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { authFetch } from "$lib/client/http";
	import toast from "svelte-french-toast";

	let adviceContent = "";
	let feedbackContent = "";
	let submittingAdvice = false;
	let submittingFeedback = false;

	onMount(() => {
		const stored = JSON.parse(localStorage.getItem("user") ?? "null");
		if (!stored || !stored.token) {
			goto("/login");
			return;
		}
	});

	const handleAdviceSubmit = async () => {
		if (!adviceContent.trim()) {
			toast.error("请输入建议内容");
			return;
		}
		submittingAdvice = true;
		try {
			const res = await authFetch("/api/advice_table", {
				method: "POST",
				body: JSON.stringify({ content: adviceContent.trim() })
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || err.detail || "提交失败");
			}
			toast.success("感谢您的建议！");
			adviceContent = "";
		} catch (error: any) {
			toast.error(error.message || "提交失败");
		} finally {
			submittingAdvice = false;
		}
	};

	const handleFeedbackSubmit = async () => {
		if (!feedbackContent.trim()) {
			toast.error("请输入反馈内容");
			return;
		}
		submittingFeedback = true;
		try {
			const res = await authFetch("/api/feedback_table", {
				method: "POST",
				body: JSON.stringify({ content: feedbackContent.trim() })
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || err.detail || "提交失败");
			}
			toast.success("感谢您的反馈！");
			feedbackContent = "";
		} catch (error: any) {
			toast.error(error.message || "提交失败");
		} finally {
			submittingFeedback = false;
		}
	};
</script>

<div class="ui-page flex justify-center">
	<div class="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
		<!-- 建议 -->
		<div class="ui-card p-6">
			<h3 class="text-lg font-semibold dark:text-gray-200 mb-1">您的建议是我们前进的动力</h3>
			<p class="text-sm text-gray-400 dark:text-gray-500 mb-4">
				告诉我们您的想法，帮助我们做得更好
			</p>
			<textarea
				class="ui-field h-28 resize-none px-4 py-3"
				placeholder="请输入您的建议..."
				bind:value={adviceContent}
			/>
			<div class="flex justify-end mt-3">
				<button class="ui-btn-primary" on:click={handleAdviceSubmit} disabled={submittingAdvice}>
					{submittingAdvice ? "提交中..." : "提交建议"}
				</button>
			</div>
		</div>

		<!-- 反馈 -->
		<div class="ui-card p-6">
			<h3 class="text-lg font-semibold dark:text-gray-200 mb-1">您的反馈是我们改进的决心</h3>
			<p class="text-sm text-gray-400 dark:text-gray-500 mb-4">
				遇到问题或有改进意见？请随时告诉我们
			</p>
			<textarea
				class="ui-field h-28 resize-none px-4 py-3"
				placeholder="请输入您的反馈..."
				bind:value={feedbackContent}
			/>
			<div class="flex justify-end mt-3">
				<button
					class="ui-btn-primary"
					on:click={handleFeedbackSubmit}
					disabled={submittingFeedback}
				>
					{submittingFeedback ? "提交中..." : "提交反馈"}
				</button>
			</div>
		</div>
	</div>
</div>
