# ---------- 阶段一：构建前端静态文件 ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- 阶段二：后端运行环境 ----------
FROM node:20-alpine AS backend
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./
# 把上一阶段构建好的前端静态文件拷进来，Express 会直接托管这个目录
COPY --from=frontend-build /app/frontend/dist ./public

RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 3000
CMD ["node", "src/index.js"]
