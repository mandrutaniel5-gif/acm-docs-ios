#!/bin/sh
# Builds dist/ACM-Docs-Setup.exe (Windows 7+, 32/64 bit) from Linux.
set -e
cd "$(dirname "$0")/.."
rm -rf dist/win-ia32-unpacked dist/ACM-Docs-Setup.exe
npx electron-builder --win --dir --ia32
node build/set-exe-info.js "dist/win-ia32-unpacked/ACM Docs.exe"
build/trim.sh dist/win-ia32-unpacked
cd build && makensis -V2 -DVERSION=$(node -p "require('../package.json').version") installer.nsi
ls -la ../dist/ACM-Docs-Setup.exe
