/**
 * 快麦ERP → 简道云 定时同步服务
 *
 * 核心功能：
 * 1. 定时从快麦ERP拉取订单数据
 * 2. 转换后写入简道云表单
 * 3. 支持增量同步、去重、错误重试
 *
 * 用法:
 *   npx tsx src/index.ts          # 开发运行（带定时）
 *   npx tsx src/sync-once.ts      # 单次手动同步（调试用）
 *   npm run build && npm start    # 生产运行
 */
import { CronJob } from 'cron';
import { config } from './utils/config';
import { logger } from './utils/logger';
import { checkConfig } from './utils/config';
import { runSync, SyncResult } from './core/sync-engine';
import { initDb, closeDb } from './models/database';

// 优雅退出处理
let cronJob: CronJob | null = null;

function gracefulShutdown(signal: string) {
  logger.info(`收到 ${signal} 信号，正在优雅退出...`);
  if (cronJob) {
    cronJob.stop();
    logger.info('定时任务已停止');
  }
  closeDb();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function main() {
  console.log('\n');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║  快麦ERP → 简道云 订单同步服务            ║');
  console.log('  ║  Kuaimai ERP → Jiandaoyun Sync Service   ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // 配置检查
  const missingKeys = checkConfig();
  if (missingKeys.length > 0) {
    console.error(
      `❌ 缺少必要配置，请检查 .env 文件: ${missingKeys.join(', ')}`
    );
    process.exit(1);
  }
  console.log('✅ 配置检查通过\n');

  // 初始化数据库
  await initDb();
  logger.info('数据库初始化完成');

  const intervalMin = config.sync.intervalMinutes;
  logger.info(`定时同步间隔: 每 ${intervalMin} 分钟`);

  // 打印配置摘要（隐藏敏感信息）
  console.log('  快麦 API 地址:', config.kuaimai.baseUrl);
  console.log('  快麦 APP_KEY:', config.kuaimai.appKey.substring(0, 8) + '***');
  console.log('  简道云 API 地址:', config.jiyun.baseUrl);
  console.log('  简道云 应用ID:', config.jiyun.appId);
  console.log('  简道云 订单表单ID:', config.jiyun.orderEntryId);
  console.log('  首次回溯天数:', config.sync.lookbackDays, '天');
  console.log('');

  // 启动时立即执行一次同步
  logger.info('启动后立即执行首次同步...');
  try {
    const result: SyncResult = await runSync();
    logger.info(
      {
        total: result.totalOrders,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      },
      '首次同步完成'
    );
  } catch (error) {
    logger.error({ error }, '首次同步失败，但定时任务将继续运行');
  }

  // 设置定时任务（使用 cron 表达式）
  const cronExpr = `*/${intervalMin} * * * *`;
  logger.info(`定时任务已设置: ${cronExpr}`);

  cronJob = new CronJob(
    cronExpr,
    async () => {
      logger.info('⏰ 定时同步触发');
      try {
        const result: SyncResult = await runSync();
        logger.info(
          {
            total: result.totalOrders,
            created: result.created,
            updated: result.updated,
            skipped: result.skipped,
            errors: result.errors,
          },
          '定时同步完成'
        );
      } catch (error) {
        logger.error({ error }, '定时同步失败');
      }
    },
    null, // onComplete
    true, // start
    'Asia/Shanghai'
  );

  console.log('  🚀 服务已启动，等待下个周期...');
  console.log('     按 Ctrl+C 退出\n');
}

main().catch((err) => {
  logger.error({ error: err }, '服务启动失败');
  closeDb();
  process.exit(1);
});
