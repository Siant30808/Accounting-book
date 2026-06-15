import { useMemo } from 'react';

export interface TimeTheme {
  key:        'night' | 'morning' | 'noon' | 'evening' | 'latenight';
  fabBg:      string;
  fabShadow:  string;
}

export function useTimeTheme(): TimeTheme {
  return useMemo(() => {
    const h = new Date().getHours();
    if (h < 6)  return { key: 'night',     fabBg: 'rgba(63,81,181,.32)',  fabShadow: '#3F51B5' };
    if (h < 12) return { key: 'morning',   fabBg: 'rgba(255,140,0,.28)',  fabShadow: '#E65100' };
    if (h < 17) return { key: 'noon',      fabBg: 'rgba(21,101,192,.28)', fabShadow: '#1565C0' };
    if (h < 20) return { key: 'evening',   fabBg: 'rgba(123,31,162,.32)', fabShadow: '#7B1FA2' };
                return { key: 'latenight', fabBg: 'rgba(30,30,80,.35)',   fabShadow: '#1E1E50' };
  }, []);
}
