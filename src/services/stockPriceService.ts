/**
 * stockPriceService.ts ── 股票現價抓取服務
 *
 * 第一版：mock 實作（結構已封裝好，之後替換 API 只需改這裡）
 *
 * 台股建議替換：https://mis.twse.com.tw/stock/api/getStockInfo.jsp
 * 美股建議替換：Yahoo Finance / Finnhub / Polygon.io
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

/**
 * 抓取股票現價
 * 目前為 mock，呼叫後模擬網路延遲並回傳假資料。
 * 替換真實 API 時只需修改此函式內部實作。
 */
export async function fetchStockPrice(params: {
  symbol: string;
  market: 'TW' | 'US';
}): Promise<StockPriceResult> {
  const { symbol, market } = params;

  // ── 模擬網路延遲 ──
  await new Promise(resolve => setTimeout(resolve, 800));

  // ── 真實 API 整合點（取消下面的 throw 並換成真實呼叫）──
  // if (market === 'TW') {
  //   const res = await fetch(
  //     `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${symbol}.tw`,
  //   );
  //   const json = await res.json();
  //   const price = parseFloat(json.msgArray?.[0]?.z ?? '0');
  //   if (!price) throw new StockPriceFetchError('找不到股票資料');
  //   return { price, currency: 'TWD', source: 'TWSE', updatedAt: new Date().toISOString() };
  // }

  // ── 第一版：固定回傳「查無資料」，讓使用者手動輸入 ──
  throw new StockPriceFetchError(
    `${market === 'TW' ? '台股' : '美股'} ${symbol} 自動抓取尚未啟用，請手動輸入現價`,
  );
}
