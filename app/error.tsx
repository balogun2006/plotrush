"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page-wrap empty-state">
      <h1>A twist we didn’t expect.</h1>
      <p>PlotRush couldn’t load this page. Please try again.</p>
      <button className="button lime" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
