#!/bin/bash
# ACM Docs for Android: builds a signed .apk without Gradle (aapt2 + javac + dx + apksigner).
# Needs (Ubuntu): android-sdk-build-tools android-sdk-platform-23 dalvik-exchange, a JDK, zip.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK=/usr/lib/android-sdk
AJ=$SDK/platforms/android-23/android.jar
OUT="$ROOT/dist/android"
W="$OUT/work"
VERSION=$(node -p "require('$ROOT/package.json').version")
# 2.0.0 -> 20000 (major*10000 + minor*100 + patch)
CODE=$(node -p "const [a,b,c]='$VERSION'.split('.').map(Number); a*10000+b*100+c")
rm -rf "$W" && mkdir -p "$W/assets/www" "$W/cls" "$W/gen"

echo "== web app"
cp -r "$ROOT/app/." "$W/assets/www/" && rm -f "$W/assets/www/assets/legacy-logo.jpg"
cp /usr/share/fonts/truetype/liberation/Liberation{Sans,Serif,Mono}-*.ttf "$W/assets/www/fonts/"
cp /usr/share/fonts/truetype/crosextra/{Carlito,Caladea}-*.ttf "$W/assets/www/fonts/"

echo "== resources"
aapt2 compile --dir "$ROOT/android/res" -o "$W/res.zip"
aapt2 link -o "$W/base.apk" -I "$AJ" --manifest "$ROOT/android/AndroidManifest.xml" \
  --min-sdk-version 21 --target-sdk-version 34 --version-code "$CODE" --version-name "$VERSION" \
  -A "$W/assets" --java "$W/gen" "$W/res.zip"

echo "== code"
javac -source 8 -target 8 -bootclasspath "$AJ" -nowarn -Xlint:-options -encoding UTF-8 -d "$W/cls" \
  $(find "$ROOT/android/src" -name '*.java') "$W/gen/ro/acmcode/docs/R.java" 2>&1 | grep -v JAVA_TOOL_OPTIONS || true
dalvik-exchange --dex --min-sdk-version=21 --output="$W/classes.dex" "$W/cls" 2>&1 | grep -v JAVA_TOOL_OPTIONS || true
cp "$W/base.apk" "$W/unsigned.apk"
(cd "$W" && zip -q -j unsigned.apk classes.dex)

echo "== sign"
zipalign -f -p 4 "$W/unsigned.apk" "$W/aligned.apk"
PW=$(sed -n 's/^storePassword=//p' "$ROOT/build/android/keystore.properties")
mkdir -p "$OUT"
APK="$OUT/ACM-Docs-$VERSION.apk"
apksigner sign --ks "$ROOT/build/android/acmdocs-release.jks" --ks-key-alias acmdocs --ks-pass "pass:$PW" --key-pass "pass:$PW" \
  --min-sdk-version 21 --out "$APK" "$W/aligned.apk" 2>&1 | grep -v JAVA_TOOL_OPTIONS || true
apksigner verify "$APK" 2>&1 | grep -v JAVA_TOOL_OPTIONS || true
ls -la "$APK"
