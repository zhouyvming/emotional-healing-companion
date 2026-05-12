import { json } from '@sveltejs/kit';
import { requireAuth, AuthError } from '$lib/server/auth';
import { SEARCH_PROVIDER_URL } from '$lib/constants';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function parseDuckDuckGoHTML(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Split by result blocks
  const resultBlocks = html.split(/<div[^>]*class="[^"]*result[^"]*"[^>]*>/i).slice(1);

  for (const block of resultBlocks) {
    if (results.length >= 8) break;

    const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const urlMatch = block.match(/<a[^>]*class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

    const title = titleMatch ? titleMatch[2].replace(/<[^>]*>/g, '').trim() : '';
    const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
    const url = titleMatch ? titleMatch[1] : '';

    if (title && snippet) {
      results.push({ title, snippet, url });
    }
  }

  return results;
}

function formatSearchContext(results: SearchResult[], query: string): string {
  if (results.length === 0) return '';

  const lines = [
    `以下是与用户问题"${query}"相关的网络搜索结果（请根据这些信息辅助回答，在回答中引用相关来源）：`,
    ''
  ];
  for (let i = 0; i < results.length; i++) {
    lines.push(`[${i + 1}] ${results[i].title}`);
    lines.push(`    ${results[i].snippet}`);
    if (results[i].url) lines.push(`    来源: ${results[i].url}`);
    lines.push('');
  }
  lines.push('请基于以上搜索结果，用中文回答用户的问题。请自然地引用来源信息。');
  return lines.join('\n');
}

export async function GET({ url, request }) {
  try {
    const auth = requireAuth(request);
    const query = url.searchParams.get('q');

    if (!query || query.trim() === '') {
      return json({ error: '缺少搜索关键词' }, { status: 400 });
    }

    const searchUrl = `${SEARCH_PROVIDER_URL}?q=${encodeURIComponent(query.trim())}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      return json({ error: '搜索请求失败' }, { status: 502 });
    }

    const html = await res.text();
    const results = parseDuckDuckGoHTML(html);
    const context = formatSearchContext(results, query.trim());

    return json({ results, context, query: query.trim() });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, { status: 401 });
    }
    console.error('搜索错误:', error);
    return json({ error: '搜索失败' }, { status: 500 });
  }
}
