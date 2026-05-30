import { json, type RequestHandler } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { TTS_VOICES } from "$lib/server/tts";

export const GET: RequestHandler = async ({ request }) => {
	try {
		requireAuth(request);
		return json({ voices: TTS_VOICES });
	} catch (error: any) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: error.message || "加载音色失败" }, { status: 500 });
	}
};
