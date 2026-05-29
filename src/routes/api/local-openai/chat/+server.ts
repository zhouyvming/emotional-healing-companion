import { json } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/auth";
import {
	assertNotSameOriginLocalBackend,
	normalizeLocalOpenAIBaseUrl,
	localOpenAIHeaders
} from "$lib/server/local-openai";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	try {
		requireAuth(request);
		const { baseUrl, apiKey, payload } = await request.json();
		if (!baseUrl || typeof baseUrl !== "string") {
			return json({ error: "缺少本地 API 地址" }, { status: 400 });
		}
		if (!payload?.model) {
			return json({ error: "缺少模型名称" }, { status: 400 });
		}

		const apiBase = normalizeLocalOpenAIBaseUrl(baseUrl);
		assertNotSameOriginLocalBackend(apiBase, request.url);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 120000);
		request.signal.addEventListener("abort", () => controller.abort(), { once: true });

		const upstream = await fetch(`${apiBase}/chat/completions`, {
			method: "POST",
			headers: localOpenAIHeaders(apiKey),
			body: JSON.stringify(payload),
			signal: controller.signal
		});
		clearTimeout(timeout);

		if (!upstream.ok) {
			const text = await upstream.text();
			return new Response(text || JSON.stringify({ error: `HTTP ${upstream.status}` }), {
				status: upstream.status,
				headers: {
					"Content-Type": upstream.headers.get("content-type") || "application/json"
				}
			});
		}

		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				"Content-Type": upstream.headers.get("content-type") || "text/event-stream"
			}
		});
	} catch (error: any) {
		const status = error?.name === "AbortError" ? 504 : 502;
		return json(
			{
				error: error?.name === "AbortError" ? "本地模型服务请求超时" : error.message || "请求失败"
			},
			{ status }
		);
	}
};
