import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";

export async function POST({ request }: { request: Request }) {
	try {
		requireAuth(request);

		const { baseUrl, apiKey, payload } = await request.json();
		if (!baseUrl || typeof baseUrl !== "string") {
			return json({ error: "缺少 API 地址" }, { status: 400 });
		}
		if (!apiKey || typeof apiKey !== "string") {
			return json({ error: "缺少 API Key" }, { status: 400 });
		}
		if (!payload || typeof payload !== "object") {
			return json({ error: "缺少请求内容" }, { status: 400 });
		}

		const upstream = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(payload)
		});

		return new Response(upstream.body, {
			status: upstream.status,
			statusText: upstream.statusText,
			headers: {
				"Content-Type": upstream.headers.get("content-type") ?? "application/json",
				"Cache-Control": "no-cache"
			}
		});
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		console.error("[OpenAI 代理] 聊天请求失败:", error);
		return json({ error: "API 请求失败" }, { status: 502 });
	}
}
