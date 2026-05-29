import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { getProviderForUser, providerAllowsModel } from "$lib/server/providers";

const REQUEST_TIMEOUT_MS = 120000;

export async function POST({ request }: { request: Request }) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	request.signal.addEventListener("abort", () => controller.abort(), { once: true });

	try {
		const auth = requireAuth(request);
		const { providerId, payload } = await request.json();

		if (!providerId || typeof providerId !== "string") {
			return json({ error: "缺少 API 提供商" }, { status: 400 });
		}
		if (!payload || typeof payload !== "object") {
			return json({ error: "缺少请求内容" }, { status: 400 });
		}
		if (!payload.model || typeof payload.model !== "string") {
			return json({ error: "缺少模型名称" }, { status: 400 });
		}

		const provider = await getProviderForUser(auth.username, providerId);
		if (!provider) {
			return json({ error: "API 提供商不存在" }, { status: 404 });
		}
		if (!providerAllowsModel(provider, payload.model)) {
			return json({ error: "当前提供商不包含该模型" }, { status: 403 });
		}

		const upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
			method: "POST",
			signal: controller.signal,
			headers: {
				Authorization: `Bearer ${provider.apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(payload)
		});

		clearTimeout(timeout);
		return new Response(upstream.body, {
			status: upstream.status,
			statusText: upstream.statusText,
			headers: {
				"Content-Type": upstream.headers.get("content-type") ?? "application/json",
				"Cache-Control": "no-cache"
			}
		});
	} catch (error) {
		clearTimeout(timeout);
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		if (error instanceof Error && error.name === "AbortError") {
			return json({ error: "API 请求超时" }, { status: 504 });
		}
		console.error("[OpenAI 代理] 聊天请求失败:", error);
		return json(
			{ error: error instanceof Error ? error.message : "API 请求失败" },
			{ status: 502 }
		);
	}
}
