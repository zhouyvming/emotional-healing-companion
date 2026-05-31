import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { isPrivateUrl } from "$lib/utils";

function decodeHtml(value: string) {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/&#x27;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
}

function extractJsonLdItemList(html: string) {
	const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
	for (const block of blocks) {
		try {
			const parsed = JSON.parse(decodeHtml(block[1]).trim());
			const candidates = Array.isArray(parsed) ? parsed : [parsed, parsed.mainEntity].filter(Boolean);
			for (const candidate of candidates) {
				const items = candidate?.itemListElement;
				if (!Array.isArray(items) || items.length === 0) continue;
				const lines = items
					.slice(0, 50)
					.map((item: any, index: number) => {
						const position = item.position || index + 1;
						const name = item.name || item.item?.name;
						const url = item.url || item.item?.url;
						return name ? `${position}. ${name}${url ? ` - ${url}` : ""}` : "";
					})
					.filter(Boolean);
				if (lines.length > 0) return `结构化榜单条目：\n${lines.join("\n")}`;
			}
		} catch {
			// ignore invalid JSON-LD blocks
		}
	}
	return "";
}

export async function POST({ request }: { request: Request }) {
	try {
		requireAuth(request);
		const { url } = await request.json();
		if (!url || !url.startsWith("http")) {
			return json({ error: "无效的 URL" }, { status: 400 });
		}
		if (isPrivateUrl(url)) {
			return json({ error: "不允许访问内网地址" }, { status: 403 });
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);

		const res = await fetch(url, {
			signal: controller.signal,
			redirect: "manual",
			headers: { "User-Agent": "Mozilla/5.0 (compatible; OllamaWebUI/1.0)" }
		});
		clearTimeout(timeout);

		if (!res.ok) {
			return json({ error: "无法访问该链接" }, { status: 502 });
		}

		const contentType = res.headers.get("content-type") || "";
		if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
			return json({ error: "不支持的链接类型" }, { status: 415 });
		}

		const contentLength = parseInt(res.headers.get("content-length") || "0");
		if (contentLength > 1_000_000) {
			return json({ error: "链接内容过大" }, { status: 413 });
		}

		const text = await res.text();
		const html = text.slice(0, 1_000_000);
		const itemListText = extractJsonLdItemList(html);
		// 简单提取文本
		const trimmedText = html
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 8000);

		return json({ content: [itemListText, trimmedText].filter(Boolean).join("\n\n").slice(0, 8000) });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "抓取失败" }, { status: 500 });
	}
}
