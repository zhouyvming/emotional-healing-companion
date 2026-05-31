export interface UploadedFile {
	name: string;
	type: string;
	data: string;
	text?: string;
	parseStatus?: "pending" | "done" | "error";
	parseError?: string;
}

export interface AgentTraceStep {
	id: string;
	type: "plan" | "tool" | "observation" | "final";
	status: "pending" | "running" | "done" | "error";
	title: string;
	summary?: string;
	toolName?:
		| "current_time"
		| "weather_lookup"
		| "web_search"
		| "fetch_url"
		| "query_knowledge_base"
		| "uploaded_file_context";
	sources?: { title: string; url?: string; filename?: string }[];
	createdAt: string;
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
	agentTrace?: AgentTraceStep[];
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
	localModelProvider?: "ollama" | "openai-compatible";
	localOpenAIBaseUrl?: string;
	localOpenAIApiKey?: string;
	localOpenAIName?: string;
	[key: string]: unknown;
}
