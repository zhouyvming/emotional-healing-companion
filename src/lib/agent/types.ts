import type { ChatSettings, UploadedFile } from "$lib/types/chat";

export type AgentToolName =
	| "current_time"
	| "web_search"
	| "fetch_url"
	| "query_knowledge_base"
	| "uploaded_file_context";

export interface AgentSource {
	title: string;
	url?: string;
	filename?: string;
}

export interface AgentTraceStep {
	id: string;
	type: "plan" | "tool" | "observation" | "final";
	status: "pending" | "running" | "done" | "error";
	title: string;
	summary?: string;
	toolName?: AgentToolName;
	sources?: AgentSource[];
	createdAt: string;
}

export interface AgentToolCallAction {
	action: "tool_call";
	tool: AgentToolName;
	arguments?: Record<string, unknown>;
	reason?: string;
}

export interface AgentFinalAnswerAction {
	action: "final_answer";
	answer: string;
}

export type AgentAction = AgentToolCallAction | AgentFinalAnswerAction;

export interface AgentToolObservation {
	toolName: AgentToolName;
	summary: string;
	content: string;
	sources: AgentSource[];
	error?: string;
}

export interface AgentToolContext {
	model?: string;
	userPrompt: string;
	settings: ChatSettings;
	kbId?: string;
	uploadedFiles?: UploadedFile[];
	signal?: AbortSignal;
}

export interface AgentRunContext extends AgentToolContext {
	model: string;
	messages: { role: string; content: string }[];
	onTraceUpdate: (steps: AgentTraceStep[]) => void;
	shouldStop: () => boolean;
}
