<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import toast from 'svelte-french-toast';

  let username = '';
  let password = '';
  let showPassword = false;
  let loading = false;

  $: redirect = $page.url.searchParams.get('redirect') ?? '/';

  async function handleLogin() {
    if (!username || !password) {
      toast.error('请输入用户名和密码');
      return;
    }

    loading = true;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username, password })
      });

      if (res.ok) {
        const user = await res.json();
        localStorage.setItem('user', JSON.stringify(user));
        toast.success('登录成功');
        goto(redirect);
      } else {
        const data = await res.json();
        toast.error(data.error || '登录失败');
      }
    } catch (error) {
      toast.error('登录失败，请稍后重试');
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-white dark:bg-gray-800">
  <div class="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
    <div class="text-center">
      <h2 class="text-3xl font-bold text-gray-900 dark:text-white">登录</h2>
    </div>

    <form class="mt-8 space-y-6" on:submit|preventDefault={handleLogin}>
      <div class="space-y-4">
        <div>
          <label for="login-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300">用户名</label>
          <input
            id="login-username"
            type="text"
            bind:value={username}
            class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:border-pink-400 focus:ring-1 focus:ring-pink-400 outline-none transition"
            required
          />
        </div>

        <div>
          <label for="login-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">密码</label>
          <div class="relative mt-1">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              on:input={(e) => { password = e.target.value; }}
              value={password}
              class="block w-full px-3 py-2 pr-10 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white focus:border-pink-400 focus:ring-1 focus:ring-pink-400 outline-none transition"
              required
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              on:click={() => { showPassword = !showPassword; }}
            >
              {#if showPassword}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              {/if}
            </button>
          </div>
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={loading}
          class="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-pink-500 hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 disabled:opacity-50 transition"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </div>

      <div class="text-center">
        <a href="/register{redirect ? `?redirect=${redirect}` : ''}" class="text-sm text-pink-500 hover:text-pink-600">
          还没有账号？立即注册
        </a>
      </div>
    </form>
  </div>
</div>
