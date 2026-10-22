#!/bin/sh
# Builds dist/ACM-Docs-Control-Setup.exe (Windows 10/11, 64 bit) from Linux.
set -e
cd "$(dirname "$0")/.."
rm -rf ../dist/control ../dist/ACM-Docs-Control-Setup.exe
../node_modules/.bin/electron-builder --win --dir --x64 --projectDir .
node build/set-exe-info.js "../dist/control/win-unpacked/ACM Docs Control.exe"
../build/trim.sh ../dist/control/win-unpacked
cd build && makensis -V2 -DVERSION=$(node -p "require('../package.json').version") installer.nsi
ls -la ../../dist/ACM-Docs-Control-Setup.exe
