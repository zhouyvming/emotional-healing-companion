import { goto } from '$app/navigation';

export const ssr = false;
export const trailingSlash = "ignore";

export async function load({ url }) {
  const publicPaths = ['/login', '/register'];
  const userStr = localStorage.getItem('user');

  if (!publicPaths.includes(url.pathname)) {
    if (!userStr) {
      const redirect = encodeURIComponent(url.pathname + url.search);
      goto(`/login?redirect=${redirect}`);
      return { user: null };
    }

    try {
      const user = JSON.parse(userStr);
      if (!user.token) {
        localStorage.removeItem('user');
        const redirect = encodeURIComponent(url.pathname + url.search);
        goto(`/login?redirect=${redirect}`);
        return { user: null };
      }
      return { user };
    } catch {
      localStorage.removeItem('user');
      const redirect = encodeURIComponent(url.pathname + url.search);
      goto(`/login?redirect=${redirect}`);
      return { user: null };
    }
  }

  return {
    user: userStr ? JSON.parse(userStr) : null
  };
}
