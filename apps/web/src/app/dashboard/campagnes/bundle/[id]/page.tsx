"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// ============================================================
// /dashboard/campagnes/bundle/[id] — redirect-stub
// ============================================================
//
// Per 2026-05-13: bundle-detail is gemerged in de unified detail-page
// op /dashboard/campagnes/[id] (zie comment in [id]/page.tsx).
// Deze route blijft bestaan als redirect-stub zodat oude bookmarks
// (uit periode 2026-05-07 t/m 2026-05-13 toen er nog een aparte
// bundle-page was) niet stuk gaan.
//
// In een latere cleanup-sweep kan deze hele bundle/-map verwijderd
// worden zodra we zeker weten dat er geen verwijzingen meer leven.
// ============================================================

export default function BundleRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    if (id) router.replace(`/dashboard/campagnes/${id}`);
  }, [id, router]);

  return (
    <div
      style={{
        padding: "32px 24px",
        textAlign: "center",
        color: "var(--text-secondary, #52525B)",
        fontSize: 13,
      }}
    >
      Bezig met doorsturen…
    </div>
  );
}
