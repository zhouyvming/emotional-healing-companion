import { json } from "@sveltejs/kit";
import { getSample } from "$lib/server/tts";
import { requireAuth, AuthError } from "$lib/server/auth";

export async function GET({ request, params }: { request: Request; params: { id: string } }) {
	try {
		const auth = requireAuth(request);
		const sample = await getSample(auth.username, params.id);
		if (!sample) {
			return json({ error: "该音色没有示例音频" }, { status: 404 });
		}
		return new Response(sample.buffer, {
			headers: {
				"Content-Type": sample.mime,
				"Cache-Control": "private, max-age=3600"
			}
		});
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "获取示例音频失败" }, { status: 500 });
	}
}
