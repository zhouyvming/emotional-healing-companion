import { writable } from "svelte/store";

// Backend
export const info = writable({});

// Frontend
export const db = writable(undefined);
export const chatId = writable("");
export const chats = writable([]);
export const models = writable([]);
export const user = writable<{ id: number; username: string; email: string; avatar?: string; system_avatar?: string } | null>(null);

interface Settings {
  API_BASE_URL?: string;
  theme?: 'dark' | 'light' | 'system';
  fontSize?: 'small' | 'normal' | 'large';
  proactiveGreeting?: boolean;
  privacyMode?: boolean;
  [key: string]: any;
}

export const settings = writable<Settings>({});
export const showSettings = writable(false);

// 情绪追踪数据
export const moodHistory = writable<{ date: string; mood: string; score: number }[]>([]);
