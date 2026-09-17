# Decision: use one unit-test framework if Vitest is adopted

## Decision

The current project continues to use Node's built-in `node:test` runner with `tsx` for TypeScript unit tests. Vitest is not approved or installed yet.

If a later approved task adopts Vitest, such as adding browser-facing unit tests that need its tooling, that task must migrate the existing unit tests to Vitest and make Vitest the single unit-test runner for the project. Do not leave a long-term split between `node:test` and Vitest suites.

## Rationale

One runner gives contributors one command, one assertion style, one set of test helpers, and one coverage/reporting path. Keeping the present zero-extra-framework setup avoids a premature dependency until the project needs Vitest's UI-test support.

## Migration requirements

- Propose and confirm the migration's test cases before changing test code.
- Preserve the existing behavioral coverage while converting tests.
- Replace the package scripts and CI command in the same focused task.
- Run the full quality gate before marking the migration complete.
