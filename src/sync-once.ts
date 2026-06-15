/**
 * 单次执行同步（调试/手动触发用）
 * 用法: npx tsx src/sync-once.ts
 */
import { runSync } from './core/sync-engine';
import { logger } from './utils/logger';
import { checkConfig } from './utils/config';
import { initDb, closeDb } from './models/database';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  快麦ERP → 简道云 单次同步');
  console.log('═══════════════════════════════════════\n');

  // 检查配置
  const missingKeys = checkConfig();
  if (missingKeys.length > 0) {
    logger.error(
      { missingKeys },
      `缺少必要配置，请检查 .env 文件中的以下字段: ${missingKeys.join(', ')}`
    );
    process.exit(1);
  }

  // 初始化数据库
  await initDb();

  logger.info('配置检查通过，开始同步...\n');

  // 执行同步
  const result = await runSync();

  console.log('\n═══════════════════════════════════════');
  console.log('  同步结果');
  console.log('═══════════════════════════════════════');
  console.log(`  时间范围: ${result.startTime} → ${result.endTime}`);
  console.log(`  总订单数: ${result.totalOrders}`);
  console.log(`  新增: ${result.created}`);
  console.log(`  更新: ${result.updated}`);
  console.log(`  跳过: ${result.skipped}`);
  console.log(`  失败: ${result.errors}`);
  console.log('═══════════════════════════════════════\n');

  // 清理
  closeDb();
}

main().catch((err) => {
  logger.error({ error: err }, '同步程序异常退出');
  closeDb();
  process.exit(1);
});
