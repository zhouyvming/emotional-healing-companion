import { json } from '@sveltejs/kit';

function isPrivateUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    // 阻止内网/本地地址（防 SSRF）
    const BLOCKED = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '169.254.169.254'];
    if (BLOCKED.includes(u.hostname)) return true;
    const blocks = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.'];
    for (const b of blocks) {
      if (u.hostname.startsWith(b)) return true;
    }
    return false;
  } catch { return true; }
}

export async function POST({ request }) {
  try {
    const { url } = await request.json();
    if (!url || !url.startsWith('http')) {
      return json({ error: '无效的 URL' }, { status: 400 });
    }
    if (isPrivateUrl(url)) {
      return json({ error: '不允许访问内网地址' }, { status: 403 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OllamaWebUI/1.0)' }
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return json({ error: '无法访问该链接' }, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return json({ error: '不支持的链接类型' }, { status: 415 });
    }

    const html = await res.text();
    // 简单提取文本
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    return json({ content: text });
  } catch {
    return json({ error: '抓取失败' }, { status: 500 });
  }
}
