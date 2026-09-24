#!/bin/sh
# 一次性验收：样例重放 + 单元测试 + 生产构建检查 + HTTP 冒烟。
# 所有步骤执行完毕后自行退出，并以退出码报告总结果（0 通过 / 1 失败）。
set -u
cd /app
status=0

step() {
  echo
  echo "=================================================="
  echo "== $1"
  echo "=================================================="
}

step "1/4 样例重放：互补规范化 / 最大兼容集 / 候选三分类"
if npx tsx verify/replay.ts; then
  echo ">> 样例重放通过"
else
  echo ">> 样例重放失败"
  status=1
fi

step "2/4 单元测试 (vitest run)"
if npm run test; then
  echo ">> 单元测试通过"
else
  echo ">> 单元测试失败"
  status=1
fi

step "3/4 生产构建检查 (tsc && vite build)"
if npm run build; then
  echo ">> 生产构建检查通过"
else
  echo ">> 生产构建检查失败"
  status=1
fi

step "4/4 HTTP 冒烟 (web 静态服务)"
WEB="http://${WEB_HOST:-web}"
echo "目标: $WEB"
i=0
health=0
while [ "$i" -lt 30 ]; do
  if wget -q -O- "$WEB/healthz" 2>/dev/null | grep -q ok; then
    health=1
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ "$health" -eq 1 ]; then
  echo ">> 健康检查通过: GET $WEB/healthz -> 200 ok"
else
  echo ">> 健康检查失败: GET $WEB/healthz"
  status=1
fi
if wget -q -O- "$WEB/" 2>/dev/null | grep -q 'id="root"'; then
  echo ">> 首页冒烟通过: GET $WEB/ 含挂载点"
else
  echo ">> 首页冒烟失败: GET $WEB/"
  status=1
fi

echo
echo "=================================================="
if [ "$status" -eq 0 ]; then
  echo "验收通过，verify 退出码: 0"
else
  echo "验收失败，verify 退出码: 1"
fi
echo "=================================================="
exit "$status"
