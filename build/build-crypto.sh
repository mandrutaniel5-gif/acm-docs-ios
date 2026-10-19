#!/bin/bash
# Builds the .acm encryption core into app/vendor/acmcrypto.js (and the iOS copy).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/node_modules/.bin/esbuild" "$ROOT/build/vendor/acmcrypto.js" --bundle --minify --format=iife \
  --target=chrome69,safari15 --legal-comments=eof --outfile="$ROOT/app/vendor/acmcrypto.js"
[ -d "$ROOT/ios/www/vendor" ] && cp "$ROOT/app/vendor/acmcrypto.js" "$ROOT/ios/www/vendor/acmcrypto.js"
ls -la "$ROOT/app/vendor/acmcrypto.js"
"$ROOT/node_modules/.bin/esbuild" "$ROOT/build/vendor/firebase.js" --bundle --minify --format=iife \
  --target=chrome69,safari15 --legal-comments=eof --outfile="$ROOT/app/vendor/firebase.js"
[ -d "$ROOT/ios/www/vendor" ] && cp "$ROOT/app/vendor/firebase.js" "$ROOT/ios/www/vendor/firebase.js"
ls -la "$ROOT/app/vendor/firebase.js"
