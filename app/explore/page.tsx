import { Suspense } from "react";
import { Explorer } from "@/components/explorer";
export default function Explore() {
  return (
    <Suspense fallback={<p className="loading-card">Loading explorer…</p>}>
      <Explorer />
    </Suspense>
  );
}
