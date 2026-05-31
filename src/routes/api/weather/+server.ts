import { json } from "@sveltejs/kit";
import { requireAuth, AuthError } from "$lib/server/auth";
import { cleanWeatherLocation, resolveChinaPlace } from "$lib/server/weather-geocode";

interface GeocodeResult {
	lat: string;
	lon: string;
	name?: string;
	display_name?: string;
	sourceTitle?: string;
	sourceUrl?: string;
}

interface OpenMeteoGeocodeResult {
	name: string;
	latitude: number;
	longitude: number;
	country?: string;
	admin1?: string;
	admin2?: string;
	timezone?: string;
}

interface WeatherResponse {
	current?: {
		time?: string;
		temperature_2m?: number;
		apparent_temperature?: number;
		relative_humidity_2m?: number;
		precipitation?: number;
		weather_code?: number;
		wind_speed_10m?: number;
		wind_direction_10m?: number;
	};
	current_units?: Record<string, string>;
	daily?: {
		time?: string[];
		weather_code?: number[];
		temperature_2m_max?: number[];
		temperature_2m_min?: number[];
		precipitation_probability_max?: number[];
	};
	daily_units?: Record<string, string>;
	timezone?: string;
}

const USER_AGENT = "EmotionalHealingCompanion/1.0";
const LOCATION_ALIASES: Array<[RegExp, string]> = [
	[/贵港|貴港|guigang/i, "Guigang"],
	[/北京|beijing/i, "Beijing"],
	[/上海|shanghai/i, "Shanghai"],
	[/广州|廣州|guangzhou/i, "Guangzhou"],
	[/深圳|shenzhen/i, "Shenzhen"],
	[/南宁|南寧|nanning/i, "Nanning"]
];

function cleanLocation(value: string) {
	return cleanWeatherLocation(value);
}

function weatherCodeText(code: number | undefined) {
	if (code == null) return "未知";
	if (code === 0) return "晴";
	if ([1, 2, 3].includes(code)) return "多云";
	if ([45, 48].includes(code)) return "雾";
	if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
	if ([61, 63, 65, 66, 67].includes(code)) return "雨";
	if ([71, 73, 75, 77].includes(code)) return "雪";
	if ([80, 81, 82].includes(code)) return "阵雨";
	if ([85, 86].includes(code)) return "阵雪";
	if ([95, 96, 99].includes(code)) return "雷暴";
	return `天气代码 ${code}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10000);
	try {
		const res = await fetch(url, {
			...init,
			signal: controller.signal,
			cache: "no-store"
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

async function geocode(location: string) {
	const cleaned = cleanLocation(location) || location.trim();
	const localChinaPlace = resolveChinaPlace(cleaned);
	if (localChinaPlace) {
		return localChinaPlace;
	}

	const candidates = [
		cleaned,
		...LOCATION_ALIASES.filter(([pattern]) => pattern.test(cleaned)).map(([, alias]) => alias)
	].filter((value, index, values) => value && values.indexOf(value) === index);

	for (const candidate of candidates) {
		const openMeteoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
			candidate
		)}&count=3&language=zh&format=json`;
		const openMeteo = await fetchJson<{ results?: OpenMeteoGeocodeResult[] }>(openMeteoUrl, {
			headers: { "User-Agent": USER_AGENT }
		});
		const match = openMeteo?.results?.[0];
		if (match) {
			const display = [match.name, match.admin2, match.admin1, match.country]
				.filter(Boolean)
				.join(", ");
			return {
				lat: String(match.latitude),
				lon: String(match.longitude),
				name: match.name,
				display_name: display,
				sourceTitle: "Open-Meteo Geocoding API",
				sourceUrl: "https://open-meteo.com/"
			};
		}
	}

	const url = `https://nominatim.openstreetmap.org/search?format=json&limit=3&q=${encodeURIComponent(
		cleaned
	)}`;
	const results = await fetchJson<GeocodeResult[]>(url, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
		}
	});
	const result = Array.isArray(results) ? results[0] : null;
	if (!result) return null;
	return {
		...result,
		sourceTitle: "OpenStreetMap Nominatim",
		sourceUrl: "https://nominatim.openstreetmap.org/"
	};
}

export async function GET({ request, url }: { request: Request; url: URL }) {
	try {
		requireAuth(request);
		const location = url.searchParams.get("location")?.trim() || "";
		if (location.length < 2) {
			return json({ error: "请提供有效的天气查询地点" }, { status: 400 });
		}

		const place = await geocode(location);
		if (!place) {
			return json({ error: "未找到该地点的经纬度" }, { status: 404 });
		}

		const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
		weatherUrl.searchParams.set("latitude", place.lat);
		weatherUrl.searchParams.set("longitude", place.lon);
		weatherUrl.searchParams.set(
			"current",
			[
				"temperature_2m",
				"apparent_temperature",
				"relative_humidity_2m",
				"precipitation",
				"weather_code",
				"wind_speed_10m",
				"wind_direction_10m"
			].join(",")
		);
		weatherUrl.searchParams.set(
			"daily",
			[
				"weather_code",
				"temperature_2m_max",
				"temperature_2m_min",
				"precipitation_probability_max"
			].join(",")
		);
		weatherUrl.searchParams.set("timezone", "auto");
		weatherUrl.searchParams.set("forecast_days", "1");

		const weather = await fetchJson<WeatherResponse>(weatherUrl.toString(), {
			headers: { "User-Agent": USER_AGENT }
		});
		if (!weather?.current) {
			return json({ error: "天气服务暂时没有返回可用数据" }, { status: 502 });
		}

		const current = weather.current;
		const daily = weather.daily ?? {};
		const units = weather.current_units ?? {};
		const dailyUnits = weather.daily_units ?? {};
		const placeName = place.display_name || place.name || cleanLocation(location);
		const condition = weatherCodeText(current.weather_code);
		const dailyCondition = weatherCodeText(daily.weather_code?.[0]);
		const tempUnit = units.temperature_2m || "°C";
		const windUnit = units.wind_speed_10m || "km/h";
		const precipUnit = units.precipitation || "mm";
		const content = [
			`地点：${placeName}`,
			`经纬度：${place.lat}, ${place.lon}`,
			`时区：${weather.timezone || "auto"}`,
			`观测时间：${current.time || "未标注"}`,
			`当前天气：${condition}`,
			`当前气温：${current.temperature_2m ?? "未知"}${tempUnit}`,
			`体感温度：${current.apparent_temperature ?? "未知"}${tempUnit}`,
			`相对湿度：${current.relative_humidity_2m ?? "未知"}${units.relative_humidity_2m || "%"}`,
			`降水量：${current.precipitation ?? "未知"}${precipUnit}`,
			`风速：${current.wind_speed_10m ?? "未知"}${windUnit}`,
			`风向：${current.wind_direction_10m ?? "未知"}${units.wind_direction_10m || "°"}`,
			`今日预报：${dailyCondition}`,
			`今日最高/最低：${daily.temperature_2m_max?.[0] ?? "未知"}${
				dailyUnits.temperature_2m_max || tempUnit
			} / ${daily.temperature_2m_min?.[0] ?? "未知"}${dailyUnits.temperature_2m_min || tempUnit}`,
			`今日最大降水概率：${daily.precipitation_probability_max?.[0] ?? "未知"}${
				dailyUnits.precipitation_probability_max || "%"
			}`
		].join("\n");

		return json({
			summary: `已获取 ${placeName} 当前天气和今日预报：${condition}，${current.temperature_2m ?? "未知"}${tempUnit}`,
			content,
			sources: [
				{ title: "Open-Meteo Forecast API", url: "https://open-meteo.com/" },
				{ title: place.sourceTitle || "Geocoding service", url: place.sourceUrl }
			]
		});
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: 401 });
		}
		console.error("[weather] failed:", error);
		return json({ error: "天气查询失败" }, { status: 500 });
	}
}
