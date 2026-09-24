# syntax=docker/dockerfile:1

# 依赖层：web 构建与 verify 验收共用
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 一次性验收服务：样例重放 + 单元测试 + 生产构建检查 + HTTP 冒烟
FROM deps AS verify
COPY . .
RUN chmod +x verify/run.sh
CMD ["sh", "verify/run.sh"]

# 生产构建：tsc 类型检查 + vite 产物
FROM deps AS build
COPY . .
RUN npm run build

# 静态发布：nginx 托管 dist，无业务后端
FROM nginx:alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
