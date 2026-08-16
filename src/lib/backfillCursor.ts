import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../..', 'data');
const BACKFILL_CURSOR_FILE = path.join(DATA_DIR, 'backfill-cursor.json');

export function loadBackfillCursor(): Date {
  try {
    if (fs.existsSync(BACKFILL_CURSOR_FILE)) {
      const { lastBackfill } = JSON.parse(fs.readFileSync(BACKFILL_CURSOR_FILE, 'utf8'));
      const d = new Date(lastBackfill);
      if (!isNaN(d.getTime())) return d;
    }
  } catch { /* 文件损坏时重新初始化 */ }
  // 默认上一次补偿时间为很久以前（0），确保首次启动立即执行一次补偿
  return new Date(0);
}

export function saveBackfillCursor(t: Date): void {
  const dir = path.dirname(BACKFILL_CURSOR_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BACKFILL_CURSOR_FILE, JSON.stringify({ lastBackfill: t.toISOString() }), 'utf8');
}
