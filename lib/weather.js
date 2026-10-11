// Weather（Open-Meteo：geocoding + forecast，全部免 key）
// 与 lib/index.js 的 weather 工具配套。这里同时导出 output schema 与 sanitizeWeatherResult()，
// 使 tools/assert-weather-contract.mjs 能离线校验「返回值 ↔ schema」逐字段对齐——
// 0.8.4/0.8.5 曾因 schema 漏声明 latitude/longitude/timezone/current.code/daily[].code
// 导致 additionalProperties:false 校验失败、工具 100% 不可用（issue #73）。

const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// WMO weather code → 描述（中文/英文）
const WMO_CODES = {
  0: ["晴", "Clear sky"],
  1: ["大部晴朗", "Mainly clear"],
  2: ["多云", "Partly cloudy"],
  3: ["阴", "Overcast"],
  45: ["雾", "Fog"],
  48: ["雾凇", "Depositing rime fog"],
  51: ["毛毛雨（弱）", "Light drizzle"],
  53: ["毛毛雨", "Moderate drizzle"],
  55: ["毛毛雨（强）", "Dense drizzle"],
  56: ["冻毛毛雨（弱）", "Light freezing drizzle"],
  57: ["冻毛毛雨（强）", "Dense freezing drizzle"],
  61: ["小雨", "Slight rain"],
  63: ["中雨", "Moderate rain"],
  65: ["大雨", "Heavy rain"],
  66: ["冻雨（弱）", "Light freezing rain"],
  67: ["冻雨（强）", "Heavy freezing rain"],
  71: ["小雪", "Slight snow"],
  73: ["中雪", "Moderate snow"],
  75: ["大雪", "Heavy snow"],
  77: ["雪粒", "Snow grains"],
  80: ["阵雨（弱）", "Slight rain showers"],
  81: ["阵雨", "Moderate rain showers"],
  82: ["阵雨（强）", "Violent rain showers"],
  85: ["阵雪（弱）", "Slight snow showers"],
  86: ["阵雪（强）", "Heavy snow showers"],
  95: ["雷暴", "Thunderstorm"],
  96: ["雷暴伴小冰雹", "Thunderstorm with slight hail"],
  99: ["雷暴伴大冰雹", "Thunderstorm with heavy hail"],
};
function wmoText(code, lang) {
  const hit = WMO_CODES[code];
  if (!hit) return lang === "en" ? "Unknown" : "未知";
  return (lang === "en" ? hit[1] : hit[0]) + ` (WMO ${code})`;
}

export async function geocodeLocation(name, signal) {
  const params = new URLSearchParams({ name, count: "1", language: "zh", format: "json" });
  const response = await fetch(`${OPEN_METEO_GEOCODING_URL}?${params}`, {
    method: "GET",
    redirect: "error",
    headers: { accept: "application/json", "user-agent": "deepseek-harness/free-search" },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error(`geocoding API error (HTTP ${response.status})`);
  const data = await response.json();
  const hit = data.results?.[0];
  if (!hit) return null;
  return {
    name: hit.name,
    admin: hit.admin1 ?? "",
    country: hit.country ?? "",
    latitude: hit.latitude,
    longitude: hit.longitude,
  };
}

export async function fetchWeather(location, days, lang, signal) {
  const geo = await geocodeLocation(location, signal);
  if (!geo) throw new Error(`could not geocode location "${location}" — try a nearby larger city`);
  const params = new URLSearchParams({
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: String(Math.min(Math.max(Number(days) || 3, 1), 7)),
  });
  const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params}`, {
    method: "GET",
    redirect: "error",
    headers: { accept: "application/json", "user-agent": "deepseek-harness/free-search" },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error(`forecast API error (HTTP ${response.status})`);
  const data = await response.json();
  const cur = data.current ?? {};
  const daily = data.daily ?? {};
  return {
    location: [geo.name, geo.admin, geo.country].filter(Boolean).join(", "),
    latitude: geo.latitude,
    longitude: geo.longitude,
    current: {
      temperature: cur.temperature_2m,
      apparent: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      wind: cur.wind_speed_10m,
      code: cur.weather_code,
      text: wmoText(cur.weather_code, lang),
    },
    daily: (daily.time ?? []).map((date, i) => ({
      date,
      min: daily.temperature_2m_min?.[i],
      max: daily.temperature_2m_max?.[i],
      code: daily.weather_code?.[i],
      text: wmoText(daily.weather_code?.[i], lang),
      precipitationProbability: daily.precipitation_probability_max?.[i],
    })),
    timezone: data.timezone ?? "",
  };
}

// weather 工具的 output schema。与 fetchWeather 返回值逐字段对齐：
// 任何一边增删字段都必须同步，否则 additionalProperties:false 会让工具调用失败（#73）。
export const WEATHER_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    location: { type: "string" },
    latitude: { type: "number" },
    longitude: { type: "number" },
    timezone: { type: "string" },
    current: {
      type: "object",
      additionalProperties: false,
      properties: {
        temperature: { type: "number" },
        apparent: { type: "number" },
        humidity: { type: "number" },
        wind: { type: "number" },
        code: { type: "number" },
        text: { type: "string" },
      },
    },
    daily: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          min: { type: "number" },
          max: { type: "number" },
          code: { type: "number" },
          text: { type: "string" },
          precipitationProbability: { type: "number" },
        },
      },
    },
  },
};

// lossless JSON 不允许 undefined 字段：按"存在且有值"构造对象（与其它工具的做法一致）。
export function sanitizeWeatherResult(r) {
  return {
    location: r.location,
    ...(r.latitude !== undefined ? { latitude: r.latitude } : {}),
    ...(r.longitude !== undefined ? { longitude: r.longitude } : {}),
    ...(r.timezone ? { timezone: r.timezone } : {}),
    current: {
      ...(r.current?.temperature !== undefined ? { temperature: r.current.temperature } : {}),
      ...(r.current?.apparent !== undefined ? { apparent: r.current.apparent } : {}),
      ...(r.current?.humidity !== undefined ? { humidity: r.current.humidity } : {}),
      ...(r.current?.wind !== undefined ? { wind: r.current.wind } : {}),
      ...(r.current?.code !== undefined ? { code: r.current.code } : {}),
      ...(r.current?.text ? { text: r.current.text } : {}),
    },
    daily: (r.daily ?? []).map((d) => ({
      date: d.date,
      ...(d.min !== undefined ? { min: d.min } : {}),
      ...(d.max !== undefined ? { max: d.max } : {}),
      ...(d.code !== undefined ? { code: d.code } : {}),
      ...(d.text ? { text: d.text } : {}),
      ...(d.precipitationProbability !== undefined ? { precipitationProbability: d.precipitationProbability } : {}),
    })),
  };
}
