import { json } from "@sveltejs/kit";
import { ensureBuiltInDefaultVoice } from "$lib/server/tts";
import { requireAuth, AuthError } from "$lib/server/auth";

export async function POST({ request }: { request: Request }) {
	try {
		const auth = requireAuth(request);
		const voice = await ensureBuiltInDefaultVoice(auth.username);
		return json({ voice });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: error instanceof Error ? error.message : "准备内置音色失败" }, { status: 500 });
	}
}
