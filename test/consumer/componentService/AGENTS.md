## Unit test coverage for componentService hooks

- Treat each step in `consumer/componentService/**/index.js` route `spec` (`decode`, `pre`, `handler`, `post`) as a “hook” that needs a corresponding unit test in this tree.
- Ensure every hook has at least one focused test file here (prefer mirroring the module path, e.g. `consumer/.../handler/foo.js` → `test/.../handler/foo.mjs`).
- If a hook can throw diagnostics via `*.require(...)` or `*.invariant(...)`, add a specific unit test that triggers that failure and asserts it throws `DiagnosticError` (and validate stable details like error code/meta when practical).
- When hook coverage is missing, add the minimal new test file(s) needed to cover the uncovered hook(s) and their diagnostic/error paths.
