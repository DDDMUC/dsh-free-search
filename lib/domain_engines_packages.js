// Native Hex keyword search; no credentials, pagination, retries, or new dependencies.
// Verified 2026-11-28: https://raw.githubusercontent.com/hexpm/specifications/main/apiary.apib
// per_page/sort: https://raw.githubusercontent.com/hexpm/hexpm/main/lib/hexpm_web/controllers/api/package_controller.ex
import { httpsJson, htmlToText } from './fetch_upstream.js';

const compact = (value, limit = 280) => Array.from(typeof value === 'string'
  ? htmlToText(value).replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  : '').slice(0, limit).join('');

const hex_pm = {
  desc: 'Hex.pm: Elixir and Erlang packages by keyword (search only)',
  async run(q) {
    if (typeof q !== 'string' || !q.trim()) throw new Error('hex_pm: search requires a non-empty query');
    const params = new URLSearchParams({ search: q.trim(), sort: 'total_downloads', page: '1', per_page: '3' });
    const r = await httpsJson('GET', `https://hex.pm/api/packages?${params}`, {
      headers: { 'User-Agent': 'dsh-free-search/0.8 (plugin)', Accept: 'application/json' }, timeoutMs: 20000,
    });
    if (r.status !== 200) throw new Error(`hex_pm: HTTP ${r.status}`);
    let data;
    try { data = JSON.parse(r.text); } catch { throw new Error('hex_pm: malformed JSON response'); }
    if (!Array.isArray(data)) throw new Error('hex_pm: malformed response (expected package array)');
    return data.slice(0, 3).map(pkg => {
      // Build canonical public URLs from a path-safe name; never trust upstream html_url.
      if (!pkg || typeof pkg.name !== 'string' || !/^[a-zA-Z0-9_]+$/.test(pkg.name)) {
        throw new Error('hex_pm: malformed package name');
      }
      const version = compact(pkg.latest_stable_version, 80) || compact(pkg.latest_version, 80);
      const downloads = pkg.downloads?.all;
      const details = [compact(pkg.meta?.description), Number.isSafeInteger(downloads) && downloads >= 0 ? `downloads ${downloads}` : ''].filter(Boolean);
      return {
        url: `https://hex.pm/packages/${encodeURIComponent(pkg.name)}`,
        title: compact(`${pkg.name}${version ? ` ${version}` : ''} on Hex.pm`),
        snippet: compact(details.join(' · ')),
        // updated_at is modification time, not publication time.
        publishedAt: '',
      };
    });
  },
};

export const PACKAGE_ENGINES = { hex_pm };
