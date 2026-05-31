import assert from "node:assert/strict";
import test from "node:test";

const { cleanWeatherLocation, resolveChinaPlace } = await import("../src/lib/server/weather-geocode.ts");

test("cleanWeatherLocation removes weather words while keeping Chinese place names", () => {
	assert.equal(cleanWeatherLocation("今天广西贵港市的天气如何？"), "广西贵港市");
	assert.equal(cleanWeatherLocation("帮我查一下新疆巴里坤哈萨克自治县气温"), "新疆巴里坤哈萨克自治县");
});

test("resolveChinaPlace resolves province city and county names locally", () => {
	assert.equal(resolveChinaPlace("广西")?.name, "广西壮族自治区");
	assert.equal(resolveChinaPlace("今天广西贵港市的天气如何？")?.name, "贵港市");
	assert.equal(resolveChinaPlace("新疆巴里坤哈萨克自治县天气")?.name, "巴里坤哈萨克自治县");
	assert.equal(resolveChinaPlace("上海市天气")?.name, "上海市");
});

test("resolveChinaPlace returns coordinates from the local China geocode index", () => {
	const place = resolveChinaPlace("巴里坤天气");

	assert.equal(place?.sourceTitle, "本地中国行政区划地理编码");
	assert.match(place?.display_name ?? "", /巴里坤哈萨克自治县/);
	assert.ok(Number(place?.lat) > 43 && Number(place?.lat) < 44);
	assert.ok(Number(place?.lon) > 92 && Number(place?.lon) < 94);
});
