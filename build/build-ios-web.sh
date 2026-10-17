#!/bin/bash
# Copies the web app (same as Android: app/ + bundled fonts) into ios/www for the iOS project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$ROOT/ios/www"
VERSION=$(node -p "require('$ROOT/package.json').version")
CODE=$(node -p "const [a,b,c]='$VERSION'.split('.').map(Number); a*10000+b*100+c")
rm -rf "$W" && mkdir -p "$W"
cp -r "$ROOT/app/." "$W/" && rm -f "$W/assets/legacy-logo.jpg"
cp /usr/share/fonts/truetype/liberation/Liberation{Sans,Serif,Mono}-*.ttf "$W/fonts/"
cp /usr/share/fonts/truetype/crosextra/{Carlito,Caladea}-*.ttf "$W/fonts/"
# version of the iOS app = version of the project
sed -i -E "s/MARKETING_VERSION: \"[0-9.]+\"/MARKETING_VERSION: \"$VERSION\"/; s/CURRENT_PROJECT_VERSION: \"[0-9]+\"/CURRENT_PROJECT_VERSION: \"$CODE\"/" "$ROOT/ios/project.yml"
du -sh "$W"
