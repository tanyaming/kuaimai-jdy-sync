import fs from 'fs';
import path from 'path';

const CURSOR_FILE = path.resolve(__dirname, '../..', 'data', 'sync-cursor.json');

export function loadCursor(): Date {
  try {
    if (fs.existsSync(CURSOR_FILE)) {
      const { lastSync } = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
      const d = new Date(lastSync);
      if (!isNaN(d.getTime())) return d;
    }
  } catch { /* 文件损坏时重新初始化 */ }
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d;
}

export function saveCursor(t: Date): void {
  const dir = path.dirname(CURSOR_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CURSOR_FILE, JSON.stringify({ lastSync: t.toISOString() }), 'utf8');
}
