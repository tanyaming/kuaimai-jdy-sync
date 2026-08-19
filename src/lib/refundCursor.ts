import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../..', 'data');
const REFUND_CURSOR_FILE = path.join(DATA_DIR, 'refund-cursor.json');

export function loadRefundCursor(): Date {
  try {
    if (fs.existsSync(REFUND_CURSOR_FILE)) {
      const { lastRefund } = JSON.parse(fs.readFileSync(REFUND_CURSOR_FILE, 'utf8'));
      const d = new Date(lastRefund);
      if (!isNaN(d.getTime())) return d;
    }
  } catch { /* 文件损坏时重新初始化 */ }
  // 默认很久以前，首次启动全量回看一段时间（由调用方决定窗口）
  return new Date(0);
}

export function saveRefundCursor(t: Date): void {
  const dir = path.dirname(REFUND_CURSOR_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REFUND_CURSOR_FILE, JSON.stringify({ lastRefund: t.toISOString() }), 'utf8');
}
