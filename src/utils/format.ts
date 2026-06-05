export function fmt(n: number): string {
  return 'NT$' + Math.round(n).toLocaleString('zh-TW');
}

export function dayLabel(dateStr: string): string {
  const today = new Date();
  const todayStr =
    today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');

  const yest = new Date(Date.now() - 86400000);
  const yesterdayStr =
    yest.getFullYear() + '-' +
    String(yest.getMonth() + 1).padStart(2, '0') + '-' +
    String(yest.getDate()).padStart(2, '0');

  const [, mo, day] = dateStr.split('-');
  const base = `${parseInt(mo)}月${parseInt(day)}日`;
  if (dateStr === todayStr)     return base + ' (今天)';
  if (dateStr === yesterdayStr) return base + ' (昨日)';
  return base;
}
