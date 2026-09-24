# 系统发育分裂审计（split-audit）

纯浏览器运行的 TypeScript + React 审计页：同批形态证据提出互相冲突的候选分裂时，
逐条接受高权候选可能堵死总证据更强的组合，本应用在候选分裂中**精确**选取两两兼容集合。

- 无业务后端、不调用任何在线服务；静态站点由 Dockerfile 构建、Docker Compose 发布
- 宿主机端口可配置（`WEB_PORT`，默认 8080）
- Web 提供 HTTP 健康检查 `GET /healthz`
- Compose 中名为 `verify` 的一次性验收服务：重放样例 + 单元测试 + 生产构建检查 + HTTP 冒烟，随后自行退出并报告退出码

## 规则

**输入**

- 物种：4–12 个唯一 ASCII 名（可打印 ASCII、不含空白与保留字符 `|` `:`），空白或逗号分隔
- 候选分裂：1–28 个，每行 `权重: 侧A | 侧B`
  - 权重为正整数；冒号可省；侧B 可省（取补集）
  - 非平凡：两侧均须 ≥2 个物种
  - 互补分裂视为同一项，重复者拒绝
- 非法输入保留原文，仅就地提示错误，全部合法后才计算

**兼容与选取**

- 两个分裂仅在四种两侧交集（A∩C、A∩D、B∩C、B∩D）至少一个为空时兼容
- 精确选取两两兼容集合：先最大化总权重，再最大化分裂数量，
  并以规范分裂序列（规范侧＝不含首个物种的一侧，名按字典序）字典序最小者作为展示解
- 按全部前两级（总权重、数量）同优解把候选标为：
  **必选**＝出现在每个同优解；**可选**＝出现在部分同优解；**从不选**＝不出现在任何同优解
- 页面联动展示兼容矩阵与分裂表（悬停互相同步高亮）

**实现要点**：分裂以位掩码表示并做互补规范化；求解为分支定界
（位掩码候选集、剩余权重和上界、相容分裂集大小 ≤ n−3 的数量剪枝）；
字典序最小解按规范标签升序「可行即选」贪心确定；三分类由各候选的
含/不含约束最优化判定。`tests/` 内含与暴力枚举对照的随机化测试。

## 运行（Docker）

```bash
# 启动静态 Web（默认 http://localhost:8080，健康检查 /healthz）
docker compose up -d web

# 自定义宿主机端口
WEB_PORT=9000 docker compose up -d web

# 一键验收：构建并运行 verify，退出码即验收结果（0 通过 / 1 失败）
docker compose up --exit-code-from verify verify
echo $?
```

`verify` 依次执行：① 样例重放（互补规范化 / 最大兼容集 / 候选三分类）
② 单元测试（vitest） ③ 生产构建检查（tsc && vite build） ④ 对 `web` 的
HTTP 冒烟（/healthz 与首页），全部完成后自行退出并打印退出码。

## 本地开发

```bash
npm install
npm run dev      # 开发服务器
npm run test     # 单元测试（含暴力枚举对照）
npm run replay   # 样例重放
npm run build    # 生产构建（tsc && vite build）
```

## 目录结构

```
src/lib/splits.ts        核心领域逻辑（解析、规范化、兼容性、精确求解、三分类）
src/App.tsx              页面装配与状态
src/components/          分裂表与兼容矩阵（联动高亮）
tests/splits.test.ts     单元测试 + 暴力枚举对照
verify/replay.ts         验收样例重放
verify/run.sh            verify 服务入口（四步验收）
Dockerfile               多阶段：deps / verify / build / web(nginx)
docker-compose.yml       web（端口可配、健康检查）+ verify（一次性）
nginx.conf               静态托管、SPA 回退、/healthz
```
