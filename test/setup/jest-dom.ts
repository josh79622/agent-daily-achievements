// Registers jest-dom's matchers (toBeInTheDocument, toBeDisabled, etc.) on
// Vitest's `expect`, for the component tests in test/web/*.test.tsx. Loaded
// for every test file; it only extends `expect` and never touches the DOM,
// so it is harmless for the node-environment tests too.
import "@testing-library/jest-dom/vitest";
