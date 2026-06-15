/**
 * 快速检查脚本 — 验证各 API 连接
 * 用法: npx tsx src/check.ts
 */
import { config, checkConfig } from './utils/config';
import { queryOrderList } from './integrations/kuaimai-client';

function pad(n: number) { return String(n).padStart(2, '0'); }

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  连接检查');
  console.log('═══════════════════════════════════════\n');

  let allOk = true;

  // 1. 检查配置
  const missingKeys = checkConfig();
  if (missingKeys.length > 0) {
    console.log(`❌ 配置不完整，缺少: ${missingKeys.join(', ')}`);
    allOk = false;
  } else {
    console.log('✅ 配置检查通过');
  }

  // 2. 检查快麦连接
  console.log('\n--- 快麦 ERP 连接检查 ---');
  console.log(`   API 地址: https://gw.superboss.cc/router`);
  console.log(`   AppKey:   ${config.kuaimai.appKey}`);
  try {
    const now = new Date();
    const startTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 00:00:00`;
    const endTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 23:59:59`;

    const result = await queryOrderList({
      startTime,
      endTime,
      timeType: 'created',
      page: 1,
      pageSize: 2,
    });

    console.log('✅ 快麦 API 连接正常');
    console.log(`   success: ${result.success}`);
    console.log(`   订单列表条数: ${result.list?.length || 0}`);
    console.log(`   总订单数: ${result.total || result.totalCount || 'N/A'}`);

    if (result.list && result.list.length > 0) {
      const o = result.list[0];
      console.log('\n   示例订单:');
      console.log(`   店铺: ${o.shopName}  |  来源: ${o.source}  |  状态: ${o.unifiedStatus}`);
      console.log(`   总金额: ${o.totalFee}  |  实付: ${o.payment}  |  商品数: ${o.itemNum}`);
      console.log(`   子订单数: ${(o.orders || []).length}`);

      if (o.orders && o.orders.length > 0) {
        const item = o.orders[0];
        console.log(`   商品: ${item.title}`);
        console.log(`   规格: ${item.skuPropertiesName}`);
        console.log(`   数量: ${item.num}  |  单价: ${item.price}  |  实付: ${item.payment}`);
      }
    }
  } catch (error) {
    console.log('❌ 快麦 API 连接失败:', error instanceof Error ? error.message : error);
    allOk = false;
  }

  // 3. 检查简道云连接
  console.log('\n--- 简道云连接检查 ---');
  if (config.jiyun.appId && config.jiyun.orderEntryId) {
    console.log(`   App ID: ${config.jiyun.appId}`);
    console.log(`   Entry ID: ${config.jiyun.orderEntryId}`);
    console.log('   请在简道云后台创建好表单后，运行 npm run sync:once 测试数据写入');
  } else {
    console.log('⚠️  简道云 AppID 或 EntryID 未配置');
  }

  console.log('\n═══════════════════════════════════════');
  if (allOk) {
    console.log('  ✅ 快麦连接正常！下一步：配置简道云表单');
  } else {
    console.log('  ❌ 部分检查失败，请修复后重试');
  }
  console.log('═══════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('检查脚本异常:', err);
  process.exit(1);
});
