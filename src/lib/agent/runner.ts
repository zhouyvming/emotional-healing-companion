import {
	AGENT_MAX_STEPS,
	buildAgentDecisionPrompt,
	buildAgentFinalPrompt,
	createTraceStep,
	isWeatherQuery,
	parseAgentAction
} from "$lib/agent/core";
import { callAgentModel } from "$lib/agent/model";
import { executeAgentTool } from "$lib/agent/tools";
import { isCurrentTimeQuery, isRealtimeInfoQuery } from "$lib/chat/time";
import type {
	AgentRunContext,
	AgentTraceStep,
	AgentToolCallAction,
	AgentToolObservation
} from "$lib/agent/types";

function updateStep(steps: AgentTraceStep[], id: string, patch: Partial<AgentTraceStep>) {
	return steps.map((step) => (step.id === id ? { ...step, ...patch } : step));
}

function appendStep(
	steps: AgentTraceStep[],
	step: Omit<AgentTraceStep, "id" | "createdAt">,
	onTraceUpdate: (steps: AgentTraceStep[]) => void
) {
	const next = [...steps, createTraceStep(step)];
	onTraceUpdate(next);
	return next;
}

async function decideAction(
	context: AgentRunContext,
	observations: AgentToolObservation[],
	parseError?: string
) {
	const prompt = buildAgentDecisionPrompt({
		userPrompt: context.userPrompt,
		observations,
		hasKnowledgeBase: Boolean(context.kbId),
		hasUploadedFiles: Boolean(
			context.uploadedFiles?.some((file) => !file.type.startsWith("image/") && file.text)
		),
		parseError
	});
	const raw = await callAgentModel({
		model: context.model,
		settings: context.settings,
		json: true,
		signal: context.signal,
		messages: [
			{
				role: "system",
				content:
					"You are a tool-using agent. You must return one valid JSON object and no extra text."
			},
			...context.messages,
			{ role: "user", content: prompt }
		]
	});
	return parseAgentAction(raw);
}

function actionTitle(action: AgentToolCallAction) {
	if (action.tool === "current_time") return "获取当前时间";
	if (action.tool === "weather_lookup") return "查询天气";
	if (action.tool === "web_search") return "联网搜索";
	if (action.tool === "fetch_url") return "读取网页";
	if (action.tool === "query_knowledge_base") return "查询知识库";
	if (action.tool === "uploaded_file_context") return "读取上传文件";
	return "调用工具";
}

async function runToolStep(
	context: AgentRunContext,
	steps: AgentTraceStep[],
	observations: AgentToolObservation[],
	action: AgentToolCallAction,
	reason: string
) {
	const toolStep = createTraceStep({
		type: "tool",
		status: "running",
		title: actionTitle(action),
		toolName: action.tool,
		summary: reason
	});
	steps = [...steps, toolStep];
	context.onTraceUpdate(steps);

	const observation = await executeAgentTool(action, context);
	observations.push(observation);
	steps = updateStep(steps, toolStep.id, {
		status: observation.error ? "error" : "done",
		summary: observation.summary,
		sources: observation.sources
	});
	context.onTraceUpdate(steps);
	return { steps, observation };
}

export async function runAgent(context: AgentRunContext) {
	let steps: AgentTraceStep[] = [];
	const observations: AgentToolObservation[] = [];

	steps = appendStep(
		steps,
		{
			type: "plan",
			status: "done",
			title: "制定信息整理计划",
			summary: "Agent 将按需调用搜索、网页、知识库或上传文件工具，并基于来源汇总回答。"
		},
		context.onTraceUpdate
	);

	if (context.kbId) {
		const result = await runToolStep(
			context,
			steps,
			observations,
			{
				action: "tool_call",
				tool: "query_knowledge_base",
				arguments: { query: context.userPrompt }
			},
			"当前会话已选择知识库，Agent 先从知识库检索相关信息。"
		);
		steps = result.steps;
	}

	if (isWeatherQuery(context.userPrompt)) {
		const result = await runToolStep(
			context,
			steps,
			observations,
			{
				action: "tool_call",
				tool: "weather_lookup",
				arguments: { location: context.userPrompt, date: "today" }
			},
			"用户问题涉及天气，Agent 先执行专用天气查询。"
		);
		steps = result.steps;
		if (result.observation.error) {
			const fallback = await runToolStep(
				context,
				steps,
				observations,
				{
					action: "tool_call",
					tool: "web_search",
					arguments: { query: context.userPrompt, freshness: "day" }
				},
				"专用天气查询失败，改用实时联网搜索补充核验。"
			);
			steps = fallback.steps;
		}
	} else if (isCurrentTimeQuery(context.userPrompt)) {
		const result = await runToolStep(
			context,
			steps,
			observations,
			{ action: "tool_call", tool: "current_time", arguments: {} },
			"用户问题涉及当前时间，Agent 先执行实时联网时间查询。"
		);
		steps = result.steps;
		if (result.observation.error) {
			const fallback = await runToolStep(
				context,
				steps,
				observations,
				{
					action: "tool_call",
					tool: "web_search",
					arguments: { query: context.userPrompt, freshness: "day" }
				},
				"实时联网时间查询失败，改用实时联网搜索补充核验。"
			);
			steps = fallback.steps;
		}
	} else if (isRealtimeInfoQuery(context.userPrompt)) {
		const result = await runToolStep(
			context,
			steps,
			observations,
			{
				action: "tool_call",
				tool: "web_search",
				arguments: { query: context.userPrompt, freshness: "day" }
			},
			"用户问题涉及实时或最新信息，Agent 先执行实时联网搜索。"
		);
		steps = result.steps;
	}

	for (let i = 0; i < AGENT_MAX_STEPS; i++) {
		if (context.shouldStop()) throw new DOMException("Agent stopped", "AbortError");

		let action;
		try {
			action = await decideAction(context, observations);
		} catch (error: any) {
			try {
				action = await decideAction(context, observations, error.message || "Invalid JSON");
			} catch (secondError: any) {
				steps = appendStep(
					steps,
					{
						type: "observation",
						status: "error",
						title: "工具决策解析失败",
						summary: secondError.message || "模型没有返回有效工具 JSON，转入最终汇总。"
					},
					context.onTraceUpdate
				);
				break;
			}
		}

		if (action.action === "final_answer") {
			steps = appendStep(
				steps,
				{
					type: "final",
					status: "done",
					title: "完成 Agent 汇总",
					summary: "模型判断已有信息足够回答。"
				},
				context.onTraceUpdate
			);
			return { answer: action.answer, trace: steps, observations };
		}

		const result = await runToolStep(
			context,
			steps,
			observations,
			action,
			action.reason || "Agent 正在调用只读信息工具。"
		);
		steps = result.steps;
	}

	const finalPrompt = buildAgentFinalPrompt(context.userPrompt, observations);
	const answer = await callAgentModel({
		model: context.model,
		settings: context.settings,
		signal: context.signal,
		messages: [
			{
				role: "system",
				content: "你是信息整理型 Agent，请基于工具结果输出可靠、清晰、带来源的 Markdown 答案。"
			},
			...context.messages,
			{ role: "user", content: finalPrompt }
		]
	});

	steps = appendStep(
		steps,
		{
			type: "final",
			status: "done",
			title: "完成 Agent 汇总",
			summary: observations.length
				? `基于 ${observations.length} 次工具观察生成最终回答。`
				: "未获得额外工具信息，基于当前上下文生成回答。"
		},
		context.onTraceUpdate
	);

	return { answer, trace: steps, observations };
}
