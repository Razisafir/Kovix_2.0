#!/bin/bash
# KOVIX Smoke Test — Verify build integrity and branding
set -e

echo "=== 1. Checking product.json ==="
node -e "const p=require('./product.json'); ['nameShort','nameLong','nameMedium','documentationUrl','downloadUrl','updateUrl','extensionsGallery','licenseUrl','privacyStatementUrl','productConfiguration','crashReporter'].forEach(k => { if(!p[k]) throw new Error('Missing: '+k); }); console.log('product.json ✅');"

echo "=== 2. Checking telemetry default ==="
grep -n "TelemetryConfiguration.OFF" src/vs/platform/telemetry/common/telemetryService.ts && echo "Telemetry OFF ✅"

echo "=== 3. Checking crash reporter ==="
grep -n "uploadToServer.*false" product.json && echo "Crash reporter OFF ✅"

echo "=== 4. Checking branding ==="
grep -rn "CONSTRUCT IDE" src/ resources/ 2>/dev/null && echo "FOUND CONSTRUCT IDE — FAIL" || echo "No CONSTRUCT IDE remnants ✅"

echo "=== 5. Checking ESRP removal ==="
grep -rn "esrpCli\|EsrpCli" build/azure-pipelines/common/sign.ts 2>/dev/null && echo "ESRP still present — FAIL" || echo "No ESRP references ✅"

echo "=== 6. Checking update.json ==="
test -f docs/update.json && echo "update.json exists ✅" || echo "update.json MISSING — FAIL"

echo "=== 7. Checking GitHub Pages workflow ==="
test -f .github/workflows/deploy-update-server.yml && echo "Pages workflow exists ✅" || echo "Pages workflow MISSING — FAIL"

echo "=== 8. Checking signing vars ==="
grep -rn "KOVIX_SIGN" build/ 2>/dev/null | head -3 && echo "Signing uses KOVIX_ vars ✅"

echo "=== 9. Checking legal docs ==="
ls PRIVACY.md LICENSE.txt ThirdPartyNotices.txt NOTICE.md 2>/dev/null && echo "Legal docs ✅" || echo "Some legal docs MISSING"

echo "=== 10. Checking VSCODE_ARCH removal ==="
grep -rn "VSCODE_ARCH" build/darwin/sign.ts build/darwin/create-universal-app.ts build/linux/libcxx-fetcher.ts build/win32/explorer-appx-fetcher.ts 2>/dev/null && echo "VSCODE_ARCH still present — FAIL" || echo "VSCODE_ARCH removed ✅"

echo "=== 11. Checking CONSTRUCT_LICENSE removal ==="
test -f CONSTRUCT_LICENSE.txt && echo "CONSTRUCT_LICENSE still exists — FAIL" || echo "CONSTRUCT_LICENSE removed ✅"

echo "=== 12. Checking nightly build workflow ==="
test -f .github/workflows/nightly-build.yml && echo "Nightly build workflow ✅" || echo "Nightly build MISSING"

echo "=== 13. Checking pre-release workflow ==="
test -f .github/workflows/pre-release.yml && echo "Pre-release workflow ✅" || echo "Pre-release MISSING"

echo "=== 14. Checking generate-update-json script ==="
test -f scripts/generate-update-json.js && echo "Generate update script ✅" || echo "Generate update script MISSING"

echo ""
echo "=========================================="
echo "  KOVIX Smoke Test Complete"
echo "=========================================="
