import { json, type RequestHandler } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { getTtsHealth } from "$lib/server/tts";

export const GET: RequestHandler = async ({ request }) => {
	try {
		requireAuth(request);
		return json(await getTtsHealth());
	} catch (error: any) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: error.message || "检查 TTS 状态失败" }, { status: 500 });
	}
};
