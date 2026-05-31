import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";

const TIMEZONE_RE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){1,3}$/;

async function fetchJson(url: string, timeoutMs = 8000) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			headers: { Accept: "application/json" },
			signal: controller.signal,
			cache: "no-store"
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function POST({ request }: { request: Request }) {
	try {
		requireAuth(request);
		const { timeZone } = await request.json().catch(() => ({}));
		const selectedTimeZone =
			typeof timeZone === "string" && TIMEZONE_RE.test(timeZone) ? timeZone : "Asia/Shanghai";

		const worldTime = await fetchJson(
			`https://worldtimeapi.org/api/timezone/${selectedTimeZone}`
		);
		if (worldTime?.datetime) {
			return json({
				timeZone: worldTime.timezone || selectedTimeZone,
				datetime: worldTime.datetime,
				utcDatetime: worldTime.utc_datetime,
				abbreviation: worldTime.abbreviation,
				source: "worldtimeapi.org",
				queriedAt: new Date().toISOString()
			});
		}

		const timeApi = await fetchJson(
			`https://timeapi.io/api/TimeZone/zone?timeZone=${encodeURIComponent(selectedTimeZone)}`
		);
		if (timeApi?.currentLocalTime || timeApi?.dateTime) {
			return json({
				timeZone: timeApi.timeZone || selectedTimeZone,
				datetime: timeApi.currentLocalTime || timeApi.dateTime,
				utcDatetime: timeApi.currentUtcOffset?.seconds
					? undefined
					: timeApi.currentUtcTime,
				abbreviation: timeApi.currentUtcOffset?.abbreviation,
				source: "timeapi.io",
				queriedAt: new Date().toISOString()
			});
		}

		return json({ error: "实时联网时间查询暂不可用" }, { status: 503 });
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		return json({ error: "实时联网时间查询失败" }, { status: 500 });
	}
}
