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
		const { baseUrl, apiKey } = await request.json();
		if (!baseUrl || typeof baseUrl !== "string") {
			return json({ error: "缺少本地 API 地址" }, { status: 400 });
		}

		const apiBase = normalizeLocalOpenAIBaseUrl(baseUrl);
		assertNotSameOriginLocalBackend(apiBase, request.url);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30000);
		request.signal.addEventListener("abort", () => controller.abort(), { once: true });

		const upstream = await fetch(`${apiBase}/models`, {
			headers: localOpenAIHeaders(apiKey),
			signal: controller.signal
		});
		clearTimeout(timeout);

		const body = await upstream.text();
		return new Response(body, {
			status: upstream.status,
			headers: {
				"Content-Type": upstream.headers.get("content-type") || "application/json"
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
