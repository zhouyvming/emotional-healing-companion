import { json } from '@sveltejs/kit';
import { requireAuth, AuthError } from '$lib/server/auth';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

// ─── 百度解析 ───────────────────────────────────────────────
function parseBaidu(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // 匹配百度搜索结果卡片: <div class="result c-container" ...> ... </div>
  const blocks = html.split(/class="[^"]*c-container[^"]*"/);
  for (let i = 1; i < blocks.length && results.length < 8; i++) {
    const block = blocks[i];
    // 提取标题链接
    const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    // 提取摘要
    const snippetMatch = block.match(/class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || block.match(/class="[^"]*content-right_[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      || block.match(/class="[^"]*c-span-last[^"]*"[^>]*>([\s\S]*?)<\/span>/i);

    const title = titleMatch ? stripHtml(titleMatch[2]).trim() : '';
    const url = titleMatch ? titleMatch[1] : '';
    let snippet = snippetMatch ? stripHtml(snippetMatch[1]).trim() : '';

    // 如果没匹配到摘要，尝试从整个 block 中提取文本
    if (!snippet) {
      const textBlock = stripHtml(block).replace(/\s+/g, ' ').trim();
      snippet = textBlock.substring(0, 200);
    }

    if (title && snippet && url) {
      results.push({ title, snippet, url });
    }
  }
  return results;
}

// ─── Bing 解析 ───────────────────────────────────────────────
function parseBing(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // 匹配 Bing 搜索结果: <li class="b_algo"> ... </li>
  const blocks = html.split(/<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>/i);
  for (let i = 1; i < blocks.length && results.length < 8; i++) {
    const block = blocks[i];
    const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
      || block.match(/class="[^"]*b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);

    const title = titleMatch ? stripHtml(titleMatch[2]).trim() : '';
    const url = titleMatch ? titleMatch[1] : '';
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]).trim() : '';

    if (title && snippet && url) {
      results.push({ title, snippet, url });
    }
  }
  return results;
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
}

// ─── 格式化 ──────────────────────────────────────────────────
export function formatSearchContext(results: SearchResult[], query: string, engine: string): string {
  if (results.length === 0) return '';
  const lines = [
    `[联网搜索结果 - ${engine}]`,
    `搜索关键词: "${query}"`,
    '',
  ];
  for (let i = 0; i < Math.min(results.length, 6); i++) {
    const r = results[i];
    lines.push(`[${i + 1}] ${r.title}`);
    lines.push(`    ${r.snippet}`);
    lines.push(`    链接: ${r.url}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ─── 搜索执行 ────────────────────────────────────────────────
async function searchProvider(query: string, provider: string): Promise<{ results: SearchResult[]; engine: string }> {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const engines: { name: string; url: string; parser: (html: string) => SearchResult[] }[] = [];

  if (provider === 'auto' || provider === 'bing') {
    engines.push({ name: 'bing', url: `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=10`, parser: parseBing });
  }
  if (provider === 'auto' || provider === 'baidu') {
    engines.push({ name: 'baidu', url: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=10`, parser: parseBaidu });
  }

  for (const engine of engines) {
    try {
      const res = await fetch(engine.url, { headers: { 'User-Agent': ua } });
      if (!res.ok) continue;
      const html = await res.text();
      // 跳过验证码页面
      if (html.length < 1000) continue;
      const results = engine.parser(html);
      if (results.length > 0) {
        return { results, engine: engine.name };
      }
    } catch {}
  }

  return { results: [], engine: 'none' };
}

// ─── API 端点 ─────────────────────────────────────────────────
export async function GET({ url, request }) {
  try {
    const auth = requireAuth(request);
    const query = url.searchParams.get('q');
    const provider = url.searchParams.get('provider') || 'auto';

    if (!query || query.trim() === '') {
      return json({ error: '缺少搜索关键词' }, { status: 400 });
    }

    const { results, engine } = await searchProvider(query.trim(), provider);
    const context = formatSearchContext(results, query.trim(), engine);

    return json({ results, context, query: query.trim(), engine });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('搜索错误:', error);
    return json({ error: '搜索失败' }, { status: 500 });
  }
}
