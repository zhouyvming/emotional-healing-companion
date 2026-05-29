import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "./db";

const require = createRequire(import.meta.url);

export interface TtsVoicePreset {
	id: string;
	name: string;
	displayName: string;
	engine: "sherpa-onnx";
	locale: string;
	gender: string;
	quality: string;
	license: string;
	sourceUrl: string;
	sizeBytes: number;
	tags: string[];
	notes: string;
}

export interface TtsVoiceSummary extends TtsVoicePreset {
	sampleMime: string;
	createdAt: string;
	updatedAt: string;
}

export interface TtsAudioResult {
	buffer: Buffer;
	mime: "audio/mpeg";
}

const SHERPA_ENGINE = "sherpa-onnx" as const;
const DEFAULT_VOICE_ID = "sherpa-onnx-zh-baker-female";
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS ?? 120000);

const MODEL_ROOT = process.env.SHERPA_ONNX_TTS_MODEL_DIR || path.join(process.cwd(), "tools", "sherpa-onnx");
const MATCHA_DIR = path.join(MODEL_ROOT, "matcha-icefall-zh-baker");
const VOCODER_PATH = path.join(MODEL_ROOT, "vocos-22khz-univ.onnx");

export const TTS_PRESETS: TtsVoicePreset[] = [
	{
		id: DEFAULT_VOICE_ID,
		name: "matcha-icefall-zh-baker",
		displayName: "中文女声（sherpa-onnx）",
		engine: SHERPA_ENGINE,
		locale: "zh_CN",
		gender: "female",
		quality: "offline",
		license: "Apache-2.0 / model license follows upstream",
		sourceUrl: "https://github.com/k2-fsa/sherpa-onnx",
		sizeBytes: 129_508_635,
		tags: ["中文", "女声", "离线", "sherpa-onnx"],
		notes: "内置离线中文 TTS；模型文件位于 tools/sherpa-onnx，不写入 MySQL。"
	}
];

let ttsInstance: any | null = null;

const defaultVoiceSummary = (): TtsVoiceSummary => ({
	...TTS_PRESETS[0],
	sampleMime: "audio/mpeg",
	createdAt: "",
	updatedAt: ""
});

export async function listVoices(username: string): Promise<TtsVoiceSummary[]> {
	await setDefaultTtsVoice(username, DEFAULT_VOICE_ID);
	return [defaultVoiceSummary()];
}

export async function ensureBuiltInDefaultVoice(username: string): Promise<TtsVoiceSummary> {
	await setDefaultTtsVoice(username, DEFAULT_VOICE_ID);
	return defaultVoiceSummary();
}

export async function getSample() {
	return null;
}

export async function importPresetVoice(username: string): Promise<TtsVoiceSummary> {
	return ensureBuiltInDefaultVoice(username);
}

export async function importUploadedVoice(): Promise<TtsVoiceSummary> {
	throw new Error("当前使用内置 sherpa-onnx 离线音色，不支持手动导入。");
}

async function setDefaultTtsVoice(username: string, voiceId: string) {
	const [rows] = await pool.execute<(RowDataPacket & { settings: string | null })[]>(
		"SELECT settings FROM users WHERE username = ? LIMIT 1",
		[username]
	);
	if (!rows.length) return;

	let current: Record<string, any> = {};
	try {
		current = rows[0].settings ? JSON.parse(rows[0].settings) : {};
	} catch {
		current = {};
	}

	const updated = {
		...current,
		ttsEnabled: true,
		ttsEngine: SHERPA_ENGINE,
		ttsVoiceId: voiceId,
		ttsRate: current.ttsRate ?? 1,
		ttsVolume: current.ttsVolume ?? 1
	};
	await pool.execute("UPDATE users SET settings = ? WHERE username = ?", [
		JSON.stringify(updated),
		username
	]);
}

function assertModelFiles() {
	const required = [
		path.join(MATCHA_DIR, "model-steps-3.onnx"),
		path.join(MATCHA_DIR, "lexicon.txt"),
		path.join(MATCHA_DIR, "tokens.txt"),
		path.join(MATCHA_DIR, "phone.fst"),
		path.join(MATCHA_DIR, "date.fst"),
		path.join(MATCHA_DIR, "number.fst"),
		VOCODER_PATH
	];
	const missing = required.filter((file) => !existsSync(file));
	if (missing.length) {
		throw new Error(`未找到 sherpa-onnx 离线 TTS 模型文件：${missing.join("；")}`);
	}
}

function getTtsInstance() {
	if (ttsInstance) return ttsInstance;
	assertModelFiles();

	const sherpaOnnx = require("sherpa-onnx");
	ttsInstance = sherpaOnnx.createOfflineTts({
		offlineTtsModelConfig: {
			offlineTtsMatchaModelConfig: {
				acousticModel: path.join(MATCHA_DIR, "model-steps-3.onnx"),
				vocoder: VOCODER_PATH,
				lexicon: path.join(MATCHA_DIR, "lexicon.txt"),
				tokens: path.join(MATCHA_DIR, "tokens.txt"),
				noiseScale: 0.667,
				lengthScale: 1.0
			},
			numThreads: 1,
			debug: 0,
			provider: "cpu"
		},
		maxNumSentences: 1,
		silenceScale: 0.2,
		ruleFsts: [
			path.join(MATCHA_DIR, "phone.fst"),
			path.join(MATCHA_DIR, "date.fst"),
			path.join(MATCHA_DIR, "number.fst")
		].join(",")
	});
	return ttsInstance;
}

function sanitizeTtsText(raw: string): string {
	return raw
		.replace(/[\uD800-\uDFFF]/g, "")
		.replace(/[^\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u3400-\u4dbfa-zA-Z0-9\s\u3002\uff0c\uff01\uff1f\uff1b\uff1a\u3001\u201c\u201d\u2018\u2019\uff08\uff09\u2014\u2026\u300a\u300b\u002d\u002e\u002c\u0021\u003f\u003b\u003a\u0027\u0028\u0029\u000a]/g, "")
		.trim()
		.slice(0, 500);
}

export async function synthesizeSpeech(
	username: string,
	input: { voiceId?: string; text: string; rate?: number; volume?: number }
): Promise<TtsAudioResult> {
	await ensureBuiltInDefaultVoice(username);
	const text = sanitizeTtsText(input.text);
	if (!text) {
		throw new Error("朗读文本为空");
	}
	if (input.voiceId && input.voiceId !== DEFAULT_VOICE_ID) {
		throw new Error("当前仅支持内置 sherpa-onnx 中文离线音色。");
	}

	const wavPath = path.join(os.tmpdir(), `tts-${crypto.randomUUID()}.wav`);
	try {
		const tts = getTtsInstance();
		const audio = tts.generateWithConfig(text, {
			sid: 0,
			speed: Math.max(0.6, Math.min(1.6, Number(input.rate || 1))),
			silenceScale: 0.2
		});
		tts.save(wavPath, audio);
		const mp3 = await convertWavToMp3(wavPath, Number(input.volume || 1));
		return { buffer: mp3, mime: "audio/mpeg" };
	} finally {
		fs.unlink(wavPath).catch(() => {});
	}
}

function findFfmpeg(): string {
	if (process.env.FFMPEG_BIN && existsSync(process.env.FFMPEG_BIN)) {
		return process.env.FFMPEG_BIN;
	}
	const bundled = path.join(process.cwd(), "tools", "ffmpeg", "ffmpeg.exe");
	if (existsSync(bundled)) return bundled;

	const { execSync } = require("node:child_process");
	try {
		const which = process.platform === "win32" ? "where ffmpeg 2>NUL" : "which ffmpeg 2>/dev/null";
		const stdout = execSync(which, { encoding: "utf8", timeout: 5000, shell: true });
		const found = stdout.split(/\r?\n/).map(function(l) { return l.trim(); }).find(function(l) { return existsSync(l); });
		if (found) return found;
	} catch (_) {}
	throw new Error("未找到 ffmpeg，无法输出 MP3。请将 ffmpeg 加入 PATH 或设置 FFMPEG_BIN 环境变量。");
}

async function convertWavToMp3(wavPath: string, volume: number): Promise<Buffer> {
	const ffmpegBin = findFfmpeg();
	const mp3Path = path.join(os.tmpdir(), `tts-${crypto.randomUUID()}.mp3`);
	const volumeArg = Math.max(0, Math.min(1, volume));

	await new Promise<void>((resolve, reject) => {
		const child = spawn(
			ffmpegBin,
			[
				"-y",
				"-loglevel",
				"error",
				"-i",
				wavPath,
				"-filter:a",
				`volume=${volumeArg}`,
				"-codec:a",
				"libmp3lame",
				"-b:a",
				"96k",
				mp3Path
			],
			{ windowsHide: true }
		);
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("MP3 转码超时"));
		}, TTS_TIMEOUT_MS);

		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(stderr.trim() || `ffmpeg 退出码 ${code}`));
		});
	});

	try {
		return await fs.readFile(mp3Path);
	} finally {
		fs.unlink(mp3Path).catch(() => {});
	}
}
