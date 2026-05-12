<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user } from "$lib/stores";
	import toast from "svelte-french-toast";

	let avatarInput: HTMLInputElement;

	const getToken = () => {
		const stored = JSON.parse(localStorage.getItem("user") ?? "{}");
		return stored.token ?? null;
	};

	const authFetch = (url: string, options: RequestInit = {}) => {
		const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers as Record<string, string> ?? {}) };
		const token = getToken();
		if (token) headers["Authorization"] = `Bearer ${token}`;
		return fetch(url, { ...options, headers });
	};

	let editingProfile = false;
	let editUsername = "";
	let editEmail = "";
	let profileSubmitting = false;
	let showLogoutConfirm = false;

	let showPasswordForm = false;
	let oldPassword = "";
	let newPassword = "";
	let confirmPassword = "";
	let passwordSubmitting = false;

	onMount(() => {
		const stored = JSON.parse(localStorage.getItem("user") ?? "null");
		if (!stored) {
			goto("/login");
		}
	});

	const startEditProfile = () => {
		editUsername = $user?.username ?? "";
		editEmail = $user?.email ?? "";
		editingProfile = true;
	};

	const cancelEditProfile = () => {
		editingProfile = false;
	};

	const handleSaveProfile = async () => {
		if (!editUsername.trim()) {
			toast.error("用户名不能为空");
			return;
		}
		const stored = JSON.parse(localStorage.getItem("user") ?? "{}");
		profileSubmitting = true;
		try {
			const res = await authFetch("/api/user/profile", {
				method: "PUT",
				body: JSON.stringify({
					newUsername: editUsername.trim() !== stored.username ? editUsername.trim() : undefined,
					newEmail: editEmail.trim()
				})
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "保存失败");
			}
			const data = await res.json();
			// 更新 localStorage 和 store
			const updatedUser = { ...stored, ...data.user };
			if (data.token) updatedUser.token = data.token;
			localStorage.setItem("user", JSON.stringify(updatedUser));
			user.set(updatedUser);
			toast.success("个人信息已更新");
			editingProfile = false;
		} catch (error: any) {
			toast.error(error.message || "保存失败");
		} finally {
			profileSubmitting = false;
		}
	};

	const handleChangePassword = async () => {
		if (!oldPassword.trim()) {
			toast.error("请输入当前密码");
			return;
		}
		if (!newPassword.trim()) {
			toast.error("请输入新密码");
			return;
		}
		if (newPassword.trim() !== confirmPassword.trim()) {
			toast.error("两次输入的新密码不一致");
			return;
		}
		const stored = JSON.parse(localStorage.getItem("user") ?? "{}");
		passwordSubmitting = true;
		try {
			const res = await authFetch("/api/user/profile", {
				method: "PUT",
				body: JSON.stringify({
					oldPassword: oldPassword.trim(),
					newPassword: newPassword.trim()
				})
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || "修改失败");
			}
			toast.success("密码修改成功");
			showPasswordForm = false;
			oldPassword = "";
			newPassword = "";
			confirmPassword = "";
		} catch (error: any) {
			toast.error(error.message || "修改失败");
		} finally {
			passwordSubmitting = false;
		}
	};

	const handleAvatarUpload = (e: Event) => {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (ev) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement("canvas");
				const maxSize = 200;
				let w = img.width;
				let h = img.height;
				if (w > h) {
					if (w > maxSize) { h = h * maxSize / w; w = maxSize; }
				} else {
					if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
				}
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext("2d");
				ctx?.drawImage(img, 0, 0, w, h);
				const base64 = canvas.toDataURL("image/jpeg", 0.85);

				const stored = JSON.parse(localStorage.getItem("user") ?? "{}");
				stored.avatar = base64;
				localStorage.setItem("user", JSON.stringify(stored));
				user.set(stored);
				authFetch("/api/user/profile", {
					method: "PUT",
					body: JSON.stringify({ avatar: base64 })
				}).catch(() => {});
				toast.success("头像已更新");
			};
			img.src = ev.target?.result as string;
		};
		reader.readAsDataURL(file);
		target.value = "";
	};

	const handleRemoveAvatar = () => {
		const stored = JSON.parse(localStorage.getItem("user") ?? "{}");
		delete stored.avatar;
		localStorage.setItem("user", JSON.stringify(stored));
		user.set(stored);
		authFetch("/api/user/profile", {
			method: "PUT",
			body: JSON.stringify({ avatar: null })
		}).catch(() => {});
		toast.success("头像已移除");
	};

	const handleLogout = () => {
		localStorage.removeItem("user");
		goto("/login");
	};
</script>

<div class="min-h-screen w-full flex justify-center">
	<div class="max-w-2xl mx-auto w-full px-4 py-8 space-y-6">

		<!-- 个人信息卡片 -->
		<div class="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
			<div class="flex items-center gap-5">
				<div class="relative flex-shrink-0">
					<div class="w-20 h-20 rounded-full bg-pink-200 dark:bg-pink-700 overflow-hidden flex items-center justify-center">
						{#if $user?.avatar}
							<img src={$user.avatar} alt="avatar" class="w-full h-full object-cover" />
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-10 h-10 text-pink-500 dark:text-pink-300">
								<path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
							</svg>
						{/if}
					</div>
				</div>
				<div class="flex-1 min-w-0">
					{#if editingProfile}
						<div class="space-y-2">
							<div>
								<label class="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">用户名</label>
								<input
									type="text"
									class="w-full rounded-md py-1.5 px-2.5 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition"
									bind:value={editUsername}
								/>
							</div>
							<div>
								<label class="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">邮箱</label>
								<input
									type="email"
									class="w-full rounded-md py-1.5 px-2.5 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition"
									bind:value={editEmail}
								/>
							</div>
							<div class="flex gap-2 pt-1">
								<button
									class="px-3 py-1.5 bg-pink-500 hover:bg-pink-600 text-white text-xs font-medium rounded-md transition disabled:opacity-50"
									on:click={handleSaveProfile}
									disabled={profileSubmitting}
								>
									保存
								</button>
								<button
									class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-xs font-medium rounded-md transition"
									on:click={cancelEditProfile}
								>
									取消
								</button>
							</div>
						</div>
					{:else}
						<div class="text-xl font-semibold dark:text-gray-200">{$user?.username ?? "用户"}</div>
						{#if $user?.email}
						<div class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{$user.email}</div>
					{/if}
						<button
							class="mt-2 text-xs text-pink-500 hover:text-pink-600 dark:text-pink-400 transition"
							on:click={startEditProfile}
						>
							编辑资料
						</button>
					{/if}
				</div>
			</div>
			<div class="flex gap-3 mt-5">
				<button
					class="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition"
					on:click={() => avatarInput?.click()}
				>
					上传头像
				</button>
				<input
					type="file"
					accept="image/*"
					class="hidden"
					bind:this={avatarInput}
					on:change={handleAvatarUpload}
				/>
				{#if $user?.avatar}
					<button
						class="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm font-medium rounded-lg transition"
						on:click={handleRemoveAvatar}
					>
						移除头像
					</button>
				{/if}
			</div>
		</div>

		<!-- 修改密码卡片 -->
		<div class="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
			{#if showPasswordForm}
				<h3 class="text-lg font-semibold dark:text-gray-200 mb-4">修改密码</h3>
				<div class="space-y-3">
					<div>
						<label class="block text-sm text-gray-500 dark:text-gray-400 mb-1">当前密码</label>
						<input
							type="password"
							class="w-full rounded-lg py-2.5 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition"
							placeholder="请输入当前密码"
							bind:value={oldPassword}
						/>
					</div>
					<div>
						<label class="block text-sm text-gray-500 dark:text-gray-400 mb-1">新密码</label>
						<input
							type="password"
							class="w-full rounded-lg py-2.5 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition"
							placeholder="请输入新密码"
							bind:value={newPassword}
						/>
					</div>
					<div>
						<label class="block text-sm text-gray-500 dark:text-gray-400 mb-1">确认新密码</label>
						<input
							type="password"
							class="w-full rounded-lg py-2.5 px-3 text-sm dark:text-gray-300 dark:bg-gray-900 outline-none border border-gray-200 dark:border-gray-600 focus:border-pink-400 transition"
							placeholder="请再次输入新密码"
							bind:value={confirmPassword}
						/>
					</div>
					<div class="flex gap-3 pt-2">
						<button
							class="px-5 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
							on:click={handleChangePassword}
							disabled={passwordSubmitting}
						>
							确认修改
						</button>
						<button
							class="px-5 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm font-medium rounded-lg transition"
							on:click={() => { showPasswordForm = false; }}
						>
							取消
						</button>
					</div>
				</div>
			{:else}
				<button
					class="w-full py-3 rounded-lg bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-800 text-pink-600 dark:text-pink-400 text-sm font-medium hover:bg-pink-100 dark:hover:bg-pink-900/50 transition"
					on:click={() => { showPasswordForm = true; }}
				>
					修改密码
				</button>
			{/if}
		</div>

		<!-- 账户操作卡片 -->
		<div class="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6">
			{#if showLogoutConfirm}
				<div class="flex items-center justify-center gap-3">
					<span class="text-sm text-gray-500 dark:text-gray-400">确认退出登录?</span>
					<button
						class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition"
						on:click={handleLogout}
					>
						确认
					</button>
					<button
						class="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm font-medium rounded-lg transition"
						on:click={() => { showLogoutConfirm = false; }}
					>
						取消
					</button>
				</div>
			{:else}
				<button
					class="w-full py-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition"
					on:click={() => { showLogoutConfirm = true; }}
				>
					退出登录
				</button>
			{/if}
		</div>

	</div>
</div>
