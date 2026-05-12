<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import toast from "svelte-french-toast";

	let currentUser: { username: string; token: string } | null = null;
	let adviceContent = "";
	let feedbackContent = "";
	let submitting = false;

	onMount(() => {
		const stored = JSON.parse(localStorage.getItem("user") ?? "null");
		if (!stored || !stored.token) {
			toast.error("请先登录");
			goto("/login");
			return;
		}
		currentUser = stored;
	});

	const authFetch = (url: string, options: RequestInit = {}) => {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...(options.headers as Record<string, string> ?? {})
		};
		if (currentUser?.token) {
			headers['Authorization'] = `Bearer ${currentUser.token}`;
		}
		return fetch(url, { ...options, headers });
	};

	const handleAdviceSubmit = async () => {
		if (!adviceContent.trim()) {
			toast.error("请输入建议内容");
			return;
		}
		submitting = true;
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
			submitting = false;
		}
	};

	const handleFeedbackSubmit = async () => {
		if (!feedbackContent.trim()) {
			toast.error("请输入反馈内容");
			return;
		}
		submitting = true;
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
			submitting = false;
		}
	};
</script>

<div class="min-h-screen w-full flex justify-center">
	<div class="max-w-2xl mx-auto w-full px-4 py-8 space-y-6">

		<!-- 建议 -->
		<div class="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
			<h3 class="text-lg font-semibold dark:text-gray-200 mb-1">您的建议是我们前进的动力</h3>
			<p class="text-sm text-gray-400 dark:text-gray-500 mb-4">告诉我们您的想法，帮助我们做得更好</p>
			<textarea
				class="w-full h-28 rounded-lg py-3 px-4 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition resize-none"
				placeholder="请输入您的建议..."
				bind:value={adviceContent}
			></textarea>
			<div class="flex justify-end mt-3">
				<button
					class="px-5 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
					on:click={handleAdviceSubmit}
					disabled={submitting}
				>
					{submitting ? '提交中...' : '提交建议'}
				</button>
			</div>
		</div>

		<!-- 反馈 -->
		<div class="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
			<h3 class="text-lg font-semibold dark:text-gray-200 mb-1">您的反馈是我们改进的决心</h3>
			<p class="text-sm text-gray-400 dark:text-gray-500 mb-4">遇到问题或有改进意见？请随时告诉我们</p>
			<textarea
				class="w-full h-28 rounded-lg py-3 px-4 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition resize-none"
				placeholder="请输入您的反馈..."
				bind:value={feedbackContent}
			></textarea>
			<div class="flex justify-end mt-3">
				<button
					class="px-5 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
					on:click={handleFeedbackSubmit}
					disabled={submitting}
				>
					{submitting ? '提交中...' : '提交反馈'}
				</button>
			</div>
		</div>

	</div>
</div>
