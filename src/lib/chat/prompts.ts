import { datetimeNow } from "$lib/utils";

export const EMOTION_GUIDANCE = `[内部情绪分析指引]
请根据用户的最新消息感知其情绪状态（如开心、焦虑、悲伤、愤怒、平静等），并在回复中以温暖共情的方式适当回应。
不要直白地说"我感知到你很XX"，而是自然地用匹配用户情绪的语调来回应。
如果用户情绪低落，优先倾听和共情，不要急于给建议。`;

export const MARKDOWN_INSTRUCTION = "请使用Markdown格式回复，适当使用标题、列表、加粗、代码块等格式让回复更清晰易读。";

export const DEFAULT_SYSTEM_PROMPT = "你是一个温暖共情的AI助手。";

export const buildCurrentTimeInstruction = () =>
	`当前本地时间：${datetimeNow()}。如果用户询问当前时间、今天、日期或相对日期，请优先使用这个时间回答，不要声称无法获取当前时间。`;

/**
 * 构建系统提示词（合并用户自定义 + 情绪感知 + Markdown 指令）
 */
export function buildSystemPrompt(
	userSystemPrompt?: string,
	emotionSensing?: boolean,
	includeCurrentTimeInstruction = true
): string {
	let prompt = userSystemPrompt || DEFAULT_SYSTEM_PROMPT;
	if (emotionSensing !== false) {
		prompt = `${prompt}\n\n${EMOTION_GUIDANCE}`;
	}
	return `${prompt}\n\n${
		includeCurrentTimeInstruction ? `${buildCurrentTimeInstruction()}\n\n` : ""
	}${MARKDOWN_INSTRUCTION}`;
}

/**
 * 上下文压缩：超出 num_ctx 时截断最早的消息
 * 返回截断后的消息列表（不修改原数组）
 */
export function compressContext<T extends { content: string | any }>(
	messages: T[],
	systemPromptChars: number,
	numCtx: number,
	getContentLength: (m: T) => number = (m) =>
		typeof m.content === "string" ? m.content.length : 0
): { messages: T[]; truncated: number } {
	const contextLimit = numCtx ?? 200000;
	let totalChars = messages.reduce((sum, m) => sum + getContentLength(m), 0) + systemPromptChars;
	const estimatedTokens = Math.ceil(totalChars / 2);
	if (estimatedTokens <= contextLimit) return { messages, truncated: 0 };

	let keepFrom = 0;
	let runningChars = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		runningChars += getContentLength(messages[i]);
		if (Math.ceil(runningChars / 2) > contextLimit * 0.85) {
			keepFrom = i + 1;
			break;
		}
	}
	const truncated = messages.length - keepFrom;
	if (truncated > 0 && keepFrom < messages.length) {
		return { messages: messages.slice(keepFrom), truncated };
	}
	return { messages, truncated: 0 };
}
