#!/bin/sh
# Builds dist/ACM-Docs-Setup.exe (Windows 10/11, 64 bit) from Linux.
set -e
cd "$(dirname "$0")/.."
rm -rf dist/win-unpacked dist/win-ia32-unpacked dist/ACM-Docs-Setup.exe
npx electron-builder --win --dir --x64
node build/set-exe-info.js "dist/win-unpacked/ACM Docs.exe"
build/trim.sh dist/win-unpacked
cd build && makensis -V2 -DVERSION=$(node -p "require('../package.json').version") installer.nsi
ls -la ../dist/ACM-Docs-Setup.exe
