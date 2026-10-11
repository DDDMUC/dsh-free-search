// 契约断言：weather 工具的返回值必须严格落在 output schema 内。
// 背景：0.8.4/0.8.5 的 weather 因 schema 漏声明 latitude/longitude/timezone/current.code/
// daily[].code（additionalProperties:false）导致 100% 调用失败（issue #73）。
// 本断言用 mock fetch 跑真实 fetchWeather + sanitizeWeatherResult，再递归对照
// WEATHER_OUTPUT_SCHEMA——改任何一边不加同步都会在这里 fail。
import { fetchWeather, sanitizeWeatherResult, WEATHER_OUTPUT_SCHEMA } from "../lib/weather.js";

let passed = 0;
function check(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ok  ${name}`);
}

// 递归校验器（只实现本 schema 用到的子集：object/array/number/string + additionalProperties:false）
function validate(value, schema, path) {
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return `${path}: 期望 object，实际 ${typeof value}`;
    for (const [k, v] of Object.entries(value)) {
      if (schema.additionalProperties === false && !(k in schema.properties)) return `${path}.${k}: 未在 schema 声明（additionalProperties:false）`;
      if (k in schema.properties) {
        const e = validate(v, schema.properties[k], `${path}.${k}`);
        if (e) return e;
      }
    }
    for (const k of Object.keys(schema.properties)) {
      if (!(k in value) && k !== "precipitationProbability") {
        // 必需字段（除可缺省的降水概率外）必须存在
        return `${path}.${k}: 字段缺失`;
      }
    }
    return null;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return `${path}: 期望 array`;
    for (let i = 0; i < value.length; i++) {
      const e = validate(value[i], schema.items, `${path}[${i}]`);
      if (e) return e;
    }
    return null;
  }
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value) ? null : `${path}: 期望 number，实际 ${JSON.stringify(value)}`;
  if (schema.type === "string") return typeof value === "string" ? null : `${path}: 期望 string，实际 ${typeof value}`;
  return null;
}

const realFetch = globalThis.fetch;
function mockFetch(forecastJson) {
  return async (url) => {
    const u = String(url);
    if (u.includes("geocoding-api.open-meteo.com")) {
      return { ok: true, status: 200, json: async () => ({ results: [{ name: "北京", admin1: "北京市", country: "中国", latitude: 39.9075, longitude: 116.39723 }] }) };
    }
    if (u.includes("api.open-meteo.com/v1/forecast")) {
      return { ok: true, status: 200, json: async () => forecastJson };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

// 场景 1：完整 daily（含降水概率）
{
  globalThis.fetch = mockFetch({
    timezone: "Asia/Shanghai",
    current: { temperature_2m: 25.2, relative_humidity_2m: 39, apparent_temperature: 24.8, weather_code: 0, wind_speed_10m: 5.2 },
    daily: {
      time: ["2026-10-11", "2026-10-12"],
      weather_code: [2, 51],
      temperature_2m_max: [26, 22.2],
      temperature_2m_min: [15.3, 15.4],
      precipitation_probability_max: [0, 11],
    },
  });
  const r = sanitizeWeatherResult(await fetchWeather("北京", 3, "zh", undefined));
  check("场景1：完整 daily 通过 schema", validate(r, WEATHER_OUTPUT_SCHEMA, "weather") === null);
  check("场景1：latitude/longitude/timezone 都在", r.latitude === 39.9075 && r.longitude === 116.39723 && r.timezone === "Asia/Shanghai");
  check("场景1：current.code 存在", r.current.code === 0);
  check("场景1：daily[].code 存在", r.daily[0].code === 2 && r.daily[1].code === 51);
}

// 场景 2：daily 缺降水概率（数组空）——sanitize 应裁掉该字段而不是留 undefined
{
  globalThis.fetch = mockFetch({
    timezone: "Asia/Shanghai",
    current: { temperature_2m: 20, relative_humidity_2m: 50, apparent_temperature: 19, weather_code: 61, wind_speed_10m: 10 },
    daily: { time: ["2026-10-11"], weather_code: [61], temperature_2m_max: [22], temperature_2m_min: [15], precipitation_probability_max: [] },
  });
  const r = sanitizeWeatherResult(await fetchWeather("北京", 3, "zh", undefined));
  check("场景2：缺降水概率也通过 schema", validate(r, WEATHER_OUTPUT_SCHEMA, "weather") === null);
  check("场景2：无降水概率时字段被裁掉（不是 undefined）", !("precipitationitationProbability" in r.daily[0]) && !("precipitationProbability" in r.daily[0]));
  check("场景2：其余字段完好", r.daily[0].code === 61 && r.daily[0].max === 22);
}

// 场景 3：英文输出
{
  globalThis.fetch = mockFetch({
    timezone: "Europe/Madrid",
    current: { temperature_2m: 18.4, relative_humidity_2m: 61, apparent_temperature: 17.9, weather_code: 3, wind_speed_10m: 12.3 },
    daily: { time: ["2026-10-11"], weather_code: [61], temperature_2m_max: [19], temperature_2m_min: [11], precipitation_probability_max: [40] },
  });
  const r = sanitizeWeatherResult(await fetchWeather("Madrid", 3, "en", undefined));
  check("场景3：英文输出通过 schema", validate(r, WEATHER_OUTPUT_SCHEMA, "weather") === null);
  check("场景3：英文文本", r.current.text.includes("Overcast"));
}

// 场景 4：geocode 无结果 → 抛错（不返回残缺对象）
{
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) });
  let threw = false;
  try { await fetchWeather("不存在的地方xyz", 3, "zh", undefined); } catch { threw = true; }
  check("场景4：geocode 空结果抛错", threw);
}

// 场景 5：schema 反向对齐——schema 声明的每个字段都必须出现在返回值里（防止只裁不声明）
{
  const r = sanitizeWeatherResult({
    location: "x",
    latitude: 1,
    longitude: 2,
    current: { temperature: 1, apparent: 1, humidity: 1, wind: 1, code: 0, text: "t" },
    daily: [{ date: "d", min: 1, max: 2, code: 0, text: "t", precipitationProbability: 5 }],
    timezone: "tz",
  });
  const missing = [];
  for (const k of Object.keys(WEATHER_OUTPUT_SCHEMA.properties)) if (!(k in r)) missing.push(k);
  for (const k of Object.keys(WEATHER_OUTPUT_SCHEMA.properties.current.properties)) if (!(k in r.current)) missing.push(`current.${k}`);
  for (const k of Object.keys(WEATHER_OUTPUT_SCHEMA.properties.daily.items.properties)) if (!(k in r.daily[0])) missing.push(`daily[].${k}`);
  check("场景5：schema 声明的字段返回值全都提供", missing.length === 0);
  if (missing.length) console.error("   缺失: " + missing.join(", "));
}

globalThis.fetch = realFetch;
console.log(`OK: ${passed} assertions passed`);
