import { Period, Bill, MarketHoliday, addBusinessDays } from '../types';

export function localDateStr(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function getPeriod(dateStr: string | null, payday: number): Period {
  try {
    const d   = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    const day = d.getDate();
    const y   = d.getFullYear();
    const m   = d.getMonth();
    const pd  = Math.min(28, Math.max(1, payday));

    let pStart: Date;
    let pEnd:   Date;

    if (day >= pd) {
      pStart = new Date(y, m, pd);
      pEnd   = new Date(y, m + 1, pd - 1, 23, 59, 59, 999);
    } else {
      pStart = new Date(y, m - 1, pd);
      pEnd   = new Date(y, m, pd - 1, 23, 59, 59, 999);
    }

    return {
      start:    pStart,
      end:      pEnd,
      startStr: localDateStr(pStart),
      endStr:   localDateStr(pEnd),
      label:    `${pStart.getMonth() + 1}/${pStart.getDate()} ~ ${pEnd.getMonth() + 1}/${pEnd.getDate()}`,
    };
  } catch {
    const now    = new Date();
    const y      = now.getFullYear();
    const m      = now.getMonth();
    const pStart = new Date(y, m, 1);
    const pEnd   = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return {
      start:    pStart,
      end:      pEnd,
      startStr: localDateStr(pStart),
      endStr:   localDateStr(pEnd),
      label:    `${pStart.getMonth() + 1}/1 ~ ${pEnd.getMonth() + 1}/${pEnd.getDate()}`,
    };
  }
}

export function currentPeriod(payday: number): Period {
  return getPeriod(null, payday);
}

export function inPeriod(txDate: string, p: Period): boolean {
  return txDate >= p.startStr && txDate <= p.endStr;
}

/** 取得某個到期日（每月幾號）落在指定週期內的實際日期 */
export function getDueDateInPeriod(dueDay: number, p: Period): Date {
  const d1 = new Date(p.start.getFullYear(), p.start.getMonth(), dueDay);
  if (d1 >= p.start && d1 <= p.end) return d1;
  return new Date(p.start.getFullYear(), p.start.getMonth() + 1, dueDay);
}

/** 取得帳單在本期的執行日（即 bill.dueDay 落在本期的日期）
 *  fixedDate → 執行日 = 扣款日
 *  tPlusBusinessDays → 執行日 = 交易日，實際扣款另計 */
export function getBillExecutionDate(bill: Bill, period: Period): Date {
  return getDueDateInPeriod(bill.dueDay, period);
}

/** 取得帳單在本期的實際扣款日
 *  fixedDate → 同執行日
 *  tPlusBusinessDays → 執行日後第 settlementBusinessDays 個營業日（排除週末及 holidays）*/
export function getBillDueDate(bill: Bill, period: Period, holidays: MarketHoliday[] = []): Date {
  const exec = getBillExecutionDate(bill, period);
  if ((bill.paymentRule ?? 'fixedDate') === 'tPlusBusinessDays') {
    return addBusinessDays(exec, bill.settlementBusinessDays ?? 2, holidays);
  }
  return exec;
}

export function getAllPeriods(txDates: string[], payday: number): Period[] {
  const keys = new Set<string>();
  txDates.forEach(date => {
    const p = getPeriod(date, payday);
    keys.add(p.startStr);
  });
  keys.add(currentPeriod(payday).startStr);
  return [...keys].sort().reverse().map(k => getPeriod(k, payday));
}
