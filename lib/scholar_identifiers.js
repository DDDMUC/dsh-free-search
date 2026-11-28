// Independently implemented, scoped identifier recognition; compared with
// free-search-mcp crates/scholar/src/ids.rs. Unlike its prose extraction, these
// helpers accept only whole inputs. Versions are retained for exact arXiv lookup.
const ARXIV = /^(?:[a-z-]+(?:\.[a-z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v[1-9]\d*)?$/i;

function resolverPath(text, hosts) {
  if (!/^https?:\/\//i.test(text) || /\s/.test(text)) return null;
  let url;
  try { url = new URL(text); } catch { return null; }
  if (!hosts.includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null;
  try { return decodeURIComponent(url.pathname.slice(1)); }
  catch { throw new Error("Malformed identifier URL encoding"); }
}

export function doiIdentifier(input) {
  const text = input.trim();
  const path = resolverPath(text, ["doi.org", "dx.doi.org"]);
  const value = path === null ? text.replace(/^doi:\s*/i, "") : path;
  if (/^10\.\d{4,9}\/[^\s]+$/i.test(value)) return value.toLowerCase();
  if (/^doi:/i.test(text) || path !== null || /^10\.\d{4,9}\/$/.test(text)) throw new Error("Malformed DOI identifier");
  return null;
}

export function arxivIdentifier(input) {
  const text = input.trim();
  const path = resolverPath(text, ["arxiv.org", "www.arxiv.org", "export.arxiv.org"]);
  let value = path === null ? text.replace(/^arxiv:\s*/i, "") : path.replace(/^(?:abs|pdf|html)\//i, "").replace(/\.pdf$/i, "");
  const doi = /^doi:|^10\.|^https?:\/\/(?:dx\.)?doi\.org\//i.test(text) ? doiIdentifier(text) : null;
  if (doi?.startsWith("10.48550/arxiv.")) value = doi.slice("10.48550/arxiv.".length);
  if (ARXIV.test(value)) return value.toLowerCase();
  if (/^arxiv:/i.test(text) || path !== null || doi?.startsWith("10.48550/arxiv.")) throw new Error("Malformed arXiv identifier");
  return null;
}
