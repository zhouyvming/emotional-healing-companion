import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { buildOllamaUpstreamUrl } from "$lib/server/ollama";
import type { RequestHandler } from "./$types";

const HOP_BY_HOP_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
	"authorization"
]);

function upstreamHeaders(request: Request) {
	const headers = new Headers();
	for (const [key, value] of request.headers.entries()) {
		if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
	}
	return headers;
}

async function proxyOllama({ request, params, url }: Parameters<RequestHandler>[0]) {
	try {
		requireAuth(request);
		const path = params.path;
		if (!path) return json({ error: "缺少 Ollama API 路径" }, { status: 400 });

		const upstream = await fetch(buildOllamaUpstreamUrl(path, url.search), {
			method: request.method,
			headers: upstreamHeaders(request),
			body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
			duplex: "half",
			signal: request.signal
		} as RequestInit & { duplex: "half" });

		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				"Content-Type": upstream.headers.get("content-type") || "application/json"
			}
		});
	} catch (error: any) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		const status = error?.name === "AbortError" ? 504 : 502;
		return json(
			{
				error:
					error?.name === "AbortError"
						? "服务端 Ollama 请求超时"
						: error?.message || "服务端 Ollama 请求失败"
			},
			{ status }
		);
	}
}

export const GET = proxyOllama;
export const POST = proxyOllama;
export const DELETE = proxyOllama;
