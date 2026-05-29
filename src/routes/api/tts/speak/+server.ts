import { json } from "@sveltejs/kit";
import { synthesizeSpeech } from "$lib/server/tts";
import { requireAuth, AuthError } from "$lib/server/auth";

export async function POST({ request }: { request: Request }) {
	try {
		const auth = requireAuth(request);
		const { text, voiceId, rate, volume } = await request.json();
		if (!text || typeof text !== "string") {
			return json({ error: "朗读文本为空" }, { status: 400 });
		}

		const audio = await synthesizeSpeech(auth.username, {
			text,
			voiceId: voiceId ? String(voiceId) : undefined,
			rate: Number(rate || 1),
			volume: Number(volume || 1)
		});

		return new Response(audio.buffer, {
			headers: {
				"Content-Type": audio.mime,
				"Cache-Control": "no-store"
			}
		});
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json(
			{ error: error instanceof Error ? error.message : "语音生成失败" },
			{ status: 500 }
		);
	}
}
