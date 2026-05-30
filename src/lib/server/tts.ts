import path from "node:path";
import { existsSync } from "node:fs";

export interface TtsVoicePreset {
	id: string;
	displayName: string;
	description: string;
	speaker: number;
	stylePrompt: string;
	gender: "female";
	locale: "zh_CN";
	engine: "emotivoice";
}

export interface TtsAudioResult {
	buffer: Buffer;
	mime: "audio/wav";
}

const MAX_TTS_TEXT_LENGTH = 2000;
const DEFAULT_WORKER_URL = "http://127.0.0.1:8510";
const MODEL_ROOT = path.join(process.cwd(), "tools", "tts-models", "emotivoice");

export const TTS_VOICES: TtsVoicePreset[] = [
	{
		id: "gentle_maria",
		displayName: "温柔陪伴",
		description: "柔和、舒缓，适合安慰与陪伴的女声。",
		speaker: 8051,
		stylePrompt: "温柔、舒缓、亲切、富有安慰感",
		gender: "female",
		locale: "zh_CN",
		engine: "emotivoice"
	},
	{
		id: "cute_cori",
		displayName: "可爱元气",
		description: "轻快、可爱，适合积极鼓励的女声。",
		speaker: 92,
		stylePrompt: "开心、可爱、轻快、富有活力",
		gender: "female",
		locale: "zh_CN",
		engine: "emotivoice"
	},
	{
		id: "soft_christabel",
		displayName: "细腻共情",
		description: "柔和、细腻，适合情绪表达和共情回应的女声。",
		speaker: 1088,
		stylePrompt: "柔和、细腻、共情、情绪丰富",
		gender: "female",
		locale: "zh_CN",
		engine: "emotivoice"
	}
];

export function getTtsWorkerUrl() {
	return (process.env.EMOTIVOICE_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, "");
}

export function getTtsVoice(voiceId?: string) {
	return TTS_VOICES.find((voice) => voice.id === voiceId) ?? TTS_VOICES[0];
}

export function assertTtsVoice(voiceId?: string) {
	const voice = TTS_VOICES.find((item) => item.id === voiceId);
	if (!voice) throw new Error("未知的内置 TTS 音色");
	return voice;
}

export function sanitizeTtsText(raw: string) {
	return raw
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi, " ")
		.replace(/\[[^\]]+\]\(([^)]+)\)/g, " ")
		.replace(/[\uD800-\uDFFF]/g, " ")
		.replace(/[A-Za-z][A-Za-z0-9_+#@./:-]*/g, " ")
		.replace(/[^\p{Script=Han}0-9，。！？；：、\s“”‘’（）《》【】]/gu, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_TTS_TEXT_LENGTH);
}

export async function getTtsHealth() {
	const workerUrl = getTtsWorkerUrl();
	const modelReady = existsSync(path.join(MODEL_ROOT, "repo"));
	try {
		const res = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(3000) });
		const data = await res.json().catch(() => ({}));
		return {
			ok: res.ok,
			workerUrl,
			modelRoot: MODEL_ROOT,
			modelReady,
			voices: TTS_VOICES.length,
			worker: data
		};
	} catch (error: any) {
		return {
			ok: false,
			workerUrl,
			modelRoot: MODEL_ROOT,
			modelReady,
			voices: TTS_VOICES.length,
			error: error.message || "本地 TTS worker 未启动"
		};
	}
}

export async function synthesizeSpeech(input: {
	text: string;
	voiceId?: string;
	rate?: number;
	volume?: number;
}): Promise<TtsAudioResult> {
	const text = sanitizeTtsText(input.text);
	if (!text) throw new Error("朗读文本为空或不包含可朗读中文内容");
	const voice = assertTtsVoice(input.voiceId);
	const workerUrl = getTtsWorkerUrl();

	const res = await fetch(`${workerUrl}/speak`, {
		method: "POST",
		signal: AbortSignal.timeout(120000),
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			text,
			voiceId: voice.id,
			speaker: voice.speaker,
			stylePrompt: voice.stylePrompt,
			rate: Math.max(0.6, Math.min(1.6, Number(input.rate || 1))),
			volume: Math.max(0, Math.min(1, Number(input.volume ?? 1)))
		})
	});

	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		throw new Error(data.error || data.detail || "本地 TTS 模型未安装或服务未启动");
	}

	return {
		buffer: Buffer.from(await res.arrayBuffer()),
		mime: "audio/wav"
	};
}
