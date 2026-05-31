import { getToken } from "$lib/client/http";
import type {
	AgentToolCallAction,
	AgentToolContext,
	AgentToolObservation,
	AgentSource
} from "$lib/agent/types";
import { AGENT_TOOL_TIMEOUT_MS } from "$lib/agent/core";
import { datetimeNow, localDateString } from "$lib/utils";
import { findProvider, isLocalOpenAIModel } from "$lib/chat/openai";
import {
	fetchRealtimeTimeContext,
	formatRealtimeTimeContext,
	getUserTimeZone
} from "$lib/chat/time";

function authHeaders() {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	const token = getToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

async function fetchJsonWithTimeout(url: string, body: unknown, signal?: AbortSignal) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), AGENT_TOOL_TIMEOUT_MS);
	const abort = () => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(body),
			signal: controller.signal
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			throw new Error(data.error || data.detail || `HTTP ${res.status}`);
		}
		return data;
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", abort);
	}
}

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const asFreshness = (value: unknown) =>
	value === "week" || value === "month" || value === "day" ? value : "day";

function errorObservation(
	toolName: AgentToolObservation["toolName"],
	message: string
): AgentToolObservation {
	return {
		toolName,
		summary: message,
		content: "",
		sources: [],
		error: message
	};
}

export async function executeAgentTool(
	action: AgentToolCallAction,
	context: AgentToolContext
): Promise<AgentToolObservation> {
	try {
		if (action.tool === "current_time") {
			const isThirdPartyProvider = Boolean(
				context.model && !isLocalOpenAIModel(context.model) && findProvider(context.model)
			);
			if (isThirdPartyProvider) {
				const time = await fetchRealtimeTimeContext(context.signal);
				return {
					toolName: action.tool,
					summary: `已通过实时联网查询获取 ${time.timeZone} 当前时间`,
					content: formatRealtimeTimeContext(time),
					sources: [{ title: time.source, url: time.source.includes(".") ? `https://${time.source}` : undefined }]
				};
			}

			const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
			const now = datetimeNow();
			const date = localDateString();
			return {
				toolName: action.tool,
				summary: `当前本地时间是 ${now}（${timeZone}）`,
				content: `当前本地日期：${date}\n当前本地时间：${now}\n时区：${timeZone}`,
				sources: [{ title: `本机系统时间（${getUserTimeZone()}）` }]
			};
		}

		if (action.tool === "web_search") {
			const query = asString(action.arguments?.query) || context.userPrompt;
			const freshness = asFreshness(action.arguments?.freshness);
			if (query.length < 2) {
				return errorObservation(action.tool, "搜索关键词太短");
			}
			const data = await fetchJsonWithTimeout(
				"/api/web-search",
				{
					query,
					freshness,
					engine: context.settings.searchEngine ?? "cn.bing.com",
					customUrl: context.settings.customSearchUrl ?? ""
				},
				context.signal
			);
			const results = Array.isArray(data.results) ? data.results.slice(0, 5) : [];
			const sources: AgentSource[] = results.map((item: any) => ({
				title: String(item.title || item.url || "搜索结果"),
				url: String(item.url || "")
			}));
			const searchedAt = data.searchedAt ? String(data.searchedAt) : "";
			const engine = data.engine ? String(data.engine) : "联网搜索";
			return {
				toolName: action.tool,
				summary: results.length
					? `实时联网搜索找到 ${results.length} 条结果（范围：${freshness}，引擎：${engine}${
							searchedAt ? `，搜索时间：${searchedAt}` : ""
					  }）`
					: "实时联网搜索没有找到结果",
				content: results
					.map(
						(item: any, index: number) =>
							`${index + 1}. ${item.title}\n来源：${item.source || ""}\n发布时间：${
								item.publishedAt || "未标注"
							}\n摘要：${item.snippet || ""}\n链接：${item.url || ""}`
					)
					.join("\n\n"),
				sources
			};
		}

		if (action.tool === "fetch_url") {
			const url = asString(action.arguments?.url);
			if (!/^https?:\/\//i.test(url)) {
				return errorObservation(action.tool, "需要提供公网 http/https URL");
			}
			const data = await fetchJsonWithTimeout("/api/fetch-url", { url }, context.signal);
			const content = String(data.content || "");
			return {
				toolName: action.tool,
				summary: content ? `已读取链接内容（${Math.min(content.length, 8000)} 字符以内）` : "链接没有可读内容",
				content: content.slice(0, 8000),
				sources: [{ title: url, url }]
			};
		}

		if (action.tool === "query_knowledge_base") {
			if (!context.kbId) {
				return errorObservation(action.tool, "当前未选择知识库");
			}
			const query = asString(action.arguments?.query) || context.userPrompt;
			const data = await fetchJsonWithTimeout(
				`/api/knowledge-bases/${context.kbId}/query`,
				{ query, k: 5 },
				context.signal
			);
			const results = Array.isArray(data.results) ? data.results : [];
			return {
				toolName: action.tool,
				summary: results.length ? `检索到 ${results.length} 个知识库片段` : "知识库没有匹配片段",
				content: results
					.map(
						(item: any, index: number) =>
							`片段 ${index + 1}（相关度 ${Math.round(Number(item.score || 0) * 100)}%）：\n${
								item.content || ""
							}`
					)
					.join("\n\n"),
				sources: results.map((_: any, index: number) => ({ title: `知识库片段 ${index + 1}` }))
			};
		}

		if (action.tool === "uploaded_file_context") {
			const filename = asString(action.arguments?.filename).toLowerCase();
			const docs = (context.uploadedFiles || []).filter(
				(file) => !file.type.startsWith("image/") && file.text
			);
			const selected = filename
				? docs.filter((file) => file.name.toLowerCase().includes(filename))
				: docs;
			if (selected.length === 0) {
				return errorObservation(action.tool, "没有可用的已解析上传文件文本");
			}
			return {
				toolName: action.tool,
				summary: `读取了 ${selected.length} 个上传文件的解析文本`,
				content: selected
					.map((file) => `[文件：${file.name}]\n${(file.text || "").slice(0, 8000)}`)
					.join("\n\n"),
				sources: selected.map((file) => ({ title: file.name, filename: file.name }))
			};
		}

		return errorObservation(action.tool, "未知工具");
	} catch (error: any) {
		const message = error?.name === "AbortError" ? "工具调用超时或已停止" : error.message || "工具调用失败";
		return errorObservation(action.tool, message);
	}
}
