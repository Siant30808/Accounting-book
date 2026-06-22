/**
 * stockPriceService.ts ── 股票現價抓取服務
 *
 * 台股：TWSE MIS API（上市先試，若無資料再試上櫃）
 *   https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_2330.tw
 * 非交易時間 z 欄位為 "-"，自動 fallback 到昨收價 y。
 *
 * 美股：尚未啟用，請手動輸入。
 */

export interface StockPriceResult {
  price:      number;
  currency:   'TWD' | 'USD';
  source:     string;
  updatedAt:  string;
}

export class StockPriceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockPriceFetchError';
  }
}

const TWSE_BASE = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

async function fetchTWSE(exCh: string): Promise<number | null> {
  const url = `${TWSE_BASE}?ex_ch=${exCh}&json=1&delay=0`;
  const res  = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const json = await res.json();
  const item = json?.msgArray?.[0];
  if (!item) return null;

  // 交易時間用即時成交價，非交易時間 z="-" 則用昨收價
  const raw = (item.z && item.z !== '-') ? item.z : item.y;
  const price = parseFloat(raw);
  return isNaN(price) || price <= 0 ? null : price;
}

export async function fetchStockPrice(params: {
  symbol: string;
  market: 'TW' | 'US';
}): Promise<StockPriceResult> {
  const { symbol, market } = params;

  if (market === 'TW') {
    // 先試上市（tse），再試上櫃（otc）
    let price = await fetchTWSE(`tse_${symbol}.tw`);
    let source = 'TWSE 上市';
    if (price === null) {
      price  = await fetchTWSE(`otc_${symbol}.tw`);
      source = 'TWSE 上櫃';
    }
    if (price === null) {
      throw new StockPriceFetchError(
        `找不到 ${symbol} 的報價，請確認代號或手動輸入`,
      );
    }
    return { price, currency: 'TWD', source, updatedAt: new Date().toISOString() };
  }

  // 美股：尚未啟用
  throw new StockPriceFetchError(
    `美股 ${symbol} 自動抓取尚未啟用，請手動輸入現價`,
  );
}
