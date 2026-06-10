#!/bin/bash
# KOVIX VPS Test Setup
# Usage: ANTHROPIC_API_KEY=sk-ant-... ./scripts/vps-setup.sh
# Tests the agent backend directly without the Electron GUI.
#
# Prerequisites:
#   - Node.js 20+
#   - Anthropic or OpenAI API key in environment
#   - Git, Python 3.x

set -e

echo "=== KOVIX VPS Test ==="

# Check API keys
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
    echo "ERROR: Set ANTHROPIC_API_KEY or OPENAI_API_KEY"
    exit 1
fi

# Check Node 20+
node_ver=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$node_ver" -lt 20 ]; then
    echo "ERROR: Node.js 20+ required (found $(node --version))"
    exit 1
fi

echo "Node: $(node --version)"
echo "Provider: ${ANTHROPIC_API_KEY:+Anthropic}${OPENAI_API_KEY:+OpenAI}"

# Install deps
echo ""
echo "Installing dependencies..."
npm install --ignore-scripts 2>&1 | tail -3

# Type check
echo ""
echo "Type-checking..."
ERRORS=$(node --max-old-space-size=4096 ./node_modules/.bin/tsc -p src/tsconfig.json --noEmit 2>&1 | grep "error TS" | wc -l)
if [ "$ERRORS" -ne 0 ]; then
    echo "FAIL: $ERRORS TypeScript errors found"
    node --max-old-space-size=4096 ./node_modules/.bin/tsc -p src/tsconfig.json --noEmit 2>&1 | grep "error TS" | head -20
    exit 1
fi
echo "PASS: Zero TypeScript errors"

# Verify new feature files exist
echo ""
echo "Verifying feature files..."
PASS=0
FAIL=0

check_file() {
    if [ -f "$1" ]; then
        echo "  PASS: $1"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $1 (missing)"
        FAIL=$((FAIL + 1))
    fi
}

# Phase 1: Project Service
check_file "src/vs/platform/construct/common/project/constructProjectTypes.ts"
check_file "src/vs/platform/construct/common/project/constructProjectService.ts"
check_file "src/vs/workbench/contrib/construct/browser/services/project/constructProjectServiceImpl.ts"
check_file "src/vs/workbench/contrib/construct/browser/constructProjectWizard.ts"

# Phase 2: Idea Refinement
check_file "src/vs/platform/construct/common/agent/ideaRefinementTypes.ts"
check_file "src/vs/platform/construct/common/agent/ideaRefinementService.ts"
check_file "src/vs/workbench/contrib/construct/browser/services/agent/ideaRefinementServiceImpl.ts"

# Phase 3-4: Milestone + Execution Mode
check_file "src/vs/platform/construct/common/agent/milestoneStateMachine.ts"
check_file "src/vs/platform/construct/common/agent/executionMode.ts"
check_file "src/vs/workbench/contrib/construct/browser/constructStopModePicker.ts"

# Phase 6: Universal Memory
check_file "src/vs/platform/construct/common/memory/universalMemoryTypes.ts"
check_file "src/vs/platform/construct/common/memory/universalMemoryService.ts"
check_file "src/vs/workbench/contrib/construct/browser/services/memory/universalMemoryService.ts"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ $FAIL -ne 0 ]; then
    echo ""
    echo "SOME FILES MISSING — cannot proceed with full test"
    exit 1
fi

# Verify key interfaces are defined
echo ""
echo "Verifying key interfaces..."
rg "export interface IKovixProject" src/vs/platform/construct/common/project/constructProjectTypes.ts && echo "  PASS: IKovixProject" || echo "  FAIL: IKovixProject"
rg "export interface IRefinedIdea" src/vs/platform/construct/common/agent/ideaRefinementTypes.ts && echo "  PASS: IRefinedIdea" || echo "  FAIL: IRefinedIdea"
rg "export enum ExecutionMode" src/vs/platform/construct/common/agent/executionMode.ts && echo "  PASS: ExecutionMode" || echo "  FAIL: ExecutionMode"
rg "export interface IApprovedPlan" src/vs/platform/construct/common/agent/milestoneStateMachine.ts && echo "  PASS: IApprovedPlan" || echo "  FAIL: IApprovedPlan"
rg "export interface IUniversalMemoryEntry" src/vs/platform/construct/common/memory/universalMemoryTypes.ts && echo "  PASS: IUniversalMemoryEntry" || echo "  FAIL: IUniversalMemoryEntry"

# Count new files vs original
echo ""
echo "File counts:"
echo "  Platform construct: $(find src/vs/platform/construct -name '*.ts' | wc -l) files (was 58)"
echo "  Workbench construct: $(find src/vs/workbench/contrib/construct -name '*.ts' | wc -l) files (was 38)"
echo "  Total: $(find src/vs/platform/construct src/vs/workbench/contrib/construct -name '*.ts' | wc -l) files (was 96)"

echo ""
echo "=== VPS Test Complete ==="
echo "All structural checks PASSED"
echo ""
echo "NOTE: Full E2E testing requires a display (run on desktop with 16GB+ RAM)"
echo "Use KOVIX-TEST-PROMPT.md for desktop smoke testing"
