export interface UploadedFile {
	name: string;
	type: string;
	data: string;
	text?: string;
	parseStatus?: "pending" | "done" | "error";
	parseError?: string;
}

export interface ChatMessage {
	id: string;
	parentId: string | null;
	childrenIds: string[];
	role: "user" | "assistant" | "system";
	content: string;
	images?: string[];
	files?: UploadedFile[];
	model?: string;
	timestamp?: string;
	done?: boolean;
	error?: boolean;
	context?: unknown;
	info?: Record<string, unknown>;
}

export interface ChatHistory {
	messages: Record<string, ChatMessage>;
	currentId: string | null;
}

export interface ChatSettings {
	systemPrompt?: string;
	emotionSensing?: boolean;
	num_ctx?: number;
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
	seed?: number;
	stop?: string;
	privacyMode?: boolean;
	titleAutoGenerate?: boolean;
	[key: string]: unknown;
}
