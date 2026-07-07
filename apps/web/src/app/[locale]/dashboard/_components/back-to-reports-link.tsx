"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

/**
 * Gedeelde "← Terug naar rapportages"-link voor de marketing-kanaalpagina's.
 * Die zijn bereikbaar vanuit /dashboard/rapportages maar hadden zelf geen
 * terug-pad (dead-end). Eén component zodat de tekst + stijl consistent zijn
 * en de i18n-key (`common.backToReports`) op één plek leeft.
 */
export function BackToReportsLink() {
  const t = useTranslations("common");
  return (
    <Link
      href="/dashboard/rapportages"
      style={{
        fontSize: 13,
        color: "var(--ts)",
        textDecoration: "none",
        marginBottom: 14,
        display: "inline-block",
      }}
    >
      {t("backToReports")}
    </Link>
  );
}
