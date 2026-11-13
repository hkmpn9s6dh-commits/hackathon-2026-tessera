#!/usr/bin/env bash
# Everything a judge — or a fresh clone — can re-run.
#
#   bash scripts/verify.sh          # typecheck, unit, build, CLI behaviour, browser e2e
#   bash scripts/verify.sh --fast   # skips the build and the browser pass
set -uo pipefail

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

if ! command -v npm >/dev/null 2>&1; then
  export PATH="/c/Users/张一/.workbuddy/binaries/node/versions/22.22.2-6:$PATH"
fi

fail=0
say() { printf '%-54s %s\n' "$1" "$2"; }
ok() { say "$1" "PASS"; }
bad() { say "$1" "FAIL"; fail=$((fail + 1)); }

mkdir -p tmp
echo "Tessera verification $( [ $FAST -eq 1 ] && echo '(fast)' || echo '(full)' )"
echo "--------------------------------------------------------------------"

command -v node >/dev/null 2>&1 && ok "node available ($(node -v))" || bad "node available"
command -v npm >/dev/null 2>&1 && ok "npm available" || bad "npm available"
[ -d node_modules ] || npm install --silent >/dev/null 2>&1
[ -d node_modules ] && ok "dependencies installed" || bad "dependencies installed"

if npx tsc --noEmit --pretty false >tmp/ts-tsc.log 2>&1; then ok "typescript type check"; else bad "typescript type check"; tail -8 tmp/ts-tsc.log; fi

if npx vitest run --reporter=dot >tmp/ts-unit.log 2>&1; then
  ok "unit checks ($(grep -oE 'Tests +[0-9]+ passed' tmp/ts-unit.log | head -1 || echo '?'))"
else
  bad "unit checks"; tail -20 tmp/ts-unit.log
fi

if [ $FAST -eq 0 ]; then
  if npm run build >tmp/ts-build.log 2>&1; then ok "production build"; else bad "production build"; tail -16 tmp/ts-build.log; fi
  for artefact in dist/index.html; do
    [ -f "$artefact" ] && ok "published: $artefact" || bad "published: $artefact"
  done
  if grep -q 'src="\./assets/' dist/index.html && grep -q 'href="\./assets/' dist/index.html; then
    ok "asset paths are relative (repository subpath)"
  else
    bad "asset paths are relative (repository subpath)"
  fi
  if ls dist/assets/*.woff2 >/dev/null 2>&1; then ok "fonts are bundled and hashed"; else bad "fonts are bundled and hashed"; fi
  if grep -rqi "fonts.googleapis\|fonts.gstatic" dist src; then bad "no font CDN"; else ok "no font CDN"; fi
fi

# --- the four claims, checked through the same CLI a stranger would use
if node bin/tessera.mjs verify proof/samples/clean.tessera >tmp/ts-clean.log 2>&1; then
  ok "AC-1 clean bundle verifies"
else
  bad "AC-1 clean bundle verifies"; tail -6 tmp/ts-clean.log
fi

if node bin/tessera.mjs verify proof/samples/tampered.tessera >tmp/ts-dirty.log 2>&1; then
  bad "AC-2 tampered bundle fails"
else
  if grep -q "step 4" tmp/ts-dirty.log && grep -q "result" tmp/ts-dirty.log; then
    ok "AC-2 tampered bundle fails at step 4 / result"
  else
    bad "AC-2 tampered bundle names the step and field"; cat tmp/ts-dirty.log
  fi
fi

if node bin/tessera.mjs verify proof/samples/forged.tessera >tmp/ts-forged.log 2>&1; then
  bad "AC-3 forged bundle fails"
else
  grep -q "signature" tmp/ts-forged.log && ok "AC-3 forged bundle fails on the signature" || { bad "AC-3 forged bundle fails on the signature"; cat tmp/ts-forged.log; }
fi

node bin/tessera.mjs prove proof/samples/clean.tessera --step 4 --out tmp/ts-proof.json >/dev/null 2>&1
if node bin/tessera.mjs check-proof tmp/ts-proof.json >tmp/ts-proof.log 2>&1; then
  ok "AC-6 disclosure proof verifies alone"
else
  bad "AC-6 disclosure proof verifies alone"; cat tmp/ts-proof.log
fi

if node bin/tessera.mjs selfcheck --rounds 100 >tmp/ts-self.log 2>&1; then
  ok "AC-7 100/100 mutations located to step and field"
else
  bad "AC-7 localisation"; tail -6 tmp/ts-self.log
fi

if node bin/tessera.mjs anchor proof/samples/clean.tessera >tmp/ts-anchor.log 2>&1; then
  ok "anchor data root recomputes"
else
  bad "anchor data root recomputes"; tail -6 tmp/ts-anchor.log
fi

if node bin/tessera.mjs demo --out tmp/ts-again.tessera --twice >tmp/ts-twice.log 2>&1; then
  ok "AC-12 two seals produce the same root"
else
  bad "AC-12 reproducibility"; tail -4 tmp/ts-twice.log
fi

[ -f LICENSE ] && grep -qi "MIT License" LICENSE && ok "MIT licence present" || bad "MIT licence present"
[ -f README.md ] && grep -q "scripts/verify.sh" README.md && ok "README documents the verification" || bad "README documents the verification"
for doc in docs/00-BRIEF.md docs/01-SPEC.md docs/02-PROTOCOL.md docs/04-PROOF.md docs/05-SUBMISSION.md docs/07-UI.md; do
  [ -f "$doc" ] && ok "$doc" || bad "$doc"
done

if grep -rIlP '[\x{4e00}-\x{9fff}]' src index.html README.md 2>/dev/null | head -3 | grep -q .; then
  bad "visitor-facing copy is English"
else
  ok "visitor-facing copy is English"
fi

if grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  -E "(sk-[a-zA-Z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,})" . >tmp/ts-secrets.log 2>&1; then
  bad "no credentials in the repository"; head -3 tmp/ts-secrets.log
else
  ok "no credentials in the repository"
fi

if grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude=verify.sh --exclude=*.md \
  -E "(google-analytics|googletagmanager|plausible\.io|segment\.io|hotjar)" src index.html >tmp/ts-analytics.log 2>&1; then
  bad "no third-party analytics"; head -3 tmp/ts-analytics.log
else
  ok "no third-party analytics"
fi

if [ $FAST -eq 0 ]; then
  if node scripts/e2e.mjs >tmp/ts-e2e.log 2>&1; then
    ok "browser end-to-end ($(grep -oE '[0-9]+/[0-9]+ checks passed' tmp/ts-e2e.log | head -1 || echo '?'))"
  else
    bad "browser end-to-end"; tail -24 tmp/ts-e2e.log
  fi
fi

echo "--------------------------------------------------------------------"
if [ $fail -eq 0 ]; then echo "all checks passed"; else echo "$fail check(s) failed"; fi
exit $(( fail > 0 ? 1 : 0 ))
