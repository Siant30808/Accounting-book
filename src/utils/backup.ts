import AsyncStorage from '@react-native-async-storage/async-storage';
import { File as FSFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { STORAGE_KEYS } from '../types';
import { useBudgetStore, hydrateStore } from '../store/useBudgetStore';

const BACKUP_KEYS = [
  STORAGE_KEYS.TRANSACTIONS,
  STORAGE_KEYS.SETTINGS,
  STORAGE_KEYS.BG_SETTINGS,
  STORAGE_KEYS.FAB_POS,
  STORAGE_KEYS.BILLS,
  STORAGE_KEYS.BILL_DISMISS,
] as const;

/**
 * 將目前所有資料（記帳明細、設定、存款、桌布設定等）打包成一份 JSON 備份檔，
 * 並透過系統分享功能輸出。日後可用 importBackup() 還原。
 */
export async function exportBackup(): Promise<string> {
  const entries = await AsyncStorage.multiGet(BACKUP_KEYS);
  const data: Record<string, unknown> = {};
  entries.forEach(([key, value]) => {
    if (value !== null) data[key] = JSON.parse(value);
  });

  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2);

  const now = new Date();
  const fileName = `記帳本備份_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.json`;
  const file = new FSFile(Paths.document, fileName);
  if (!file.exists) file.create();
  file.write(payload);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: '匯出記帳本備份',
    });
    return '💾 備份檔已開啟分享視窗';
  }
  return '❌ 此裝置不支援分享功能';
}

/**
 * 選擇先前用 exportBackup() 匯出的 JSON 備份檔，還原所有資料（會覆蓋目前資料）。
 */
export async function importBackup(): Promise<string> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
  if (result.canceled) return '已取消';

  const file = new FSFile(result.assets[0].uri);
  const raw = await file.text();
  const parsed = JSON.parse(raw) as { version?: number; data?: Record<string, string | object> };

  if (!parsed.data) return '❌ 備份檔格式錯誤';

  const pairs: [string, string][] = BACKUP_KEYS
    .filter(key => parsed.data![key] !== undefined)
    .map(key => [key, JSON.stringify(parsed.data![key])]);

  if (!pairs.length) return '❌ 備份檔內容是空的';

  await AsyncStorage.multiSet(pairs);
  await hydrateStore();
  useBudgetStore.getState().checkPeriodRollover();

  return `✅ 已還原備份（${pairs.length} 項資料）`;
}
