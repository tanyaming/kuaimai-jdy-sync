# ── 构建阶段 ──
FROM node:22-alpine AS builder

WORKDIR /app

# 安装依赖（利用缓存层）
COPY package.json package-lock.json ./
RUN npm ci

# 编译 TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── 运行阶段 ──
FROM node:22-alpine

WORKDIR /app

# 只复制运行时需要的文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# 创建数据目录（游标持久化）
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DOTENV_PATH=/app/.env

ENTRYPOINT ["node", "dist/sync.js"]
