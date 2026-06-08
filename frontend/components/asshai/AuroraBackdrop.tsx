export function AuroraBackdrop() {
  return (
    <>
      <div className="aurora aurora-left" aria-hidden="true" />
      <div className="aurora aurora-right" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="terminal-grid" aria-hidden="true" />
      <div className="somnia-glyphs" aria-hidden="true">
        <span>// $</span>
        <span>@()</span>
        <span>{"{s}"}</span>
        <span>&gt;&gt; ::</span>
      </div>
    </>
  );
}
