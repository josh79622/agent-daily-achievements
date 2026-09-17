# Decision: use Vitest as the one unit-test framework

## Decision

Vitest is the project's single unit-test framework. All existing TypeScript unit tests are written with Vitest's test and assertion APIs, and `npm test` runs `vitest run`.

## Rationale

The future browser interface will use Vitest, so adopting it now keeps every unit test on one command, assertion style, helper set, and eventual coverage/reporting path.

## Migration requirements

- Preserve the existing behavioral coverage when converting tests.
- Keep `npm test` and CI on the same Vitest command.
- Run the full quality gate before marking a migration complete.
