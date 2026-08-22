# ---------- 阶段一：构建前端静态文件 ----------
FROM node:20-bullseye-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- 阶段二：后端运行环境 ----------
# 用 **bullseye**-slim（Debian 11，glibc 2.31），不是默认的 slim（bookworm，glibc 2.36）：
#
# glibc >= 2.34 会用 clone3 这个系统调用，而 Docker < 20.10.10 的默认 seccomp
# 配置把它挡掉了。libvips 重度用线程，于是原生库初始化就失败 ——
# 而这个失败抛出的错误没有 .code，正好踩中 sharp 那个坏掉的错误处理，
# 报出来是一句莫名其妙的 TypeError。
# 症状：老服务器（Debian 10 / glibc 2.28 / Docker 19.03）上必挂，新机器上一切正常。
#
# glibc 2.31 不用 clone3，所以老 Docker 也能跑。sharp 的预编译库要求 glibc >= 2.28，
# 2.31 满足。服务器上的 Docker 升到 >= 20.10.10 之后，可以换回 node:20-slim。
#
# 用 Debian（glibc）而不是 Alpine（musl）：
# sharp 的原生库按 (架构, libc) 分别预编译，musl 那一套是问题高发区 ——
# 一旦 npm 没按 libc 选对包，sharp 报出来的错还是个看不懂的 TypeError。
# glibc 这条路是 sharp 支持得最好的，换过来能少一整类事故。
# 代价：镜像大几十 MB。对这个应用来说，稳定比省空间重要。
FROM node:20-bullseye-slim AS backend
WORKDIR /app

COPY server/package.json server/package-lock.json ./
# --include=optional 是明写出来的：sharp 的原生库是 optionalDependencies，
# 一旦环境里有 omit=optional 之类的配置，它们就不会被装上，
# 而 sharp 报出来的错会是一个完全看不懂的 TypeError（见 README 排错那节）。
RUN npm ci --omit=dev --include=optional


COPY server/ ./

# 构建时就把 sharp 加载一遍：平台/libc 不匹配的话在**这里**失败，
# 而不是部署之后容器反复重启。
# 失败时自动跑 sharp-doctor：它绕过 sharp 那个坏掉的错误处理，
# 直接逐个加载 binding，把真正的报错（code + msg + ldd）打进构建日志。
RUN node -e "const s=require('sharp'); console.log('sharp ok, libvips', s.versions.vips, process.arch, process.platform)" \
 || (echo '=== sharp 加载失败，下面是真正的原因 ==='; node scripts/sharp-doctor.cjs; exit 1)
# 把上一阶段构建好的前端静态文件拷进来，Express 会直接托管这个目录
COPY --from=frontend-build /app/frontend/dist ./public

RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]

EXPOSE 3000
CMD ["node", "src/index.js"]
