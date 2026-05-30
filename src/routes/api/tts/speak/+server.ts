import { json, type RequestHandler } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { synthesizeSpeech } from "$lib/server/tts";

export const POST: RequestHandler = async ({ request }) => {
	try {
		requireAuth(request);
		const { text, voiceId, rate, volume } = await request.json();
		const result = await synthesizeSpeech({
			text: String(text || ""),
			voiceId: voiceId ? String(voiceId) : undefined,
			rate: rate === undefined ? undefined : Number(rate),
			volume: volume === undefined ? undefined : Number(volume)
		});

		return new Response(result.buffer, {
			headers: {
				"Content-Type": result.mime,
				"Cache-Control": "no-store"
			}
		});
	} catch (error: any) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		const message = error instanceof Error ? error.message : "语音生成失败";
		const status = message.includes("未知的内置 TTS 音色") ? 400 : 503;
		return json({ error: message }, { status });
	}
};
