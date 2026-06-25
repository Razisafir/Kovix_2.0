# Manual GUI Test Plan for Razi

**Purpose:** Verify that the Kovix IDE GUI works correctly on a real desktop machine.
**Platform:** Windows or macOS (Linux also works if you have a real display).
**Estimated time:** 10-15 minutes.

## Prerequisites

1. Clone the repo: `git clone https://github.com/Razisafir/Kovix_2.0.git && cd Kovix_2.0`
2. Checkout the branch: `git checkout kovix-rebuild`
3. Install dependencies: `npm install`
4. Build: `npm run compile`
5. Launch: `./scripts/code.sh` (Linux/Mac) or `scripts\code.bat` (Windows)

## Test Steps

### Test 1: Application Launch
1. Run `./scripts/code.sh`
2. **Expected:** A window opens with the Kovix IDE title bar showing "Kovix Dev" (dev mode)
3. **Expected:** The welcome/startup page renders (or a blank editor if no workspace)
4. **FAIL if:** Window doesn't open, crashes immediately, or title says "Construct Dev"

### Test 2: Construct Panel Opens
1. Press `Ctrl+Shift+K` (or `Cmd+Shift+K` on Mac)
2. **Expected:** The Construct agent panel opens on the right side
3. **Expected:** You see a chat input area and model/provider selector
4. **FAIL if:** Nothing happens, or an error notification appears

### Test 3: Model/Provider Selection
1. In the Construct panel, click the model/provider dropdown
2. **Expected:** You can select between Ollama, OpenAI, Anthropic, etc.
3. **Expected:** Selecting a provider shows available models
4. **PASS if:** Dropdown renders and responds to clicks (even if no provider is configured yet)

### Test 4: Agent Task with EveryMilestone Mode
1. In the Construct panel, ensure "Every Milestone" mode is selected (dropdown at top of panel)
2. Type a simple task: `create a file called hello.txt with the text "Kovix lives"`
3. Click Send
4. **Expected:** The agent creates a plan with milestones
5. **Expected:** After the first milestone executes, execution PAUSES and you see "Resume" and "Skip" buttons
6. Click "Resume"
7. **Expected:** Next milestone executes
8. **FAIL if:** Execution runs straight through without pausing (MajorMilestone bug)
9. **FAIL if:** Skip and Resume do the same thing (Skip bug)

### Test 5: Skip vs Resume
1. Start another task in EveryMilestone mode
2. When the first milestone pauses, click "Skip" instead of "Resume"
3. **Expected:** The milestone is marked as SKIPPED (not completed)
4. **Expected:** The next milestone starts
5. **FAIL if:** Skip and Resume behave identically

### Test 6: MajorMilestone Mode
1. Switch to "Major Milestone" mode (dropdown)
2. Type a task that involves both reading and creating files
3. **Expected:** Execution pauses at milestones involving file creation or shell commands
4. **Expected:** Execution does NOT pause at milestones that only read files
5. **FAIL if:** No pauses at all (should differ from Full Auto mode)

### Test 7: Theme Renders Correctly
1. Look at the overall application theme
2. **Expected:** Teal accent color (#14B8A6) is visible in the activity bar, buttons, and focus borders
3. **Expected:** No purple/violet colors anywhere (dead tokens removed)
4. **Expected:** No white-on-white or invisible text (undefined variables would cause this)
5. **FAIL if:** Any element is unstyled, invisible, or shows a default browser blue instead of teal

## Quick Smoke Test (If You Only Have 3 Minutes)

1. Launch the app
2. Press Ctrl+Shift+K
3. Verify the Construct panel opens
4. Type "hello" and send
5. Verify you get a response (even an error about no provider configured is acceptable)

If steps 1-5 work, the core GUI is functional and the rest can be verified incrementally.
