# Agent Operating Guidelines — Kovix IDE

These guidelines govern any AI coding agent working in this repository. They are derived from concrete incidents that have already happened here — every rule below addresses a real failure mode that cost real time. Future sessions: read this file before opening a PR.

## 1. Verify against the exact production call shape, not a simplified stand-in

When reproducing a failure or testing a fix, you must exercise the **same call shape** the production code uses. A function tested as `vzip()` may behave differently from `vzip.src()` — vinyl-fs/gulp plugins commonly attach stream methods to the function object, and the bug may live only on the `.src` path. Same applies to `.pipe()` chains, options objects, and callback signatures.

**Checklist before claiming "verified locally":**
- Find the actual call site in `build/` (use Grep, not memory).
- Reproduce the exact same call — same method, same arguments, same surrounding pipeline.
- If the reproduction passes but production fails, your reproduction is wrong. Do not merge on the basis of a mismatched test.

## 2. Never merge on "should be fine" — wait for the actual signal

"Looks like a pre-existing issue, should be fine" is **not** a merge signal. Neither is "the fix is obvious, CI will pass." If CI is still running, you wait. If CI failed for an unrelated reason, you either fix that reason or you re-run CI before merging. Admin-merge bypassing required checks is forbidden unless the user explicitly authorizes it in writing.

**Hard rule:** a PR is mergeable only when (a) the latest CI run on the exact head SHA completed with `conclusion: success`, AND (b) you have personally read the failed-step logs from prior runs and confirmed the failure mode is resolved. Re-running CI on a different SHA than the one you intend to merge is not verification.

## 3. Verify workflow_dispatch actually targeted the intended ref

`workflow_dispatch` runs against whatever ref you specify. If you trigger a run and don't confirm the ref, you may be testing `main` while believing you're testing your fix branch. This has happened here and wasted a full CI cycle.

**Before trusting a workflow_dispatch result, fetch the run via the API and confirm:**
```
GET /repos/{owner}/{repo}/actions/runs/{run_id}
```
Check three fields against your expectation:
- `head_branch` — matches your fix branch name
- `head_sha` — matches the commit SHA you pushed (first 10 chars is enough)
- `pull_requests[].head.ref` and `pull_requests[].head.sha` — if the run is associated with a PR, both must match

If any field is wrong, cancel the run and re-trigger with the correct ref. Do not trust logs from a run on the wrong ref, even if it passed.

Additionally, after the run starts, pull the `actions/checkout` step log and confirm the line `Cleaning the repository` / `HEAD is now at <sha>` references your fix SHA. The metadata can be correct but a stale cache or wrong workflow inputs can still cause checkout to pull the wrong ref — the log line is the source of truth.

## 4. Disprove your own working hypothesis before implementing a fix

When a failure occurs, you will form a hypothesis within minutes. That hypothesis is usually plausible and usually partially correct. **It is rarely the complete root cause.** Before implementing a fix:

- State the hypothesis explicitly in writing.
- Identify the single piece of evidence that would **disprove** it.
- Go get that evidence.

If the disconfirming evidence confirms the hypothesis, proceed. If it disproves the hypothesis, abandon the hypothesis — do not patch it with "well, it's probably still part of the issue." A half-right hypothesis leads to a half-working fix that wastes a full CI cycle (here: ~1 hour per Linux build) to discover.

Concrete example: "the negation glob `!**/node_modules/.bin/**` will exclude .bin from packaging" was a plausible hypothesis. The disconfirming test was "does fast-glob apply negation during traversal or during result filtering?" One read of the fast-glob source would have shown it's the latter — and that the crash happens during traversal. That single check was skipped; the fix was pushed; CI failed identically; ~1 hour was lost.

## 5. Local reproductions must account for stale state

Local "it works" results are unreliable when any of these are present:
- `node_modules/` from a prior install (different version of the buggy package)
- `out/`, `out-build/`, `.build/`, or other compiled output
- Cache directories: `~/.npm`, `~/.cache/node-gyp`, `~/.cache/electron`, `~/.cache/playwright`
- A different OS than CI (your local Linux is not GitHub's Ubuntu runner)
- A different Node.js patch version

**Before claiming a local reproduction passes:** delete `node_modules`, delete build output, clear relevant caches, reinstall, and re-run. If the reproduction passes after a clean reinstall, it's meaningful. If it only passes with the existing state, the existing state may be masking the bug.

For CI-only failures (e.g. native module compilation on Windows), local reproduction on a different OS is not verification — it is at best a hint.

## 6. Investigate systematically; report the confirmed root cause before fixing

When a failure has multiple plausible causes (e.g. "the build crashed — is it the new dependency, the new gulp plugin, the new Node version, or the pre-existing latent bug?"), do not pick one and fix it. Investigate all of them in parallel and **report which one is actually the root cause** before proposing a fix.

Concretely:
- Read the failing step's log to the end, including the stack trace.
- Identify the exact line of code that threw.
- Identify the exact input that triggered it.
- Trace that input back to its source (which dependency, which install step, which PR introduced it).
- Only when you can write a single-sentence causal chain ("X calls Y with input Z, which triggers bug W in package V version U") do you have a root cause.

Speculative fixes — "let's try X and see if it works" — are acceptable only when the fix is cheap, reversible, and you've exhausted the investigation. Each speculative fix costs a CI cycle. Two speculative fixes in a row on the same problem means you don't understand the problem; stop and investigate.

## 7. Prefer the smallest targeted fix that addresses the confirmed root cause

When you have a confirmed root cause, the fix should be the minimum change that addresses it and nothing else. Avoid:
- Refactoring surrounding code "while you're in there"
- Adding defensive checks for failure modes you haven't seen
- Bumping dependency versions as a side effect
- Changing formatting, imports, or naming

A small fix is reviewable in 2 minutes. A large fix is reviewable in 30 minutes and may be wrong in 5 places instead of 1. If the fix naturally requires a larger change (e.g. the root cause is a design flaw), say so explicitly in the PR description and enumerate what is in scope and what is not.

Specifically: if the root cause is in a single function, the fix should be in that function. If the root cause is a wrong filename in a check, the fix is the filename — not a re-architecture of the check.

## 8. Keep a running todo list during long investigations

Investigations that span multiple CI cycles (each ~1 hour on this repo) will lose state. "Did I already verify X?" becomes unanswerable from memory after the second cycle. Maintain a todo list — either via the `TodoWrite` tool or in a scratch file — with three columns per item:
- **Verified** (you have hard evidence)
- **Assumed** (you believe it but haven't confirmed)
- **Pending** (you haven't checked yet)

At the start of each new session or context window, re-read this list. Anything in "Assumed" needs to be promoted to "Verified" or demoted to "Pending" before it informs a decision. Anything in "Pending" needs to be done before the investigation can claim to be complete.

The shared worklog at `/home/z/my-project/worklog.md` is the persistent record across sessions and agents. Read it before starting work; append to it after finishing a unit of work. Do not overwrite — append only, with a `---` separator and a timestamp.

## 9. CI cycles are expensive — batch your uncertainty

Each Linux x64 Build takes ~55 minutes. Each Windows x64 Build takes ~22 minutes. You do not get many of these per day. Before pushing a fix:

- Have you confirmed the root cause? (Guideline 6)
- Have you disproven alternative hypotheses? (Guideline 4)
- Have you verified the fix locally with clean state? (Guideline 5)
- Have you confirmed the fix targets the production call shape? (Guideline 1)
- Have you checked that the fix doesn't regress anything else (build, lint, tests)?

If any answer is "no," do not push yet. Wait until all are "yes." A single push with a confident fix is worth ten pushes with speculative ones.

## 10. When you report a result, include the disconfirming evidence

A CI result report should answer:
- **Did it pass?** (yes/no, with the run URL)
- **If yes, which steps ran for the first time?** (e.g. "DEB/RPM/tar.gz packaging steps that have never run in this repo's CI history")
- **If no, which step failed and what's the exact error?** (quote the log line, don't paraphrase)
- **What did this run prove about the hypothesis?** (e.g. "the `resolveSymlinks: false` option did/did not prevent the ENOENT crash")
- **What is still unverified?** (e.g. "the Windows verify-native-modules fix was tested but the actual packaging steps were not reached because Linux failed first")

The last point is critical. A green run on the wrong ref proves nothing. A green run that didn't reach the historically failing step proves nothing. A green run on the right ref that reached the historically failing step and passed it — that's the only kind of green that means "merge."

---

These guidelines are not exhaustive. When in doubt, default to: **investigate more, fix less, document everything, wait for the real signal.**
