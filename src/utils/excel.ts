import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing    from 'expo-sharing';
import XLSX            from 'xlsx';
import { Transaction } from '../types';
import { getAllPeriods } from './period';

export async function exportExcel(
  transactions: Transaction[],
  payday: number,
): Promise<string> {
  if (!transactions.length) return '❌ 尚無記錄';

  const wb      = XLSX.utils.book_new();
  const periods = getAllPeriods(transactions.map(t => t.date), payday);

  periods.forEach(p => {
    const txs = transactions.filter(t => t.date >= p.startStr && t.date <= p.endStr);
    if (!txs.length) return;

    const rows: (string | number)[][] = [
      ['日期', '時間', '類型', '類別', '付款', '金額(NT$)', '備註'],
    ];
    txs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(t =>
        rows.push([t.date, t.time ?? '', t.type === 'income' ? '收入' : '支出',
          t.cat, t.pay ?? '', t.amount, t.note ?? ''])
      );

    const exp  = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const inc  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const card = txs.filter(t => t.type === 'expense' && t.pay === '信用卡').reduce((s, t) => s + t.amount, 0);
    const cash = txs.filter(t => t.type === 'expense' && t.pay === '現金').reduce((s, t) => s + t.amount, 0);

    rows.push([], ['', '', '', '', '總支出', '', String(exp)],
      ['', '', '', '', '總收入', '', String(inc)],
      ['', '', '', '', '結餘',   '', String(inc - exp)],
      ['', '', '', '', '信用卡', '', String(card)],
      ['', '', '', '', '現金',   '', String(cash)]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, `${p.startStr.slice(0, 7)} (${p.label})`.slice(0, 31));
  });

  // 彙總表
  const sumRows: (string | number)[][] = [
    ['週期', '開始', '結束', '收入', '支出', '結餘', '信用卡', '現金', '刷卡佔比'],
  ];
  periods.forEach(p => {
    const txs  = transactions.filter(t => t.date >= p.startStr && t.date <= p.endStr);
    if (!txs.length) return;
    const exp  = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const inc  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const card = txs.filter(t => t.type === 'expense' && t.pay === '信用卡').reduce((s, t) => s + t.amount, 0);
    const cash = txs.filter(t => t.type === 'expense' && t.pay === '現金').reduce((s, t) => s + t.amount, 0);
    sumRows.push([p.label, p.startStr, p.endStr, inc, exp, inc - exp, card, cash,
      exp ? Math.round((card / exp) * 100) + '%' : '0%']);
  });
  const wsSum = XLSX.utils.aoa_to_sheet(sumRows);
  wsSum['!cols'] = Array(9).fill({ wch: 12 });
  XLSX.utils.book_append_sheet(wb, wsSum, '彙總表');

  // 寫檔（新 API）
  const now      = new Date();
  const fileName = `記帳報表_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;
  const file     = new FSFile(Paths.document, fileName);
  const wbBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  // base64 → Uint8Array 寫入
  const binary = atob(wbBase64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const writer = file.writableStream().getWriter();
  await writer.write(bytes);
  await writer.close();

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: '匯出記帳報表',
      UTI: 'com.microsoft.excel.xlsx',
    });
    return '📊 報表已開啟分享視窗';
  }
  return '❌ 此裝置不支援分享功能';
}

export async function importExcel(
  fileUri: string,
  existingTxs: Transaction[],
): Promise<{ imported: number; transactions: Transaction[] }> {
  const file   = new FSFile(fileUri);
  const buffer = await file.arrayBuffer();
  const wb     = XLSX.read(buffer, { type: 'array' });

  let imported = 0;
  const merged = [...existingTxs];

  wb.SheetNames.forEach(name => {
    if (name === '彙總表') return;
    const ws   = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 });

    rows.slice(1).forEach(row => {
      if (!row[0] || !row[5]) return;
      if (String(row[0]).includes('總')) return;

      const dateStr = String(row[0]).replace(/\//g, '-');
      const amount  = Number(row[5]);
      const cat     = String(row[3]);

      const isDup = existingTxs.some(
        e => e.date === dateStr && e.cat === cat && e.amount === amount,
      );
      if (!isDup) {
        merged.push({
          id:     Date.now() + imported,
          type:   row[2] === '收入' ? 'income' : 'expense',
          cat:    cat as Transaction['cat'],
          amount,
          date:   dateStr,
          time:   String(row[1] ?? ''),
          pay:    (String(row[4]) || '現金') as Transaction['pay'],
          note:   String(row[6] ?? ''),
        });
        imported++;
      }
    });
  });

  merged.sort((a, b) => b.date.localeCompare(a.date));
  return { imported, transactions: merged };
}
