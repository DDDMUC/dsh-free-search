# 外部引擎：第一期实现计划

> 设计见 [engine-extension-plan.md](./engine-extension-plan.md)。本文只写「怎么做」。
> 范围：核心侧接线 + 第一个包（Webz.io News Search）。设置页分段**不在本期**。

## 0. 先修一处设计文档的自相矛盾

原设计第 3 节写「进 `multi_search` 并发池：做」，第 5 节写「进语言池：不做」。
但 multi 的并发池**就是**语言池（`lib/index.js` 里 `languagePool()` → `normalizeLanguagePool()`），
两者不能同时成立。

本期实际边界：

| 能力 | 做不做 | 依据 |
|---|---|---|
| Multi **显式**点名（`engines: ["webz"]`） | 做 | 走 `runMultiSearch` 的 explicit 分支，只换判据即可 |
| Multi **默认池**自动带外部引擎 | 不做 | 默认池来自 `languagePool()`，被 `ALL_ENGINES` 静态过滤，静默丢弃 |
| Auto 路由 | 只走回退位 | 自定义回退链里含外部引擎时，它排在链尾 |

## 1. 核心侧：`lib/external_engines.js`

已实现的部分（纯函数、无副作用，可离线断言）：

| 导出 | 作用 |
|---|---|
| `EXTERNAL_API_VERSION` | 契约版本，本期 `1` |
| `listTopLevelPackages(dir)` | 展开 `node_modules` 顶层，含 scope，不递归、不扫 `.pnpm` |
| `markerPath(manifest)` | 取 `dsh.freeSearch` |
| `resolveEntry(dir, entry)` | 解析入口并拒绝越出包目录 |
| `validateEngine(engine, builtinIds, seenIds)` | 形状 + id 冲突 + apiVersion |
| `loadExternalEngine(...)` | 读 manifest → import → 校验；**import 失败只记失败不抛** |
| `discoverExternalEngines({profileDir, builtinIds})` | 扫描并汇总 `{engines, failures}` |
| `searchContext({...})` | 交给引擎的六个参数，无 `cfg` |
| `normalizeEngineResult(result, cap)` | 结果形状收口，坏形状返回 `null` |

**凭据（方案 A）**：`requiresKey: ["WEBZ_API_TOKEN"]` 里的名字就是凭据名，
核心逐个调 `resolveApiKey(name, null)`（顺序：凭据中心 → 环境变量），
结果按**名字**放进 `keys` 对象，引擎取 `keys.WEBZ_API_TOKEN`。
不声明就拿不到，拿不到别人的。

## 2. 核心侧：`lib/index.js` 接线

### 2.1 一个模块级注册表

```js
const externalEngineIds = new Set();
const externalTimeIds = new Set();
const isKnownEngine = (id) => ALL_ENGINES.includes(id) || externalEngineIds.has(id);
const isTimeEngine = (id) => TIME_ENGINES.includes(id) || externalTimeIds.has(id);
export function setExternalEngines(engines) { /* 填三个 Set + REQUIRED_CREDENTIALS + KEY_REF_MAP */ }
```

`setExternalEngines` 还要做两件事，让下游不必知道「外部」这回事：

- `REQUIRED_CREDENTIALS[id] = [{ env: name, settings: null }]`
  → `credentialRequirement` / `partitionByCredentials` / doctor 自动正确
- `KEY_REF_MAP[name] = name`
  → 凭据中心可以写这些 key（`credentialsSet` 的白名单是一条 `if (!ref)`）

### 2.2 换判据（7 处）

| 位置 | 现在 | 改成 |
|---|---|---|
| `normalizeDisabledEngines` | `ALL_ENGINES.includes` | `isKnownEngine` |
| `normalizeAllowedEngines` | 同上 | 同上 |
| `normalizeFallbackOrder` | 同上 | 同上 |
| `searchOnce` 的 `preferred` | 同上 | 同上 |
| `runMultiSearch` 的 explicit `engines` | 同上 | 同上 |
| `runEngineTest` 的 `args.engines` | 同上 | 同上 |
| `advanced_search` 的 `args.engine` | 同上 | 同上 |

时间过滤另有两组（`routeEngines` 3 处、`searchOnce` 3 处）要把
`TIME_ENGINES.includes` 换成 `isTimeEngine`。

**不动**的三处，因为它们是「默认集合」，外部引擎按设计不该自动进入：

- `effectiveAllowedEngines` 的旧配置回填（返回 `ALL_ENGINES`）
- `effectiveDisabledEngines`（同理）
- `routeEngines` 里 `hasCustomOrder === false` 那条 `ALL_ENGINES.filter(...)`

### 2.3 注册 runner

在 `apply()` 里、`keylessFirst` 包装之后：

```js
void (async () => {
  const mode = detectInstallMode();
  const { engines, failures } = await discoverExternalEngines({
    profileDir: mode?.profileDir, builtinIds: ALL_ENGINES,
  });
  setExternalEngines(engines);
  for (const engine of engines) engineRunners[engine.id] = makeRunner(engine);
})();
```

`makeRunner` 每次调用都现解析凭据（保存后即时生效）：

```js
async ({ query, maxResults, timeRange, signal }) => {
  const keys = {};
  for (const name of engine.requiresKey) {
    const value = await resolveApiKey(name, null);
    if (value) keys[name] = value;
  }
  for (const name of engine.requiresKey) {
    if (!keys[name]) throw new EngineSkip(`${engine.id} requires ${name}`, `${name} is not configured`);
  }
  const result = await engine.search(searchContext({ query, maxResults, timeRange, keys, fetch: proxyFetch, signal }));
  const normalized = normalizeEngineResult(result, maxResults);
  if (normalized === null) throw new Error(`${engine.id} returned an invalid result shape`);
  return normalized;
}
```

discovery 是异步的（`import()`），所以启动那一刻外部引擎还不在表里；
早于它完成的搜索会走到 `engineRunners[engine] === undefined` 而跳过该引擎，行为与「未启用」一致。

### 2.4 `describe()` 多回一段

```js
externalEngines: externalEngineStatus()  // [{ id, label, time, requiresKey, status, reason }]
```

`status` ∈ `ready` / `needs-key` / `invalid`。本期只是回传，设置页下一期消费。

## 3. 第一个包：`packages/webz-engine/`

```
packages/webz-engine/
  package.json     name: dsh-free-search-engine-webz, dsh.freeSearch: "./lib/webz.js"
  lib/webz.js      export const freeSearchEngine
  README.md
```

不做 workspace 成员：`pnpm-workspace.yaml` 不动，核心的 `files` 白名单也不含 `packages/`，
所以 `npm publish` 不会带上它。

`lib/webz.js` 承担**全部** Webz 知识，核心一行都不提：

| 知识点 | 落点 |
|---|---|
| `GET https://api.webz.io/api/news` | `webzRequestUrl()` |
| 认证 | `Authorization: Bearer <token>`（不拼进 query，避免进日志） |
| `size` 上限 100 | 夹紧 |
| `ts` 是 Unix 毫秒 | `timeRange` → `ts` |
| 起点超过 31 天必须 `allowNewsHistory=true` | 由引擎自己判断，核心不管 |
| 响应 `posts[]` | `parseWebzResponse()` |
| 401 / 402 / 429 / 400 | 分类报错 |

## 4. 断言

新增 `tools/assert-external-engines.mjs`（离线，全部用临时目录里的假包）：

1. 有 marker 的包被发现
2. 无 marker 的包不被发现
3. `apiVersion: 2` 被拒绝且给出原因
4. id 与内置（`bing`）冲突被拒绝
5. 两个包同 id：后加载的拒绝
6. import 抛错的包只记失败，扫描继续
7. 返回坏形状被 `normalizeEngineResult` 判 `null`
8. 外部引擎不进默认白名单
9. 勾选后进 `allowedEngines`、能进回退链
10. `keys` 只含声明的那一个
11. 交给引擎的 `fetch` 是 `proxyFetch`（不是全局 `fetch`）

再加 `tools/assert-webz-engine.mjs`：

- URL 形状（host / path / `size` / `q`）
- `timeRange` 两种形态 → `ts` 的换算
- 31 天边界：第 31 天不带，第 32 天带 `allowNewsHistory`
- `posts[]` → `sources[]` 字段映射
- 坏 JSON / 401 / 429 的报错文案

## 5. 完成判据

- `node tools/run-assertions.mjs` 全绿，且**内置 43 个引擎一条不动**
- 手工验证：`allowedEngines` 加 `"webz"` + `engine: "webz"` → 有 token 时出结果，无 token 时报 `WEBZ_API_TOKEN is not configured`
- 设置页**未改**（下一期）
