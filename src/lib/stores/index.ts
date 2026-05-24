import { writable } from "svelte/store";

// Backend
export const info = writable({});

// Frontend
export const db = writable(undefined);
export const chatId = writable("");
export const chats = writable([]);
export const models = writable([]);
export const user = writable<{
	id: number;
	username: string;
	email: string;
	avatar?: string;
	system_avatar?: string;
} | null>(null);

interface Settings {
	API_BASE_URL?: string;
	theme?: "dark" | "light" | "system";
	fontSize?: "small" | "normal" | "large";
	proactiveGreeting?: boolean;
	privacyMode?: boolean;
	systemPrompt?: string;
	system?: string;
	models?: string[];
	options?: Record<string, any>;
	webSearch?: boolean;
	searchEngine?: string;
	customSearchUrl?: string;
	emotionSensing?: boolean;
	titleAutoGenerate?: boolean;
	responseAutoCopy?: boolean;
	requestFormat?: string;
	seed?: number;
	temperature?: number;
	repeat_penalty?: number;
	top_k?: number;
	top_p?: number;
	num_ctx?: number;
	stop?: string;
}

export const settings = writable<Settings>({});
export const showSettings = writable(false);

// 情绪追踪数据
export const moodHistory = writable<{ date: string; mood: string; score: number }[]>([]);
