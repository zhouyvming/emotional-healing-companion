import chinaGeocodes from "./china-weather-geocodes.js";

export interface WeatherPlace {
	lat: string;
	lon: string;
	name?: string;
	display_name?: string;
	sourceTitle?: string;
	sourceUrl?: string;
}

interface ChinaWeatherGeocodeRecord {
	c: string;
	n: string;
	p: string;
	level: "province" | "city" | "district";
	lon: string;
	lat: string;
}

const NOISE_WORDS =
	/今天|今日|现在|当前|实时|明天|后天|天气|气温|温度|预报|降雨|降水|下雨|刮风|风力|如何|怎么样|怎么|查询|查一下|查一查|帮我|请问|的/g;
const PUNCTUATION = /[?？。！!，,、；;：:\s]/g;
const SUFFIXES =
	/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治州|地区|盟|省|市|县|区)$/;
const ETHNIC_AUTONOMY_SUFFIX =
	/(满族|蒙古族|回族|藏族|维吾尔族|哈萨克族|哈萨克|柯尔克孜族|塔吉克族|俄罗斯族|朝鲜族|鄂伦春族|鄂温克族|达斡尔族|锡伯族|土家族|苗族|侗族|瑶族|壮族|彝族|傣族|黎族|布依族|水族|仫佬族|毛南族|羌族|畲族|景颇族|拉祜族|佤族|纳西族|土族|撒拉族|东乡族|保安族|裕固族|白族).*自治(县|州|区)$/;
const GENERIC_NAMES = new Set(["市辖区", "县", "省直辖县级行政区划", "自治区直辖县级行政区划"]);

const records = chinaGeocodes as ChinaWeatherGeocodeRecord[];
const byCode = new Map(records.map((record) => [record.c, record]));

function normalize(value: string) {
	return value
		.replace(NOISE_WORDS, "")
		.replace(PUNCTUATION, "")
		.trim();
}

function shortName(name: string) {
	return name.replace(SUFFIXES, "");
}

function nameVariants(name: string) {
	const variants = [name, shortName(name)];
	const ethnicShort = name.replace(ETHNIC_AUTONOMY_SUFFIX, "");
	if (ethnicShort !== name) variants.push(ethnicShort);
	return [...new Set(variants.filter((value) => value.length >= 2))];
}

function pathFor(record: ChinaWeatherGeocodeRecord) {
	const path: ChinaWeatherGeocodeRecord[] = [];
	let current: ChinaWeatherGeocodeRecord | undefined = record;
	while (current) {
		path.unshift(current);
		current = current.p ? byCode.get(current.p) : undefined;
	}
	return path;
}

function displayName(record: ChinaWeatherGeocodeRecord) {
	const parts = pathFor(record)
		.map((item) => item.n)
		.filter((name, index, names) => name && name !== "市辖区" && names.indexOf(name) === index);
	return parts.join(", ");
}

function scoreRecord(record: ChinaWeatherGeocodeRecord, cleaned: string) {
	if (GENERIC_NAMES.has(record.n)) return 0;
	const full = record.n;
	let score = 0;

	if (cleaned === full) score += 1000;
	else if (cleaned.includes(full)) score += 700 + full.length;

	for (const variant of nameVariants(full)) {
		if (variant === full) continue;
		if (cleaned === variant) score += 900;
		else if (cleaned.includes(variant)) score += 500 + variant.length;
	}

	if (score === 0) return 0;

	const pathNames = pathFor(record).map((item) => item.n);
	for (const parentName of pathNames) {
		if (parentName !== record.n && cleaned.includes(parentName)) score += 80;
		for (const parentVariant of nameVariants(parentName)) {
			if (parentVariant !== parentName && cleaned.includes(parentVariant)) score += 40;
		}
	}

	if (record.level === "district") score += 30;
	if (record.level === "city") score += 20;
	if (record.level === "province") score += 10;

	return score;
}

export function cleanWeatherLocation(value: string) {
	return normalize(value) || value.replace(PUNCTUATION, "").trim();
}

export function resolveChinaPlace(location: string): WeatherPlace | null {
	const cleaned = cleanWeatherLocation(location);
	if (cleaned.length < 2) return null;

	let best: { record: ChinaWeatherGeocodeRecord; score: number } | null = null;
	for (const record of records) {
		const score = scoreRecord(record, cleaned);
		if (!score) continue;
		if (!best || score > best.score || (score === best.score && record.n.length > best.record.n.length)) {
			best = { record, score };
		}
	}

	if (!best) return null;
	const record = best.record;
	return {
		lat: record.lat,
		lon: record.lon,
		name: record.n,
		display_name: displayName(record),
		sourceTitle: "本地中国行政区划地理编码",
		sourceUrl: "https://geo.datav.aliyun.com/areas_v3/bound/all.json"
	};
}
