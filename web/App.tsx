// React + Vite scaffold (Task 1 of the framework migration). This is
// deliberately a shell: the constellation, source trace-back, edit/remove,
// and the sign-in/local-activity panels are being rebuilt here feature by
// feature over the next tasks, not ported in one step. Until they land,
// this page is less capable than the vanilla-DOM version it replaces.
export function App() {
  return (
    <>
      <header className="page-header">
        <span className="brand">Daily Proof</span>
      </header>
      <main>
        <p className="constellation-status">
          React + Vite scaffold is running. The constellation and panels are
          being rebuilt here next.
        </p>
      </main>
    </>
  );
}
