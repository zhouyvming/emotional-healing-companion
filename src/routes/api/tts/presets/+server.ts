import { json } from "@sveltejs/kit";
import { TTS_PRESETS } from "$lib/server/tts";
import { requireAuth, AuthError } from "$lib/server/auth";

export async function GET({ request }: { request: Request }) {
	try {
		requireAuth(request);
		return json({
			presets: TTS_PRESETS
		});
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "获取音色预设失败" }, { status: 500 });
	}
}
