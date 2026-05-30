import { v4 as uuidv4 } from "uuid";

export const isPrivateUrl = (urlString: string): boolean => {
	try {
		const u = new URL(urlString);
		const BLOCKED = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "169.254.169.254"];
		if (BLOCKED.includes(u.hostname)) return true;
		const blocks = [
			"10.",
			"172.16.", "172.17.", "172.18.", "172.19.", "172.20.",
			"172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
			"172.26.", "172.27.", "172.28.", "172.29.", "172.30.",
			"172.31.", "192.168."
		];
		for (const b of blocks) {
			if (u.hostname.startsWith(b)) return true;
		}
		return false;
	} catch {
		return true;
	}
};

const padDatePart = (value: number) => String(value).padStart(2, "0");

export const localDateString = (date = new Date()) =>
	`${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

export const datetimeNow = (date = new Date()) =>
	`${localDateString(date)}T${padDatePart(date.getHours())}:${padDatePart(
		date.getMinutes()
	)}:${padDatePart(date.getSeconds())}`;

export const splitStream = (splitOn: string) => {
	let buffer = "";
	return new TransformStream({
		transform(chunk, controller) {
			buffer += chunk;
			// 统一处理 \r\n 和 \n 行尾
			buffer = buffer.replace(/\r\n/g, "\n");
			const parts = buffer.split(splitOn);
			parts.slice(0, -1).forEach((part) => controller.enqueue(part));
			buffer = parts[parts.length - 1];
		},
		flush(controller) {
			if (buffer) controller.enqueue(buffer);
		}
	});
};

export const convertMessagesToHistory = (messages: any[]) => {
	let history: any = {
		messages: {},
		currentId: null
	};

	let parentMessageId: string | null = null;
	let messageId: string | null = null;

	for (const message of messages) {
		messageId = uuidv4();

		if (parentMessageId !== null) {
			history.messages[parentMessageId].childrenIds = [
				...history.messages[parentMessageId].childrenIds,
				messageId
			];
		}

		history.messages[messageId] = {
			...message,
			id: messageId,
			parentId: parentMessageId,
			childrenIds: []
		};

		parentMessageId = messageId;
	}

	history.currentId = messageId;
	return history;
};

export const removeMessageBranch = (
	history: { messages: Record<string, any>; currentId: string | null },
	messageId: string
) => {
	const removeChildren = (id: string) => {
		for (const childId of history.messages[id]?.childrenIds ?? []) {
			removeChildren(childId);
			delete history.messages[childId];
		}
	};
	removeChildren(messageId);

	const message = history.messages[messageId];
	if (!message) return;

	if (message.parentId && history.messages[message.parentId]) {
		history.messages[message.parentId].childrenIds = history.messages[
			message.parentId
		].childrenIds.filter((cid: string) => cid !== messageId);
	}

	const currentIdWasDeleted =
		history.currentId === messageId || !history.messages[history.currentId!];
	delete history.messages[messageId];

	if (currentIdWasDeleted) {
		history.currentId = message.parentId;
	}
};

export const safeJsonParse = <T = any>(val: string | object | null | undefined, fallback?: T): T => {
	if (val == null) return fallback as T;
	if (typeof val === "object") return val as unknown as T;
	try {
		return JSON.parse(val) as T;
	} catch {
		return fallback as T;
	}
};
