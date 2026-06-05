import { Period } from '../types';

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

export function getAllPeriods(txDates: string[], payday: number): Period[] {
  const keys = new Set<string>();
  txDates.forEach(date => {
    const p = getPeriod(date, payday);
    keys.add(p.startStr);
  });
  keys.add(currentPeriod(payday).startStr);
  return [...keys].sort().reverse().map(k => getPeriod(k, payday));
}
