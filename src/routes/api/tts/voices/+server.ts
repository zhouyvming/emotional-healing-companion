import { json } from "@sveltejs/kit";
import { listVoices } from "$lib/server/tts";
import { requireAuth, AuthError } from "$lib/server/auth";

export async function GET({ request }: { request: Request }) {
	try {
		const auth = requireAuth(request);
		const voices = await listVoices(auth.username);
		return json({ voices });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "获取音色列表失败" }, { status: 500 });
	}
}
