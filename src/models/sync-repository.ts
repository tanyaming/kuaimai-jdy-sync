import { getDb, persistDb } from './database';

/**
 * 获取上次同步时间
 */
export function getLastSyncTime(syncType: string = 'order'): string | null {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT last_sync_time FROM sync_state WHERE sync_type = ? ORDER BY id DESC LIMIT 1'
  );
  stmt.bind([syncType]);
  if (stmt.step()) {
    const row = stmt.getAsObject() as { last_sync_time: string };
    stmt.free();
    return row.last_sync_time;
  }
  stmt.free();
  return null;
}

/**
 * 更新最后一次同步时间
 */
export function updateLastSyncTime(time: string, syncType: string = 'order') {
  const db = getDb();
  db.run(
    "INSERT INTO sync_state (last_sync_time, sync_type, updated_at) VALUES (?, ?, datetime('now', 'localtime'))",
    [time, syncType]
  );
  persistDb();
}

/**
 * 检查订单是否已经同步过（且状态未变）
 */
export function isOrderSynced(
  orderId: string,
  shopId: string,
  orderStatus: string
): boolean {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT order_status, jiyun_data_id FROM order_sync_log WHERE order_id = ? AND shop_id = ?'
  );
  stmt.bind([orderId, shopId]);
  if (stmt.step()) {
    const row = stmt.getAsObject() as {
      order_status: string;
      jiyun_data_id: string | null;
    };
    stmt.free();
    // 有记录且状态未变且已写入简道云 → 已同步
    if (row.order_status === orderStatus && row.jiyun_data_id) {
      return true;
    }
    return false;
  }
  stmt.free();
  return false;
}

/**
 * 记录订单同步
 */
export function recordOrderSync(
  orderId: string,
  shopId: string,
  platformOrderNo: string,
  orderStatus: string,
  jiyunDataId: string
) {
  const db = getDb();

  // 先检查是否存在
  const stmt = db.prepare(
    'SELECT id FROM order_sync_log WHERE order_id = ? AND shop_id = ?'
  );
  stmt.bind([orderId, shopId]);
  const exists = stmt.step();
  stmt.free();

  if (exists) {
    db.run(
      `UPDATE order_sync_log SET
         order_status = ?,
         jiyun_data_id = ?,
         last_sync_at = datetime('now', 'localtime'),
         sync_count = sync_count + 1
       WHERE order_id = ? AND shop_id = ?`,
      [orderStatus, jiyunDataId, orderId, shopId]
    );
  } else {
    db.run(
      `INSERT INTO order_sync_log (order_id, shop_id, platform_order_no, order_status, jiyun_data_id)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, shopId, platformOrderNo, orderStatus, jiyunDataId]
    );
  }
  persistDb();
}

/**
 * 记录同步错误
 */
export function recordSyncError(
  orderId: string | null,
  errorType: string,
  errorMessage: string,
  requestBody?: string
) {
  const db = getDb();
  db.run(
    "INSERT INTO sync_error_log (order_id, error_type, error_message, request_body, created_at) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))",
    [orderId, errorType, errorMessage, requestBody || null]
  );
  persistDb();
}
