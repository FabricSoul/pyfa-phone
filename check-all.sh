#!/usr/bin/env bash
# 全部闸门。任何一个红就退出非零。
set -e
cd "$(dirname "$0")"
echo "▸ TypeScript"   && npx tsc --noEmit
echo "▸ 单元测试"      && npx vitest run
echo "▸ 生产构建"      && npx vite build >/dev/null
echo
echo "全部闸门通过 ✅"
