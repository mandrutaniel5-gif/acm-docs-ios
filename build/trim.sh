#!/bin/sh
# Keep only the Romanian and English UI languages of Chromium (smaller installer).
cd "$1/locales" && for f in *.pak; do case "$f" in en-US.pak|ro.pak) ;; *) rm -f "$f";; esac; done
