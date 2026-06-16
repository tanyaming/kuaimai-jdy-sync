# 快麦ERP → 简道云 订单同步服务

将快麦ERP中的订单数据定时同步到简道云，用于成本和利润分析。

## 快速开始

### 1. 配置

复制 `.env.example` 为 `.env`，填入真实配置：

```bash
cp .env.example .env
```

```env
# 快麦 ERP（从快麦开放平台获取）
KUAIMAI_APP_KEY=your_app_key
KUAIMAI_APP_SECRET=your_app_secret
KUAIMAI_BASE_URL=https://open.kuaimai.com/api

# 简道云（从简道云开放平台获取）
JIYUN_API_KEY=your_api_key
JIYUN_BASE_URL=https://api.jiandaoyun.com
JIYUN_APP_ID=your_app_id
JIYUN_ORDER_ENTRY_ID=your_order_entry_id

# 同步间隔（分钟）
SYNC_INTERVAL_MINUTES=5
```

### 2. 检查连接

```bash
npm run sync:check
```

### 3. 单次手动同步（调试）

```bash
npm run sync:once
```

### 4. 启动定时服务

```bash
npm run dev
```

## 项目结构

```
kuaimai-jdy-sync/
├── src/
│   ├── index.ts              # 主入口（定时服务）
│   ├── sync-once.ts          # 单次手动同步
│   ├── check.ts              # 连接检查
│   ├── core/
│   │   └── sync-engine.ts    # 核心同步引擎
│   ├── integrations/
│   │   ├── kuaimai-client.ts # 快麦 API 客户端
│   │   └── jiyun-client.ts   # 简道云 API 客户端
│   ├── models/
│   │   ├── database.ts       # SQLite 数据库
│   │   └── sync-repository.ts # 同步状态仓储
│   └── utils/
│       ├── config.ts         # 配置管理
│       └── logger.ts         # 日志
├── data/                     # SQLite 数据库文件（自动创建）
├── .env                      # 环境变量（不提交 git）
└── package.json
```

## 同步逻辑

1. 从快麦拉取指定时间窗口内的订单（分页）
2. 对比本地去重表 + 简道云查询，判断新增/更新
3. 转换字段格式，写入简道云
4. 更新本地同步状态

## 简道云表单字段映射

见 `src/core/sync-engine.ts` 中的 `mapOrderToJiyunFields()` 函数。

## 部署到服务器

```bash
# 方式一：PM2
npm install -g pm2
pm2 start dist/index.js --name kuaimai-jdy-sync
pm2 save
pm2 startup

# 方式二：systemd
# 见 deploy/kuaimai-jdy-sync.service
```

## 生产构建

```bash
npm run build
npm start
```
