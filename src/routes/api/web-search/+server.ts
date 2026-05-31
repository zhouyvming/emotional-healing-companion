import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { isPrivateUrl } from "$lib/utils";

interface SearchResult {
	title: string;
	snippet: string;
	url: string;
	source?: string;
	publishedAt?: string;
	engine?: string;
}

interface EngineConfig {
	name: string;
	url: (q: string, freshness: Freshness) => string;
	headers: Record<string, string>;
	parse: (html: string) => SearchResult[];
}

type Freshness = "day" | "week" | "month";

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const freshnessFilter = (freshness: Freshness) => {
	if (freshness === "day") return `&filters=${encodeURIComponent('ex1:"ez1"')}`;
	if (freshness === "week") return `&filters=${encodeURIComponent('ex1:"ez2"')}`;
	return `&filters=${encodeURIComponent('ex1:"ez3"')}`;
};

const decodeHtml = (value: string) =>
	value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");

const stripTags = (value: string) => decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const normalizePublicUrl = (rawUrl: string): string | null => {
	try {
		let url = decodeHtml(rawUrl).trim();
		if (url.startsWith("//")) url = `https:${url}`;
		if (url.includes("duckduckgo.com/l/?uddg=")) {
			const parsed = new URL(url.startsWith("http") ? url : `https:${url}`);
			url = decodeURIComponent(parsed.searchParams.get("uddg") || "");
		}
		const parsed = new URL(url);
		if (!["http:", "https:"].includes(parsed.protocol)) return null;
		if (isPrivateUrl(parsed.toString())) return null;
		const noisyHosts = [
			"bing.com/search",
			"cn.bing.com/search",
			"www.bing.com/search",
			"baidu.com/search",
			"passport.baidu.com",
			"top.baidu.com"
		];
		if (noisyHosts.some((host) => parsed.href.includes(host))) return null;
		return parsed.toString();
	} catch {
		return null;
	}
};

const parseDate = (value: string): string | undefined => {
	const clean = stripTags(value);
	const direct = Date.parse(clean);
	if (!Number.isNaN(direct)) return new Date(direct).toISOString();

	const relative = clean.match(/(\d+)\s*(分钟|小时|天|周|个月|月|年|minutes?|hours?|days?|weeks?|months?|years?)前/i);
	if (!relative) return undefined;
	const amount = Number(relative[1]);
	const unit = relative[2].toLowerCase();
	const date = new Date();
	if (unit.includes("分钟") || unit.startsWith("minute")) date.setMinutes(date.getMinutes() - amount);
	else if (unit.includes("小时") || unit.startsWith("hour")) date.setHours(date.getHours() - amount);
	else if (unit.includes("天") || unit.startsWith("day")) date.setDate(date.getDate() - amount);
	else if (unit.includes("周") || unit.startsWith("week")) date.setDate(date.getDate() - amount * 7);
	else if (unit.includes("月") || unit.startsWith("month")) date.setMonth(date.getMonth() - amount);
	else if (unit.includes("年") || unit.startsWith("year")) date.setFullYear(date.getFullYear() - amount);
	return date.toISOString();
};

async function fetchText(url: string, headers: Record<string, string>, timeoutMs = 10000): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			headers,
			signal: controller.signal,
			cache: "no-store"
		});
		if (!res.ok) return null;
		const contentType = res.headers.get("content-type") || "";
		const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
		const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "";
		if (charset === "gbk" || charset === "gb2312" || charset === "gb18030") {
			const buf = await res.arrayBuffer();
			return new TextDecoder("gbk").decode(buf);
		}
		return res.text();
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function uniqueResults(results: SearchResult[]) {
	const seen = new Set<string>();
	return results.filter((result) => {
		const url = normalizePublicUrl(result.url);
		if (!url || seen.has(url) || !result.title) return false;
		seen.add(url);
		result.url = url;
		return true;
	});
}

function rankRecent(results: SearchResult[]) {
	return results.sort((a, b) => {
		const at = a.publishedAt ? Date.parse(a.publishedAt) : 0;
		const bt = b.publishedAt ? Date.parse(b.publishedAt) : 0;
		return bt - at;
	});
}

function isHotListQuery(q: string) {
	return /微博.*热搜|热搜.*微博|微博.*热榜|热榜.*微博/i.test(q);
}

function filterHotListResults(q: string, results: SearchResult[]) {
	if (!isHotListQuery(q)) return results;
	return results.filter((result) => {
		const haystack = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
		return (
			/(微博|热搜|热榜|榜单)/.test(haystack) ||
			/(hotflashnews|hotdata|aipromptnav|tophub|uapis|s\.weibo\.com)/i.test(result.url)
		);
	});
}

function normalizeSearchQuery(q: string) {
	if (!isHotListQuery(q)) return q;
	const dateParts = [
		...q.matchAll(/(?:\d{4}[年/-])?\d{1,2}[月/-]\d{1,2}日?/g),
		...q.matchAll(/昨天|昨日|今天|今日|实时|最新/g)
	].map((match) => match[0]);
	return [...dateParts, "微博热搜", "热榜"].join(" ").trim();
}

function extractJsonLdHotItems(html: string) {
	const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
	for (const block of blocks) {
		try {
			const parsed = JSON.parse(decodeHtml(block[1]).trim());
			const candidates = Array.isArray(parsed) ? parsed : [parsed, parsed.mainEntity].filter(Boolean);
			for (const candidate of candidates) {
				const items = candidate?.itemListElement;
				if (!Array.isArray(items) || items.length === 0) continue;
				const names = items
					.slice(0, 20)
					.map((item: any, index: number) => {
						const name = item.name || item.item?.name;
						const position = item.position || index + 1;
						return name ? `${position}. ${name}` : "";
					})
					.filter(Boolean);
				if (names.length > 0) return names;
			}
		} catch {
			// ignore invalid JSON-LD
		}
	}
	return [];
}

async function searchWeiboHotListSource(q: string): Promise<SearchResult[]> {
	if (!isHotListQuery(q)) return [];
	const url = "https://hotflashnews.com/platform/weibo";
	const html = await fetchText(url, {
		"User-Agent": USER_AGENT,
		"Accept-Language": "zh-CN,zh;q=0.9",
		Accept: "text/html,application/xhtml+xml"
	});
	if (!html) return [];
	const items = extractJsonLdHotItems(html);
	if (items.length === 0) return [];
	const modifiedAt = parseDate(html.match(/"dateModified"\s*:\s*"([^"]+)"/)?.[1] || "");
	const updatedText = modifiedAt ? `更新时间：${modifiedAt}。` : "";
	const realtimeNote = /昨天|昨日/.test(q) ? "该来源提供实时榜单，非历史归档。请结合其他搜索结果核对指定日期。" : "";
	return [
		{
			title: "微博实时热搜榜 - HotFlashNews",
			snippet: `${updatedText}${realtimeNote}页面实时榜单条目：${items.join("；")}`,
			url,
			source: "hotflashnews.com",
			publishedAt: modifiedAt,
			engine: "HotFlashNews"
		}
	];
}

async function enrichHotListResults(q: string, results: SearchResult[]) {
	if (!isHotListQuery(q)) return results;
	const enriched = [...results];
	for (const result of enriched.slice(0, 3)) {
		const host = (() => {
			try {
				return new URL(result.url).hostname;
			} catch {
				return "";
			}
		})();
		if (!/(hotflashnews|hotdata|aipromptnav|tophub|uapis)/i.test(host)) continue;
		const html = await fetchText(result.url, {
			"User-Agent": USER_AGENT,
			"Accept-Language": "zh-CN,zh;q=0.9",
			Accept: "text/html,application/xhtml+xml"
		});
		if (!html) continue;
		const items = extractJsonLdHotItems(html);
		if (items.length === 0) continue;
		const modifiedAt = parseDate(html.match(/"dateModified"\s*:\s*"([^"]+)"/)?.[1] || "");
		const updatedText = modifiedAt ? `更新时间：${modifiedAt}。` : "";
		const realtimeNote = /昨天|昨日/.test(q) ? "该来源提供实时榜单，非历史归档。请结合其他搜索结果核对指定日期。" : "";
		result.snippet = `${updatedText}${realtimeNote}页面实时榜单条目：${items.join("；")}`;
		result.publishedAt = result.publishedAt || modifiedAt;
		break;
	}
	return enriched;
}

function parseBing(html: string) {
	const results: SearchResult[] = [];
	const blocks = html.split(/<li[^>]*class="b_algo"[^>]*>/gi).slice(1);
	for (const block of blocks) {
		const titleMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
		if (!titleMatch) continue;
		const snippetMatch = block.match(
			/(?:<p[^>]*>|<div[^>]*class="b_caption"[^>]*>[\s\S]*?<p[^>]*>)([\s\S]*?)<\/p>/i
		);
		const dateMatch = block.match(/(?:<span[^>]*class="(?:news_dt|b_secondaryText)"[^>]*>|<span[^>]*>)([^<]*(?:前|ago|202\d)[^<]*)<\/span>/i);
		const url = normalizePublicUrl(titleMatch[1]);
		if (!url) continue;
		results.push({
			title: stripTags(titleMatch[2]),
			snippet: snippetMatch ? stripTags(snippetMatch[1]) : stripTags(titleMatch[2]),
			url,
			source: new URL(url).hostname.replace(/^www\./, ""),
			publishedAt: dateMatch ? parseDate(dateMatch[1]) : undefined
		});
	}
	return uniqueResults(results);
}

function parseBaidu(html: string) {
	const results: SearchResult[] = [];
	const blocks = html.split(/<div[^>]*class="(?:result|c-result)[^"]*"[^>]*>/gi).slice(1);
	for (const block of blocks) {
		const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
		if (!titleMatch) continue;
		const snippetMatch = block.match(/(?:class="c-abstract"[^>]*>|class="content-right_[^"]*"[^>]*>)([\s\S]*?)<\/(?:div|span)>/i);
		const url = normalizePublicUrl(titleMatch[1]);
		if (!url) continue;
		results.push({
			title: stripTags(titleMatch[2]),
			snippet: snippetMatch ? stripTags(snippetMatch[1]) : stripTags(titleMatch[2]),
			url,
			source: new URL(url).hostname.replace(/^www\./, "")
		});
	}
	return uniqueResults(results);
}

function parseDDG(html: string) {
	const results: SearchResult[] = [];
	const blocks = html.split(/<div[^>]*class="result[^"]*"[^>]*>/gi).slice(1);
	for (const block of blocks) {
		const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
		if (!titleMatch) continue;
		const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
		const url = normalizePublicUrl(titleMatch[1]);
		if (!url) continue;
		results.push({
			title: stripTags(titleMatch[2]),
			snippet: snippetMatch ? stripTags(snippetMatch[1]) : stripTags(titleMatch[2]),
			url,
			source: new URL(url).hostname.replace(/^www\./, "")
		});
	}
	return uniqueResults(results);
}

function parseGoogleNewsRss(xml: string) {
	const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
	const results: SearchResult[] = [];
	for (const item of items) {
		const block = item[1];
		const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
		const link = block.match(/<link>([\s\S]*?)<\/link>/i);
		const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
		const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
		if (!title || !link) continue;
		const url = normalizePublicUrl(stripTags(link[1]));
		if (!url) continue;
		results.push({
			title: stripTags(title[1] || title[2] || ""),
			snippet: stripTags(title[1] || title[2] || ""),
			url,
			source: source ? stripTags(source[1]) : "Google News",
			publishedAt: pubDate ? parseDate(pubDate[1]) : undefined
		});
	}
	return uniqueResults(results);
}

function parseBingNewsRss(xml: string) {
	const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
	const results: SearchResult[] = [];
	for (const item of items) {
		const block = item[1];
		const title = block.match(/<title>([\s\S]*?)<\/title>/i);
		const link = block.match(/<link>([\s\S]*?)<\/link>/i);
		const description = block.match(/<description>([\s\S]*?)<\/description>/i);
		const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
		if (!title || !link) continue;
		const url = normalizePublicUrl(stripTags(link[1]));
		if (!url) continue;
		results.push({
			title: stripTags(title[1]),
			snippet: description ? stripTags(description[1]) : stripTags(title[1]),
			url,
			source: new URL(url).hostname.replace(/^www\./, ""),
			publishedAt: pubDate ? parseDate(pubDate[1]) : undefined
		});
	}
	return uniqueResults(results);
}

const ENGINES: Record<string, EngineConfig> = {
	"cn.bing.com": {
		name: "Bing 中国",
		url: (q, freshness) =>
			`https://cn.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-Hans&count=10${freshnessFilter(freshness)}`,
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "zh-CN,zh;q=0.9",
			Accept: "text/html,application/xhtml+xml"
		},
		parse: parseBing
	},
	"www.bing.com": {
		name: "Bing 国际",
		url: (q, freshness) =>
			`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-Hans&count=10${freshnessFilter(freshness)}`,
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "zh-CN,zh;q=0.9",
			Accept: "text/html,application/xhtml+xml"
		},
		parse: parseBing
	},
	"www.baidu.com": {
		name: "百度",
		url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}&ie=utf-8&rn=10`,
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "zh-CN,zh;q=0.9",
			Accept: "text/html,application/xhtml+xml"
		},
		parse: parseBaidu
	},
	"html.duckduckgo.com": {
		name: "DuckDuckGo",
		url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
		},
		parse: parseDDG
	}
};

async function searchGoogleNews(q: string, freshness: Freshness) {
	const when = freshness === "day" ? "1d" : freshness === "week" ? "7d" : "30d";
	const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${when}`)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
	const xml = await fetchText(url, {
		"User-Agent": USER_AGENT,
		Accept: "application/rss+xml,text/xml"
	});
	if (!xml) return [];
	return parseGoogleNewsRss(xml).map((result) => ({ ...result, engine: "Google News RSS" }));
}

async function searchBingNews(q: string, freshness: Freshness) {
	const freshnessQuery =
		freshness === "day"
			? `${q} when:1d`
			: freshness === "week"
			? `${q} when:7d`
			: `${q} when:30d`;
	const url = `https://www.bing.com/news/search?q=${encodeURIComponent(
		freshnessQuery
	)}&format=rss&setlang=zh-Hans&mkt=zh-CN`;
	const xml = await fetchText(url, {
		"User-Agent": USER_AGENT,
		Accept: "application/rss+xml,text/xml"
	});
	if (!xml) return [];
	return parseBingNewsRss(xml).map((result) => ({ ...result, engine: "Bing News RSS" }));
}

async function searchEngine(cfg: EngineConfig, q: string, freshness: Freshness) {
	const html = await fetchText(cfg.url(q, freshness), cfg.headers);
	if (!html) return [];
	return cfg.parse(html).map((result) => ({ ...result, engine: cfg.name }));
}

export async function POST({ request }: { request: Request }) {
	try {
		requireAuth(request);
		const { query, engine, customUrl, freshness = "day" } = await request.json();
		if (!query || typeof query !== "string" || query.trim().length < 2) {
			return json({ error: "无效的搜索关键词" }, { status: 400 });
		}

		const rawQuery = query.trim();
		const q = normalizeSearchQuery(rawQuery);
		const selectedFreshness: Freshness = ["day", "week", "month"].includes(freshness)
			? freshness
			: "day";
		const selectedEngine = engine || "cn.bing.com";
		const searchedAt = new Date().toISOString();

		if (selectedEngine === "custom" && customUrl && customUrl.includes("{query}")) {
			const url = customUrl.replace(/\{query\}/g, encodeURIComponent(q));
			if (isPrivateUrl(url)) {
				return json({ error: "不允许使用内网地址作为搜索引擎" }, { status: 403 });
			}
			const html = await fetchText(url, {
				"User-Agent": USER_AGENT,
				"Accept-Language": "zh-CN,zh;q=0.9"
			});
			if (html) {
				const results = await enrichHotListResults(rawQuery, rankRecent(parseBing(html)).slice(0, 5));
				if (results.length > 0) {
					return json({ results, engine: "自定义", freshness: selectedFreshness, searchedAt });
				}
			}
		}

		const engineConfig = ENGINES[selectedEngine] ?? ENGINES["cn.bing.com"];
		const candidateSets = await Promise.allSettled([
			searchWeiboHotListSource(rawQuery),
			searchBingNews(q, selectedFreshness),
			searchGoogleNews(q, selectedFreshness),
			searchEngine(engineConfig, q, selectedFreshness),
			...(engineConfig.name === "Bing 中国" ? [] : [searchEngine(ENGINES["cn.bing.com"], q, selectedFreshness)])
		]);

		let results: SearchResult[] = candidateSets.flatMap((set) =>
			set.status === "fulfilled" ? set.value : []
		);
		results = rankRecent(uniqueResults(results));
		results = await enrichHotListResults(rawQuery, results);
		results = filterHotListResults(rawQuery, results).slice(0, 5);
		if (results.length > 0) {
			return json({
				results,
				engine: `${engineConfig.name} + recent news`,
				freshness: selectedFreshness,
				searchedAt
			});
		}

		const widerFreshness = selectedFreshness === "day" ? ["week", "month"] : selectedFreshness === "week" ? ["month"] : [];
		for (const widened of widerFreshness) {
			const widenedFreshness = widened as Freshness;
			const widenedSets = await Promise.allSettled([
				searchWeiboHotListSource(rawQuery),
				searchBingNews(q, widenedFreshness),
				searchGoogleNews(q, widenedFreshness),
				searchEngine(engineConfig, q, widenedFreshness),
				...(engineConfig.name === "Bing 中国" ? [] : [searchEngine(ENGINES["cn.bing.com"], q, widenedFreshness)])
			]);
			let widenedResults: SearchResult[] = rankRecent(
				uniqueResults(
					widenedSets.flatMap((set) => (set.status === "fulfilled" ? set.value : []))
				)
			);
			await enrichHotListResults(rawQuery, widenedResults);
			widenedResults = filterHotListResults(rawQuery, widenedResults).slice(0, 5);
			if (widenedResults.length > 0) {
				return json({
					results: widenedResults,
					engine: `${engineConfig.name} + recent news`,
					freshness: widenedFreshness,
					searchedAt
				});
			}
		}

		return json({ error: "未找到近期可信搜索结果，请放宽时间范围或更换关键词" }, { status: 503 });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		console.error("[web-search] failed:", error);
		return json({ error: "搜索失败" }, { status: 500 });
	}
}
