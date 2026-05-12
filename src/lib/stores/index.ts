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
  [key: string]: any;
}

export const settings = writable<Settings>({});
export const showSettings = writable(false);
