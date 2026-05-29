import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { getProviderForUser } from "$lib/server/providers";

const REQUEST_TIMEOUT_MS = 30000;

export async function POST({ request }: { request: Request }) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	request.signal.addEventListener("abort", () => controller.abort(), { once: true });

	try {
		const auth = requireAuth(request);
		const { providerId } = await request.json();

		if (!providerId || typeof providerId !== "string") {
			return json({ error: "缺少 API 提供商" }, { status: 400 });
		}

		const provider = await getProviderForUser(auth.username, providerId);
		if (!provider) {
			return json({ error: "API 提供商不存在" }, { status: 404 });
		}

		const upstream = await fetch(`${provider.baseUrl}/models`, {
			signal: controller.signal,
			headers: {
				Authorization: `Bearer ${provider.apiKey}`,
				"Content-Type": "application/json"
			}
		});

		const data = await upstream.json().catch(() => ({}));
		clearTimeout(timeout);
		return json(data, { status: upstream.status });
	} catch (error) {
		clearTimeout(timeout);
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		if (error instanceof Error && error.name === "AbortError") {
			return json({ error: "API 请求超时" }, { status: 504 });
		}
		console.error("[OpenAI 代理] 模型列表请求失败:", error);
		return json(
			{ error: error instanceof Error ? error.message : "API 请求失败" },
			{ status: 502 }
		);
	}
}
