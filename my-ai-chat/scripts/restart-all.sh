#!/bin/bash
# ============================================================
# 一键重启所有服务脚本
# 功能: 重启前后端 PM2 服务 + 验证服务状态
# 用法: ./scripts/restart-all.sh [--skip-check]
# ============================================================

set -e

cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SKIP_CHECK=false
if [ "$1" = "--skip-check" ]; then
  SKIP_CHECK=true
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AI Chat 一键重启服务${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 检查 PM2 是否安装
echo -n "[1/5] 检查 PM2 ... "
if ! command -v pm2 &> /dev/null; then
  echo -e "${RED}未安装${NC}"
  echo "请先安装 PM2: sudo npm install -g pm2"
  exit 1
fi
echo -e "${GREEN}✓${NC}"

# 2. 检查 PM2 进程是否存在
echo -n "[2/5] 检查 PM2 进程 ... "
BACKEND_EXISTS=false
FRONTEND_EXISTS=false

if pm2 describe ai-chat-backend &>/dev/null; then
  BACKEND_EXISTS=true
fi
if pm2 describe ai-chat-frontend &>/dev/null; then
  FRONTEND_EXISTS=true
fi

if [ "$BACKEND_EXISTS" = true ] || [ "$FRONTEND_EXISTS" = true ]; then
  echo -e "${GREEN}✓${NC} (后端: $BACKEND_EXISTS, 前端: $FRONTEND_EXISTS)"
else
  echo -e "${YELLOW}⚠${NC} 未注册,需要重新启动"
fi

# 3. 重启服务
echo -e "\n[3/5] 重启服务 ..."

if [ "$BACKEND_EXISTS" = true ]; then
  echo "  → 重启后端 (ai-chat-backend)"
  pm2 restart ai-chat-backend
  sleep 2
else
  echo "  → 启动后端 (ai-chat-backend)"
  cd server && pm2 start index.js --name "ai-chat-backend"
  cd ..
fi

if [ "$FRONTEND_EXISTS" = true ]; then
  echo "  → 重启前端 (ai-chat-frontend)"
  pm2 restart ai-chat-frontend
  sleep 2
else
  echo "  → 启动前端 (ai-chat-frontend)"
  pm2 start npm --name "ai-chat-frontend" -- start
  sleep 2
fi

# 4. 等待服务启动
echo -e "\n[4/5] 等待服务启动 ..."
sleep 3

# 5. 检查服务状态
echo "  → 检查服务状态 ..."
BACKEND_OK=false
FRONTEND_OK=false

# 使用 pm2 jlist 并改进解析
BACKEND_STATUS=$(pm2 jlist 2>/dev/null | grep -A5 '"name":"ai-chat-backend"' | grep '"status":"' | head -1 | sed 's/.*"status":"\([^"]*\)".*/\1/')
FRONTEND_STATUS=$(pm2 jlist 2>/dev/null | grep -A5 '"name":"ai-chat-frontend"' | grep '"status":"' | head -1 | sed 's/.*"status":"\([^"]*\)".*/\1/')

# 如果为空，标记为 not_found
BACKEND_STATUS=${BACKEND_STATUS:-not_found}
FRONTEND_STATUS=${FRONTEND_STATUS:-not_found}

if [ "$BACKEND_STATUS" = "online" ]; then
  BACKEND_OK=true
  echo -e "    ✓ 后端: ${GREEN}online${NC}"
else
  echo -e "    ✗ 后端: ${RED}$BACKEND_STATUS${NC}"
fi

if [ "$FRONTEND_STATUS" = "online" ]; then
  FRONTEND_OK=true
  echo -e "    ✓ 前端: ${GREEN}online${NC}"
else
  echo -e "    ✗ 前端: ${RED}$FRONTEND_STATUS${NC}"
fi

# 6. 检查端口
echo -e "\n[5/5] 检查端口监听 ..."
PORT_3001=false
PORT_5173=false

if ss -tlnp 2>/dev/null | grep -q ':3001\>'; then
  PORT_3001=true
  echo -e "  ✓ 端口 3001: ${GREEN}监听中${NC}"
else
  echo -e "  ✗ 端口 3001: ${RED}未监听${NC}"
fi

if ss -tlnp 2>/dev/null | grep -q ':5173\>'; then
  PORT_5173=true
  echo -e "  ✓ 端口 5173: ${GREEN}监听中${NC}"
else
  echo -e "  ✗ 端口 5173: ${RED}未监听${NC}"
fi

# 最终结果
echo ""
echo -e "${BLUE}========================================${NC}"
ERRORS=0

if [ "$BACKEND_OK" = false ]; then
  ERRORS=$((ERRORS + 1))
fi
if [ "$FRONTEND_OK" = false ]; then
  ERRORS=$((ERRORS + 1))
fi
if [ "$PORT_3001" = false ]; then
  ERRORS=$((ERRORS + 1))
fi
if [ "$PORT_5173" = false ]; then
  ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}  重启成功！所有服务正常运行${NC}"
  echo ""
  echo "  访问地址:"
  echo "    前端: ${BLUE}http://localhost:5173${NC}"
  echo "    后端: ${BLUE}http://localhost:3001${NC}"
  echo "    健康: ${BLUE}http://localhost:3001/health${NC}"
else
  echo -e "${RED}  发现 $ERRORS 个问题，请检查日志${NC}"
  echo ""
  echo "  常用命令:"
  echo "    pm2 logs              # 查看日志"
  echo "    pm2 logs ai-chat-backend  # 后端日志"
  echo "    pm2 logs ai-chat-frontend # 前端日志"
  echo "    ./scripts/check-services.sh  # 完整检查"
fi

echo -e "${BLUE}========================================${NC}"
exit $ERRORS
