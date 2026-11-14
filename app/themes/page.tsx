import { Suspense } from "react";
import { ThemeDirectory } from "@/components/theme-directory";
export default function Themes() {
  return (
    <Suspense fallback={<p>Loading themes…</p>}>
      <ThemeDirectory />
    </Suspense>
  );
}
