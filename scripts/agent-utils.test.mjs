import assert from "node:assert/strict";
import test from "node:test";

const {
	parseAgentAction,
	compactToolContext,
	buildAgentDecisionPrompt,
	isWeatherQuery,
	AGENT_MAX_TOOL_CONTEXT_CHARS
} = await import("../src/lib/agent/core.ts");

test("parseAgentAction accepts tool calls", () => {
	assert.deepEqual(parseAgentAction('{"action":"tool_call","tool":"web_search","arguments":{"query":"AI Agent"},"reason":"need current info"}'), {
		action: "tool_call",
		tool: "web_search",
		arguments: { query: "AI Agent" },
		reason: "need current info"
	});
});

test("parseAgentAction accepts fenced final answers", () => {
	assert.deepEqual(parseAgentAction('```json\n{"action":"final_answer","answer":"done"}\n```'), {
		action: "final_answer",
		answer: "done"
	});
});

test("parseAgentAction rejects unknown tools", () => {
	assert.throws(
		() => parseAgentAction('{"action":"tool_call","tool":"shell","arguments":{}}'),
		/Unknown agent tool/
	);
});

test("compactToolContext preserves source text and enforces limit", () => {
	const content = "x".repeat(AGENT_MAX_TOOL_CONTEXT_CHARS + 1000);
	const compacted = compactToolContext([
		{
			toolName: "fetch_url",
			summary: "read page",
			content,
			sources: [{ title: "Example", url: "https://example.com" }]
		}
	]);
	assert.ok(compacted.includes("https://example.com"));
	assert.ok(compacted.length <= AGENT_MAX_TOOL_CONTEXT_CHARS + 100);
});

test("buildAgentDecisionPrompt hides unavailable knowledge/file tools", () => {
	const prompt = buildAgentDecisionPrompt({
		userPrompt: "hello",
		observations: [],
		hasKnowledgeBase: false,
		hasUploadedFiles: false
	});
	assert.ok(prompt.includes("current_time"));
	assert.ok(prompt.includes("web_search"));
	assert.ok(!prompt.includes("query_knowledge_base:"));
	assert.ok(!prompt.includes("uploaded_file_context:"));
});

test("parseAgentAction accepts current_time tool calls", () => {
	assert.deepEqual(parseAgentAction('{"action":"tool_call","tool":"current_time","arguments":{}}'), {
		action: "tool_call",
		tool: "current_time",
		arguments: {},
		reason: undefined
	});
});

test("parseAgentAction accepts weather_lookup tool calls", () => {
	assert.deepEqual(
		parseAgentAction(
			'{"action":"tool_call","tool":"weather_lookup","arguments":{"location":"广西贵港市"}}'
		),
		{
			action: "tool_call",
			tool: "weather_lookup",
			arguments: { location: "广西贵港市" },
			reason: undefined
		}
	);
});

test("buildAgentDecisionPrompt exposes weather lookup tool", () => {
	const prompt = buildAgentDecisionPrompt({
		userPrompt: "今天广西贵港市的天气如何？",
		observations: [],
		hasKnowledgeBase: false,
		hasUploadedFiles: false
	});
	assert.ok(prompt.includes("weather_lookup"));
});

test("isWeatherQuery detects Chinese weather questions", () => {
	assert.equal(isWeatherQuery("今天广西贵港市的天气如何？"), true);
	assert.equal(isWeatherQuery("帮我查一下北京气温"), true);
	assert.equal(isWeatherQuery("总结这段代码"), false);
});
