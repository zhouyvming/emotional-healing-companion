import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { isPrivateUrl } from "$lib/utils";

// 解码 HTML 响应，自动处理 GBK/UTF-8 编码
async function fetchHtml(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<string | null> {
	const controller = new AbortController();
	const t = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { headers, signal: controller.signal });
		if (!res.ok) return null;
		const contentType = res.headers.get("content-type") || "";
		const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
		const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "";
		if (charset === "gbk" || charset === "gb2312" || charset === "gb18030") {
			try {
				const buf = Buffer.from(await res.arrayBuffer());
				return buf.toString("gbk");
			} catch {
				return res.text();
			}
		}
		return res.text();
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

interface EngineConfig {
	name: string;
	url: (q: string) => string;
	headers: Record<string, string>;
	parse: (html: string) => { title: string; snippet: string; url: string }[];
}

function parseBing(html: string) {
	const results: { title: string; snippet: string; url: string }[] = [];
	const blocks = html.split(/<li[^>]*class="b_algo"[^>]*>/gi).slice(1);
	for (const block of blocks) {
		if (results.length >= 5) break;
		const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
		const snippetMatch = block.match(
			/(?:<p[^>]*class="b_lineclamp\d*"[^>]*>|<div[^>]*class="b_caption"[^>]*>[\s\S]*?<p[^>]*>)([\s\S]*?)<\/(?:p|div)>/i
		);
		if (titleMatch) {
			const title = titleMatch[2].replace(/<[^>]+>/g, "").trim();
			const url = titleMatch[1];
			const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
			if (title) results.push({ title, snippet: snippet || title, url });
		}
	}
	return results;
}

function parseBaidu(html: string) {
	const results: { title: string; snippet: string; url: string }[] = [];
	// 百度结果：<div class="result c-container"> 或 <div class="c-result">
	const blocks = html.split(/<div[^>]*class="(?:result|c-result)[^"]*"[^>]*>/gi).slice(1);
	for (const block of blocks) {
		if (results.length >= 5) break;
		const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
		const snippetMatch = block.match(/(?:class="c-abstract"[^>]*>|class="content-right_[^"]*"[^>]*>)([\s\S]*?)<\/(?:div|span)>/i);
		if (titleMatch) {
			const title = titleMatch[2].replace(/<[^>]+>/g, "").trim();
			const url = titleMatch[1];
			const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
			// 过滤百度自身页面
			const noiseHosts = ["passport.baidu.com", "top.baidu.com", "baidu.com/search", "zhidao.baidu.com"];
			if (title && !noiseHosts.some((h) => url.includes(h))) {
				results.push({ title, snippet: snippet || title, url });
			}
		}
	}
	return results;
}

function parseDDG(html: string) {
	const results: { title: string; snippet: string; url: string }[] = [];
	const regex =
		/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
	let match;
	while ((match = regex.exec(html)) !== null && results.length < 5) {
		const rawUrl = match[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").replace(/&rut=.*$/, "");
		const url = decodeURIComponent(rawUrl);
		const title = match[2].replace(/<[^>]+>/g, "").trim();
		const snippet = match[3].replace(/<[^>]+>/g, "").trim();
		if (title && snippet && url.startsWith("http")) {
			results.push({ title, snippet, url });
		}
	}
	return results;
}

const ENGINES: Record<string, EngineConfig> = {
	"cn.bing.com": {
		name: "Bing 中国",
		url: (q) => `https://cn.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-Hans&count=10`,
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept-Language": "zh-CN,zh;q=0.9",
			Accept: "text/html,application/xhtml+xml"
		},
		parse: parseBing
	},
	"www.baidu.com": {
		name: "百度",
		url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}&ie=utf-8&rn=10`,
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept-Language": "zh-CN,zh;q=0.9",
			Accept: "text/html,application/xhtml+xml"
		},
		parse: parseBaidu
	},
	"www.bing.com": {
		name: "Bing 国际",
		url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-Hans&count=10`,
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept-Language": "zh-CN,zh;q=0.9",
			Accept: "text/html,application/xhtml+xml"
		},
		parse: parseBing
	},
	"html.duckduckgo.com": {
		name: "DuckDuckGo",
		url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
		},
		parse: parseDDG
	}
};

export async function POST({ request }) {
	try {
		requireAuth(request);
		const { query, engine, customUrl } = await request.json();
		if (!query || typeof query !== "string" || query.trim().length < 2) {
			return json({ error: "无效的搜索关键词" }, { status: 400 });
		}

		const q = query.trim();
		const selectedEngine = engine || "cn.bing.com";

		// 自定义搜索引擎
		if (selectedEngine === "custom" && customUrl && customUrl.includes("{query}")) {
			const url = customUrl.replace(/\{query\}/g, encodeURIComponent(q));
			if (isPrivateUrl(url)) {
				return json({ error: "不允许使用内网地址作为搜索引擎" }, { status: 403 });
			}
			const html = await fetchHtml(url, {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				"Accept-Language": "zh-CN,zh;q=0.9"
			});
			if (html) {
				const results = parseBing(html);
				if (results.length > 0) return json({ results, engine: "自定义" });
			}
		}

		// 内置引擎
		const engineConfig = ENGINES[selectedEngine];
		const enginesToTry = engineConfig
			? [engineConfig, ENGINES["cn.bing.com"]]
			: [ENGINES["cn.bing.com"]];

		for (const cfg of enginesToTry) {
			const html = await fetchHtml(cfg.url(q), cfg.headers);
			if (!html) continue;
			const results = cfg.parse(html);
			if (results.length > 0) {
				return json({ results, engine: cfg.name });
			}
		}

		return json({ error: "所有搜索引擎暂不可用，请稍后重试" }, { status: 503 });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "搜索失败" }, { status: 500 });
	}
}
