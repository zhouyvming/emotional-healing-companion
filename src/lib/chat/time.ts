import { getToken } from "$lib/client/http";

export function isCurrentTimeQuery(value: string) {
	return /现在|当前|此刻|今天|日期|几点|时间|时区|current\s+(time|date)|what\s+time|today|timezone/i.test(
		value
	);
}

export function isRealtimeInfoQuery(value: string) {
	return /实时|最新|最近|今天|当前|现在|刚刚|新闻|动态|价格|行情|汇率|天气|日程|赛程|政策|发布|更新|current|latest|recent|today|now|news|price|weather|schedule/i.test(
		value
	);
}

function authHeaders() {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	const token = getToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

export function getUserTimeZone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}

export async function fetchRealtimeTimeContext(signal?: AbortSignal) {
	const timeZone = getUserTimeZone();
	const res = await fetch("/api/current-time", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({ timeZone }),
		signal
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(data.error || `实时联网时间查询失败（HTTP ${res.status}）`);
	}
	return {
		timeZone: String(data.timeZone || timeZone),
		datetime: String(data.datetime || ""),
		utcDatetime: data.utcDatetime ? String(data.utcDatetime) : "",
		abbreviation: data.abbreviation ? String(data.abbreviation) : "",
		source: String(data.source || "实时联网时间查询"),
		queriedAt: data.queriedAt ? String(data.queriedAt) : ""
	};
}

export function formatRealtimeTimeContext(data: Awaited<ReturnType<typeof fetchRealtimeTimeContext>>) {
	return [
		"[实时联网时间查询结果]",
		`用户所在时区：${data.timeZone}`,
		`当前时间：${data.datetime}`,
		data.abbreviation ? `时区缩写：${data.abbreviation}` : "",
		data.utcDatetime ? `UTC 时间：${data.utcDatetime}` : "",
		`来源：${data.source}`,
		data.queriedAt ? `查询时间：${data.queriedAt}` : ""
	]
		.filter(Boolean)
		.join("\n");
}
