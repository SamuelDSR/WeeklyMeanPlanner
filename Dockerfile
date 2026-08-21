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
# --include=optional 是明写出来的：sharp 的原生库是 optionalDependencies，
# 一旦环境里有 omit=optional 之类的配置，它们就不会被装上，
# 而 sharp 报出来的错会是一个完全看不懂的 TypeError（见 README 排错那节）。
RUN npm ci --omit=dev --include=optional

# 构建时就把 sharp 加载一遍。原生库和平台不匹配的话，
# 让它**在这里**失败 —— 而不是部署之后容器反复重启、报一个牛头不对马嘴的错。
RUN node -e "const s=require('sharp'); console.log('sharp ok, libvips', s.versions.vips, process.arch, process.platform)" 

COPY server/ ./
# 把上一阶段构建好的前端静态文件拷进来，Express 会直接托管这个目录
COPY --from=frontend-build /app/frontend/dist ./public

RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 3000
CMD ["node", "src/index.js"]
