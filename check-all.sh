#!/usr/bin/env bash
# 全部闸门。任何一个红就退出非零。
set -e
cd "$(dirname "$0")"
echo "▸ TypeScript"   && npx tsc --noEmit
echo "▸ i18n 文字检查" && node etl/i18n_check_literals.mjs
echo "▸ i18n 脚本测试" && node --test 'etl/*.test.mjs'
echo "▸ 单元测试"      && npx vitest run
if [[ ! -f build/eve.db || ! -f public/data/manifest.json ]]; then
  echo "▸ 生成游戏数据" && pnpm etl
fi
echo "▸ 打包 Python 引擎" && node etl/40_bundle_py.mjs
echo "▸ 数值对拍" && node etl/parity/run_parity.mjs
echo "▸ 生产构建"      && npx vite build >/dev/null
echo
echo "全部闸门通过 ✅"
