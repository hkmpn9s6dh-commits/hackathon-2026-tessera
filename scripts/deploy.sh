#!/usr/bin/env bash
# Publish dist/ to the gh-pages branch, which is what GitHub Pages serves.
# HTTPS pushes from this machine need HTTP/1.1 and a large buffer, or they drop mid-upload.
set -euo pipefail
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp -r dist/. "$TMP"/
cd "$TMP"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="CB" -c user.email="cb@example.invalid" commit -q -m "publish dist"
git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 push -f "$REMOTE" gh-pages
echo "published: $(git rev-parse --short HEAD)"
