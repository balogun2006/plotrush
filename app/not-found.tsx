import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page-wrap empty-state">
      <span className="eyebrow">A DEAD END</span>
      <h1>This clue leads nowhere.</h1>
      <p>The page you’re looking for is unavailable.</p>
      <Link className="button lime" href="/explore">
        Find a mystery
      </Link>
    </div>
  );
}
