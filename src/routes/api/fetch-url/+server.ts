import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { isPrivateUrl } from "$lib/utils";

export async function POST({ request }) {
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
		// 简单提取文本
		const trimmedText = html
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 8000);

		return json({ content: trimmedText });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "抓取失败" }, { status: 500 });
	}
}
