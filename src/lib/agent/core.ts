import type {
	AgentAction,
	AgentToolName,
	AgentToolObservation,
	AgentTraceStep
} from "./types";

export const AGENT_MAX_STEPS = 6;
export const AGENT_TOOL_TIMEOUT_MS = 20000;
export const AGENT_MAX_TOOL_CONTEXT_CHARS = 20000;

export const AGENT_TOOLS: {
	name: AgentToolName;
	description: string;
	parameters: Record<string, string>;
}[] = [
	{
		name: "current_time",
		description: "Get the user's current local date, time, and timezone.",
		parameters: {}
	},
	{
		name: "web_search",
		description:
			"Run a real-time public web search with recent-first ranking and source URLs. Use for current facts, news, prices, schedules, or claims that need verification.",
		parameters: {
			query: "Search query, 2 or more characters.",
			freshness: 'Optional recency window: "day", "week", or "month". Defaults to "day" for current information.'
		}
	},
	{
		name: "fetch_url",
		description: "Fetch readable text from a public http/https URL.",
		parameters: { url: "Public URL to fetch." }
	},
	{
		name: "query_knowledge_base",
		description: "Search the selected knowledge base for relevant snippets.",
		parameters: { query: "Question or search query for the knowledge base." }
	},
	{
		name: "uploaded_file_context",
		description: "Read parsed text from files uploaded with this user message.",
		parameters: { filename: "Optional filename to focus on." }
	}
];

const TOOL_NAMES = new Set(AGENT_TOOLS.map((tool) => tool.name));

export function isAgentToolName(value: unknown): value is AgentToolName {
	return typeof value === "string" && TOOL_NAMES.has(value as AgentToolName);
}

function stripCodeFence(value: string) {
	const trimmed = value.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return fenced ? fenced[1].trim() : trimmed;
}

function extractJsonObject(value: string) {
	const stripped = stripCodeFence(value);
	const first = stripped.indexOf("{");
	const last = stripped.lastIndexOf("}");
	if (first === -1 || last === -1 || last <= first) return stripped;
	return stripped.slice(first, last + 1);
}

export function parseAgentAction(raw: string): AgentAction {
	const parsed = JSON.parse(extractJsonObject(raw));
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Agent action must be a JSON object");
	}

	if (parsed.action === "final_answer") {
		if (typeof parsed.answer !== "string" || !parsed.answer.trim()) {
			throw new Error("final_answer requires a non-empty answer");
		}
		return { action: "final_answer", answer: parsed.answer.trim() };
	}

	if (parsed.action === "tool_call") {
		if (!isAgentToolName(parsed.tool)) {
			throw new Error(`Unknown agent tool: ${String(parsed.tool ?? "")}`);
		}
		const args =
			parsed.arguments && typeof parsed.arguments === "object" && !Array.isArray(parsed.arguments)
				? (parsed.arguments as Record<string, unknown>)
				: {};
		return {
			action: "tool_call",
			tool: parsed.tool,
			arguments: args,
			reason: typeof parsed.reason === "string" ? parsed.reason.trim() : undefined
		};
	}

	throw new Error("Agent action must be tool_call or final_answer");
}

export function compactToolContext(
	observations: AgentToolObservation[],
	limit = AGENT_MAX_TOOL_CONTEXT_CHARS
) {
	const chunks = observations.map((observation, index) => {
		const sourceText = observation.sources
			.map((source) => source.url || source.filename || source.title)
			.filter(Boolean)
			.join(", ");
		return [
			`[${index + 1}] tool=${observation.toolName}`,
			`summary=${observation.summary}`,
			sourceText ? `sources=${sourceText}` : "",
			`content=${observation.content}`
		]
			.filter(Boolean)
			.join("\n");
	});

	let remaining = limit;
	const selected: string[] = [];
	for (const chunk of chunks) {
		if (remaining <= 0) break;
		selected.push(chunk.slice(0, remaining));
		remaining -= chunk.length;
	}
	return selected.join("\n\n---\n\n");
}

export function buildAgentDecisionPrompt(options: {
	userPrompt: string;
	observations: AgentToolObservation[];
	hasKnowledgeBase: boolean;
	hasUploadedFiles: boolean;
	parseError?: string;
}) {
	const availableTools = AGENT_TOOLS.filter((tool) => {
		if (tool.name === "query_knowledge_base") return options.hasKnowledgeBase;
		if (tool.name === "uploaded_file_context") return options.hasUploadedFiles;
		return true;
	});
	const tools = availableTools
		.map(
			(tool) =>
				`- ${tool.name}: ${tool.description} Parameters: ${JSON.stringify(tool.parameters)}`
		)
		.join("\n");
	const observations = options.observations.length
		? compactToolContext(options.observations, 8000)
		: "No tool observations yet.";
	const parseHint = options.parseError
		? `\nPrevious JSON parse/validation error: ${options.parseError}\nReturn valid JSON only.`
		: "";

	return `You are an information-gathering agent inside a Chinese emotional support chat app.
Use tools only when they will materially improve factuality, source coverage, current-time accuracy, or use the selected knowledge/file context.
Do not invent sources. Do not call unavailable tools. Prefer finishing when enough information is available.
If a knowledge base is available, query_knowledge_base before public web tools. Use web_search only when the knowledge base has no relevant information or is insufficient for the user's question.
If the user asks for current time/date/today/relative dates and the knowledge base does not answer it, call current_time before answering.
For recent or time-sensitive public information, call web_search with the narrowest useful freshness window and prefer sources that include a published time.
If a tool result is missing, stale, contradictory, or too weak to answer reliably, call another read-only tool or refine the query before producing the final answer.

Available tools:
${tools}

User request:
${options.userPrompt}

Tool observations:
${observations}

Return exactly one JSON object, with no Markdown:
Tool call:
{"action":"tool_call","tool":"web_search","arguments":{"query":"...","freshness":"day"},"reason":"..."}
Final answer:
{"action":"final_answer","answer":"..."}
${parseHint}`;
}

export function buildAgentFinalPrompt(userPrompt: string, observations: AgentToolObservation[]) {
	const context = compactToolContext(observations);
	return `请基于用户问题和已获得的工具信息，输出整理好的 Markdown 答案。
要求：
- 先给出直接结论。
- 再列出关键依据。
- 最后列出来源；如果来源不足，请明确说明。
- 不要编造工具结果中没有的信息。

用户问题：
${userPrompt}

工具信息：
${context || "没有可用工具信息，请基于已知信息回答并说明信息不足。"}`;
}

export function createTraceStep(input: Omit<AgentTraceStep, "id" | "createdAt">): AgentTraceStep {
	return {
		...input,
		id:
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
		createdAt: new Date().toISOString()
	};
}
