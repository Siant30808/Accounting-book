import { MarketHoliday } from '../types';

/**
 * 資料來源優先序：
 *   1. TWSE OpenAPI（證交所開休市日期，JSON，最準確）
 *   2. data.gov.tw 行政機關辦公日曆（備援）
 *
 * ⚠️  此資料用於估算投資交割扣款日，如遇特殊休市，請以證券商通知為準。
 */

// 1. 證交所 OpenAPI — 回傳 JSON 陣列，只含休市日
const TWSE_API = 'https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule';

// 2. 政府行政機關辦公日曆表（data.gov.tw）
//    Resource ID: 382000000A-000077-001
//    欄位：西元日期 (YYYYMMDD)、是否放假 (0=上班, 2=放假)、備註
const GOVT_API =
  'https://data.gov.tw/api/v2/rest/datastore/382000000A-000077-001?format=json&limit=500';

// ── helpers ──────────────────────────────────────────────────

function yyyymmddToIso(raw: string): string | null {
  const s = String(raw).trim().replace(/[/\-]/g, '');
  if (!/^\d+$/.test(s)) return null;

  // 西元年 8 碼：20260101
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }

  // 民國年 7 碼：1150101 → 2026-01-01
  if (s.length === 7) {
    const rocYear = parseInt(s.slice(0, 3), 10);
    if (!rocYear || rocYear <= 0) return null;
    return `${rocYear + 1911}-${s.slice(3, 5)}-${s.slice(5, 7)}`;
  }

  return null;
}

function isTwseHolidayRecord(r: Record<string, string>): boolean {
  const name = String(r['Name'] ?? r['name'] ?? r['說明'] ?? '').trim();
  const desc = String(r['Description'] ?? r['description'] ?? r['備註'] ?? '').trim();
  const text = `${name} ${desc}`;

  // 交易日說明不是休市日
  if (/開始交易|最後交易/.test(text)) return false;

  // 明確休市 / 放假
  if (/放假|補假|休市|無交易|農曆除夕|春節|和平紀念日|兒童節|民族掃墓節|勞動節|端午節|中秋節|國慶日|元旦|開國紀念/.test(text)) {
    return true;
  }

  return false;
}

async function fetchWithTimeout(url: string, ms = 14000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function detectHtml(text: string): boolean {
  const lower = text.slice(0, 300).toLowerCase();
  return lower.includes('<html') || lower.includes('<!doctype');
}

// ── TWSE OpenAPI parser ───────────────────────────────────────
// 預期 JSON 陣列格式（欄位名稱容錯多種）:
//   [{ "Date":"1150101", "Name":"中華民國開國紀念日" }, ...]
//   Date 為民國年 7 碼（115 = 2026）
function parseTwse(text: string, year: number): MarketHoliday[] {
  const json: unknown = JSON.parse(text);
  if (!Array.isArray(json)) throw new Error('TWSE API 回傳格式不是陣列');

  const yearStr = String(year);
  const out: MarketHoliday[] = [];

  for (const r of json as Record<string, string>[]) {
    if (!isTwseHolidayRecord(r)) continue;

    const raw = r['Date'] ?? r['date'] ?? r['日期'] ?? r['西元日期'] ?? '';
    const dateStr = yyyymmddToIso(raw);
    if (!dateStr || !dateStr.startsWith(yearStr)) continue;

    const name = (r['Name'] ?? r['name'] ?? r['說明'] ?? r['備註'] ?? '').trim() || undefined;
    out.push({ date: dateStr, name, source: 'remote' });
  }

  return out;
}

// ── data.gov.tw parser ────────────────────────────────────────
function parseGovt(text: string, year: number): MarketHoliday[] {
  const json: unknown = JSON.parse(text);
  const records: Record<string, string>[] =
    (json as { result?: { records?: Record<string, string>[] } })?.result?.records ?? [];

  if (!Array.isArray(records)) throw new Error('data.gov.tw API 格式錯誤（result.records 不是陣列）');

  const yearStr = String(year);
  const out: MarketHoliday[] = [];

  for (const r of records) {
    const raw = r['西元日期'] ?? '';
    if (!raw.startsWith(yearStr)) continue;
    if (r['是否放假'] !== '2') continue;
    const dateStr = yyyymmddToIso(raw);
    if (!dateStr) continue;
    const name = r['備註']?.trim() || undefined;
    out.push({ date: dateStr, name, source: 'remote' });
  }

  return out;
}

// ── 主要 export ───────────────────────────────────────────────

export async function fetchTaiwanHolidayData(year: number): Promise<MarketHoliday[]> {
  console.log('[Holiday] ── fetchTaiwanHolidayData ──');
  console.log('[Holiday] year:', year);

  // ── 1. 先試 TWSE OpenAPI ──────────────────────────────────
  console.log('[Holiday] [1] TWSE url:', TWSE_API);
  try {
    const res = await fetchWithTimeout(TWSE_API);
    console.log('[Holiday] [1] status:', res.status);
    console.log('[Holiday] [1] content-type:', res.headers.get('content-type'));

    const text = await res.text();
    console.log('[Holiday] [1] raw first 1000:', text.slice(0, 1000));

    if (detectHtml(text)) {
      console.warn('[Holiday] [1] 回傳 HTML，非 JSON。跳過 TWSE，改用備援源。');
    } else if (!res.ok) {
      console.warn(`[Holiday] [1] HTTP ${res.status}，跳過 TWSE。`);
    } else {
      const holidays = parseTwse(text, year);
      console.log('[Holiday] [1] 解析成功，共', holidays.length, '筆');
      if (holidays.length > 0) return holidays;
      console.warn('[Holiday] [1] 解析到 0 筆，year=', year, '，改用備援。');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[Holiday] [1] TWSE 失敗:', msg);
  }

  // ── 2. 備援：data.gov.tw ──────────────────────────────────
  console.log('[Holiday] [2] Govt url:', GOVT_API);
  const res2 = await fetchWithTimeout(GOVT_API);
  console.log('[Holiday] [2] status:', res2.status);
  console.log('[Holiday] [2] content-type:', res2.headers.get('content-type'));

  const text2 = await res2.text();
  console.log('[Holiday] [2] raw first 1000:', text2.slice(0, 1000));

  if (detectHtml(text2)) {
    throw new Error(
      `data.gov.tw 回傳 HTML（非 JSON）。\n\nURL: ${GOVT_API}\nStatus: ${res2.status}\n\n可能是 CORS 被擋、API URL 已失效或網路問題。\n\nRaw:\n${text2.slice(0, 500)}`
    );
  }

  if (!res2.ok) {
    throw new Error(
      `data.gov.tw HTTP ${res2.status}。\n\nURL: ${GOVT_API}\n\nRaw:\n${text2.slice(0, 300)}`
    );
  }

  const holidays2 = parseGovt(text2, year);
  console.log('[Holiday] [2] 解析成功，共', holidays2.length, '筆');
  return holidays2;
}
