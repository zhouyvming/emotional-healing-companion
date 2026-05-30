export interface TtsPlayback {
	play(): Promise<void>;
	stop(): void;
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
