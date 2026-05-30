export interface TtsPlayback {
	play(): Promise<void>;
	stop(): void;
}

export async function createTtsPlayback(
	blob: Blob,
	options: { volume?: number; onEnded?: () => void } = {}
): Promise<TtsPlayback> {
	const audioBlob = blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: "audio/wav" });
	return createAudioContextPlayback(audioBlob, options);
}

export async function createBrowserTtsPlayback(
	text: string,
	options: { rate?: number; volume?: number; onEnded?: () => void } = {}
): Promise<TtsPlayback> {
	if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
		throw new Error("当前浏览器不支持语音朗读");
	}

	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = "zh-CN";
	utterance.rate = Math.max(0.6, Math.min(1.6, Number(options.rate || 1)));
	utterance.volume = clampVolume(options.volume);
	utterance.voice = await pickChineseVoice();
	if (utterance.voice?.lang) utterance.lang = utterance.voice.lang;

	let stopped = false;
	utterance.onend = () => {
		if (!stopped) options.onEnded?.();
	};
	utterance.onerror = () => {
		if (!stopped) options.onEnded?.();
	};

	return {
		async play() {
			window.speechSynthesis.cancel();
			window.speechSynthesis.speak(utterance);
		},
		stop() {
			if (stopped) return;
			stopped = true;
			window.speechSynthesis.cancel();
		}
	};
}

function createHtmlAudioPlayback(blob: Blob, options: { volume?: number; onEnded?: () => void }): TtsPlayback {
	const url = URL.createObjectURL(blob);
	const audio = new Audio();
	let stopped = false;
	const cleanup = () => {
		URL.revokeObjectURL(url);
	};

	audio.preload = "auto";
	audio.src = url;
	audio.volume = clampVolume(options.volume);
	audio.onended = () => {
		cleanup();
		options.onEnded?.();
	};

	return {
		async play() {
			try {
				await audio.play();
			} catch (error) {
				cleanup();
				throw error;
			}
		},
		stop() {
			if (stopped) return;
			stopped = true;
			audio.pause();
			audio.src = "";
			cleanup();
		}
	};
}

async function createAudioContextPlayback(
	blob: Blob,
	options: { volume?: number; onEnded?: () => void }
): Promise<TtsPlayback> {
	const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
	if (!AudioContextCtor) throw new Error("当前浏览器不支持音频播放");

	const ctx = new AudioContextCtor();
	const arrayBuffer = await blob.arrayBuffer();
	const audioBuffer = await decodeWav(ctx, arrayBuffer);
	const source = ctx.createBufferSource();
	const gain = ctx.createGain();
	let stopped = false;

	source.buffer = audioBuffer;
	gain.gain.value = clampVolume(options.volume);
	source.connect(gain);
	gain.connect(ctx.destination);
	source.onended = () => {
		if (!stopped) options.onEnded?.();
		ctx.close().catch(() => {});
	};

	return {
		async play() {
			if (ctx.state === "suspended") await ctx.resume();
			source.start();
		},
		stop() {
			if (stopped) return;
			stopped = true;
			try {
				source.stop();
			} catch {}
			ctx.close().catch(() => {});
		}
	};
}

async function decodeWav(ctx: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
	try {
		return await ctx.decodeAudioData(arrayBuffer.slice(0));
	} catch {
		return decodePcm16Wav(ctx, arrayBuffer);
	}
}

function decodePcm16Wav(ctx: AudioContext, arrayBuffer: ArrayBuffer): AudioBuffer {
	const view = new DataView(arrayBuffer);
	if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
		throw new Error("TTS 返回的音频不是有效 WAV");
	}

	let offset = 12;
	let channels = 0;
	let sampleRate = 0;
	let bitsPerSample = 0;
	let dataOffset = 0;
	let dataSize = 0;

	while (offset + 8 <= view.byteLength) {
		const id = readAscii(view, offset, 4);
		const size = view.getUint32(offset + 4, true);
		const body = offset + 8;
		if (id === "fmt ") {
			const format = view.getUint16(body, true);
			channels = view.getUint16(body + 2, true);
			sampleRate = view.getUint32(body + 4, true);
			bitsPerSample = view.getUint16(body + 14, true);
			if (format !== 1 || bitsPerSample !== 16) {
				throw new Error("当前只支持 PCM16 WAV TTS 音频");
			}
		} else if (id === "data") {
			dataOffset = body;
			dataSize = size;
			break;
		}
		offset = body + size + (size % 2);
	}

	if (!channels || !sampleRate || !dataOffset || !dataSize) {
		throw new Error("TTS WAV 数据不完整");
	}

	const frameCount = Math.floor(dataSize / 2 / channels);
	const audioBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
	for (let ch = 0; ch < channels; ch++) {
		const channel = audioBuffer.getChannelData(ch);
		for (let i = 0; i < frameCount; i++) {
			const sampleOffset = dataOffset + (i * channels + ch) * 2;
			channel[i] = view.getInt16(sampleOffset, true) / 32768;
		}
	}
	return audioBuffer;
}

function readAscii(view: DataView, offset: number, length: number) {
	let value = "";
	for (let i = 0; i < length; i++) value += String.fromCharCode(view.getUint8(offset + i));
	return value;
}

function clampVolume(value = 1) {
	return Math.max(0, Math.min(1, Number(value)));
}

async function pickChineseVoice(): Promise<SpeechSynthesisVoice | null> {
	const voices = await getBrowserVoices();
	return (
		voices.find((voice) => voice.lang.toLowerCase().startsWith("zh")) ??
		voices.find((voice) => /chinese|mandarin|cantonese|中文|普通话/i.test(voice.name)) ??
		null
	);
}

async function getBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
	const voices = window.speechSynthesis.getVoices();
	if (voices.length > 0) return voices;

	return await new Promise((resolve) => {
		const timeout = window.setTimeout(() => {
			window.speechSynthesis.onvoiceschanged = null;
			resolve(window.speechSynthesis.getVoices());
		}, 800);
		window.speechSynthesis.onvoiceschanged = () => {
			window.clearTimeout(timeout);
			window.speechSynthesis.onvoiceschanged = null;
			resolve(window.speechSynthesis.getVoices());
		};
	});
}
