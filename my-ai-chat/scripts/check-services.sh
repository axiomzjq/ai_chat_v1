#!/bin/bash
# ============================================================
# 服务健康检查脚本
# 用法: ./scripts/check-services.sh
# 检查项: PostgreSQL | PM2 后端 | PM2 前端 | 端口监听 | HTTP 健康
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"

ERRORS=0

echo "========================================"
echo "  AI Chat 服务健康检查"
echo "========================================"
echo ""

# 1. PostgreSQL
echo -n "[1/5] PostgreSQL 16      ... "
if sudo systemctl is-active postgresql-16 >/dev/null 2>&1; then
  echo -e "$PASS 运行中"
else
  echo -e "$FAIL 未运行"
  ERRORS=$((ERRORS + 1))
fi

# 2. PM2 后端
echo -n "[2/5] PM2 后端服务      ... "
if pm2 describe ai-chat-backend >/dev/null 2>&1; then
  STATUS=$(pm2 jlist 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$STATUS" = "online" ]; then
    echo -e "$PASS 运行中 ($STATUS)"
  else
    echo -e "$FAIL 状态异常 ($STATUS)"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo -e "$FAIL 未注册到 PM2"
  ERRORS=$((ERRORS + 1))
fi

# 3. PM2 前端
echo -n "[3/5] PM2 前端服务      ... "
if pm2 describe ai-chat-frontend >/dev/null 2>&1; then
  STATUS=$(pm2 jlist 2>/dev/null | grep -o '"status":"[^"]*"' | sed -n '2p' | cut -d'"' -f4)
  if [ "$STATUS" = "online" ]; then
    echo -e "$PASS 运行中 ($STATUS)"
  else
    echo -e "$FAIL 状态异常 ($STATUS)"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo -e "$FAIL 未注册到 PM2"
  ERRORS=$((ERRORS + 1))
fi

# 4. 端口监听
echo -n "[4/5] 端口 3001/5173    ... "
if ss -tlnp 2>/dev/null | grep -q ':3001\>' && ss -tlnp 2>/dev/null | grep -q ':5173\>'; then
  echo -e "$PASS 正常监听"
else
  echo -e "$FAIL 端口未监听"
  ERRORS=$((ERRORS + 1))
fi

# 5. HTTP 健康检查
echo -n "[5/5] HTTP 健康检查     ... "
BACKEND_OK=false
FRONTEND_OK=false

if curl -s --connect-timeout 3 http://localhost:3001/health >/dev/null 2>&1; then
  BACKEND_OK=true
fi

if curl -s --connect-timeout 3 -o /dev/null -w "%{http_code}" http://localhost:5173 >/dev/null 2>&1; then
  FRONTEND_OK=true
fi

if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then
  echo -e "$PASS 后端+前端均正常"
elif [ "$BACKEND_OK" = true ]; then
  echo -e "$WARN 后端正常，前端异常"
  ERRORS=$((ERRORS + 1))
elif [ "$FRONTEND_OK" = true ]; then
  echo -e "$WARN 前端正常，后端异常"
  ERRORS=$((ERRORS + 1))
else
  echo -e "$FAIL 后端+前端均异常"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "========================================"
if [ $ERRORS -eq 0 ]; then
  echo -e "  检查结果: ${GREEN}全部正常${NC}"
else
  echo -e "  检查结果: ${RED}发现 $ERRORS 个问题${NC}"
  echo ""
  echo "  常用修复指令:"
  echo "    pm2 restart all          # 重启前后端"
  echo "    pm2 logs                 # 查看日志"
  echo "    sudo systemctl restart postgresql-16   # 重启数据库"
fi
echo "========================================"

exit $ERRORS
