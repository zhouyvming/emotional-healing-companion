import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";

export async function POST({ request }: { request: Request }) {
	try {
		requireAuth(request);

		const { baseUrl, apiKey } = await request.json();
		if (!baseUrl || typeof baseUrl !== "string") {
			return json({ error: "缺少 API 地址" }, { status: 400 });
		}
		if (!apiKey || typeof apiKey !== "string") {
			return json({ error: "缺少 API Key" }, { status: 400 });
		}

		const upstream = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			}
		});

		const data = await upstream.json().catch(() => ({}));
		return json(data, { status: upstream.status });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		console.error("[OpenAI 代理] 模型列表请求失败:", error);
		return json({ error: "API 请求失败" }, { status: 502 });
	}
}
