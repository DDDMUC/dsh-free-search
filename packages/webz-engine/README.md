// # Webz.io News Search 引擎（可选安装）

`dsh-free-search` 的外部引擎包：把 [Webz.io News Search API](https://docs.webz.io/docs/webz/news-api-quickstart)
接成一个可搜索的引擎。核心插件不含这个引擎，要用才装。

## 安装

```bash
# 在 dsh 的 profile 目录里装（那个目录下有 node_modules）
pnpm add dsh-free-search-engine-webz
```

装完重启 dsh，设置页的「外部引擎」区会出现 `Webz.io 新闻`。**默认不勾选**，
勾上才会进启用白名单。

## 凭据

在 [app.webz.io](https://app.webz.io/login/signup) 拿 API token，填进
`WEBZ_API_TOKEN`（凭据中心或环境变量，与其它引擎同一套解析顺序）。

账户还需要开通 News API 权限；没有权限时接口返回 401。

## 这个引擎做了什么

| 行为 | 说明 |
|---|---|
| 端点 | `GET https://api.webz.io/api/news` |
| 认证 | `Authorization: Bearer <token>`，**不拼进 query**，避免进日志 |
| 结果数 | 取 `maxResults`，夹在 1–100（API 上限） |
| 默认窗口 | 没给时间过滤时搜最近 31 天 |
| 时间过滤 | `{ days }` 与 `{ after: "YYYY-MM-DD" }` 都换算成毫秒 `ts` |
| 历史窗口 | 起点超过 31 天时自动带 `allowNewsHistory=true`（**按 2–4 credits 计费**，由账户承担） |
| 排序 | `sort=relevancy`（这是搜索工具，不是信息流） |
| 字段 | `posts[]` → `sources[]`：`url` / `title` / `summary`（无则 `text`）/ `published` → `publishedAt` / `thread.site` |

## 计费提醒

- 最近 31 天内的窗口：1 credit / 请求
- 31 天~3 个月：2 credits
- 3~6 个月：3 credits
- 超过 6 个月：4 credits

`allowNewsHistory` 是**这个包自己**根据窗口起点判断的。如果你只想要廉价查询，
把时间过滤保持在 31 天内即可。

## 故障表现

引擎自己的失败不会拖垮搜索链：鉴权失败、额度耗尽、限流、查询语法错误都会
被分类，然后照常回退到下一个引擎。

## 卸载

```bash
pnpm remove dsh-free-search-engine-webz
```

配置里残留的 `webz` id 会被忽略，不报错。
