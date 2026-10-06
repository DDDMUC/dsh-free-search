// v3 模型层：rerank / embedding / decision 三封装（全部带降级：失败返回 null，调用方走规则回退）。
// key 走凭据中心：SILICONFLOW_RERANK_API_KEY、DECISION_MODEL_API_KEY（由插件 resolveApiKey 传入）。

import https from "node:https";
import { httpsJson } from "./research.js";

const SF_URL = "https://api.siliconflow.cn/v1";
// 决策模型端点：默认空 = 关闭（decide 返回 null，调用方走规则回退，默认中性）；设置 DECISION_MODEL_URL 后启用。
const DECISION_URL = process.env.DECISION_MODEL_URL || "";

/** bge-reranker-v2-m3：query↔documents 相关度。返回按原文顺序的分数数组；失败返回 null。 */
export async function rerank(query, documents, apiKey) {
  if (!apiKey || !documents?.length) return null;
  try {
    const r = await httpsJson("POST", `${SF_URL}/rerank`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "BAAI/bge-reranker-v2-m3", query, documents: documents.map(String), return_documents: false }),
      timeoutMs: 15000,
    });
    if (r.status !== 200) return null;
    const out = new Array(documents.length).fill(0);
    for (const item of JSON.parse(r.text).results || []) out[item.index] = item.relevance_score ?? 0;
    return out;
  } catch { return null; }
}

/** BAAI/bge-m3 向量。返回向量数组；失败返回 null。 */
export async function embed(texts, apiKey) {
  if (!apiKey || !texts?.length) return null;
  try {
    const r = await httpsJson("POST", `${SF_URL}/embeddings`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "BAAI/bge-m3", input: texts.map(String) }),
      timeoutMs: 15000,
    });
    if (r.status !== 200) return null;
    const data = JSON.parse(r.text).data || [];
    return texts.map((_, i) => data.find((d) => d.index === i)?.embedding).filter(Boolean);
  } catch { return null; }
}

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function norm(a) { return Math.sqrt(dot(a, a)); }

/** 余弦相似度矩阵（方阵）；任一向量无效返回 null。 */
export function cosineMatrix(vectors) {
  const n = vectors.filter(Boolean).length;
  if (n < vectors.length) return null;
  return vectors.map((a) => vectors.map((b) => dot(a, b) / (norm(a) * norm(b) || 1)));
}

/** 语义去重：相似度 > threshold 的聚簇，每簇保留第一个。返回保留的索引数组；embedding 失败返回 null。 */
export async function semanticDedup(texts, apiKey, threshold = 0.92) {
  const vectors = await embed(texts, apiKey);
  const matrix = cosineMatrix(vectors || []);
  if (!matrix) return null;
  const keep = [];
  for (let i = 0; i < texts.length; i++) {
    if (keep.some((j) => matrix[i][j] > threshold)) continue;
    keep.push(i);
  }
  return keep;
}

/** decision-model-preview：state + questions → answers。失败/无 key 返回 null。
 * questions 形如 { qid: { type: "choice"|"noul"|"score", instructions, criteria } }。 */
export async function decide(state, questions, apiKey) {
  // 无端点配置即关闭决策模型：返回 null，调用方走规则回退（默认中性）
  if (!DECISION_URL) return null;
  if (!apiKey) return null;
  try {
    const r = await httpsJson("POST", DECISION_URL, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "decision-model-preview", state, questions }),
      timeoutMs: 12000,
    });
    if (r.status !== 200) return null;
    return JSON.parse(r.text).answers || null;
  } catch { return null; }
}

/** 研究意图判定（决策模型封装）：返回 { type, breadth } 或 null（降级）。 */
export async function judgeQueryIntent(question, apiKey) {
  const answers = await decide(
    `搜索查询：${question}`,
    {
      qtype: { type: "choice", instructions: "查询类型分类", criteria: { fact: "事实快查，答案唯一", research: "需要多源综合的深度研究", timely: "追踪最新动态/新闻", nav: "导航到具体站点或页面" } },
      breadth: { type: "score", instructions: "需要多大搜索广度？", criteria: ["单引擎即可", "2-3 引擎并发", "全源交叉验证"] },
    },
    apiKey
  );
  if (!answers?.qtype) return null;
  return { type: answers.qtype.choice, breadth: answers.breadth?.score ?? 1, confidence: answers.qtype.confidence ?? 0 };
}
