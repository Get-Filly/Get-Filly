"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// ============================================================
// /u/[token], publieke unsubscribe-pagina
// ============================================================
//
// Wordt geopend wanneer een gast op de "Uitschrijven"-link klikt in
// een campagne-mail. Geen auth nodig, de token zelf is het auth-
// mechanisme (256 bits random).
//
// Flow:
//   1. Pagina mount → roept backend POST /api/public/unsubscribe/<token> aan
//   2. Backend zet guests.mail_opt_in=false + token.used_at=now
//   3. UI toont "Je bent uitgeschreven van <restaurant>"
//
// Idempotent: 2e bezoek doet niets nieuws maar toont dezelfde melding.
// Bij ongeldige token: nette 404-melding.
// ============================================================

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type State =
  | { status: "loading" }
  | { status: "success"; restaurantName: string }
  | { status: "error"; message: string };

export default function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Next.js 16 gebruikt async params. `use()` resolved 'm hier client-
  // side zodat we 'm direct in een useEffect kunnen gebruiken.
  const { token } = use(params);
  const t = useTranslations("unsubscribe");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/public/unsubscribe/${token}`, { method: "POST" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          let msg = t("httpError", { status: res.status });
          try {
            const body = await res.json();
            if (body?.message) msg = body.message;
          } catch {
            // niet-JSON; fallback gebruiken
          }
          setState({ status: "error", message: msg });
          return;
        }
        const body = (await res.json()) as { restaurantName: string };
        setState({
          status: "success",
          restaurantName: body.restaurantName ?? t("fallbackName"),
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : t("unknownError"),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--paper, #FAF7F1)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#1a1a1a",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: "40px 32px",
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        }}
      >
        {state.status === "loading" && (
          <>
            <div style={{ fontSize: 14, color: "#6B6F71" }}>
              {t("loading")}
            </div>
          </>
        )}

        {state.status === "success" && (
          <>
            <div style={{ fontSize: 32 }}>✓</div>
            <h1 style={{ fontSize: 20, margin: "12px 0 8px" }}>
              {t("successTitle")}
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#6B6F71" }}>
              {t.rich("successBody", {
                name: state.restaurantName,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: "#9CA3AF",
                marginTop: 20,
              }}
            >
              {t("successNote", { name: state.restaurantName })}
            </p>
          </>
        )}

        {state.status === "error" && (
          <>
            <div style={{ fontSize: 32 }}>—</div>
            <h1 style={{ fontSize: 20, margin: "12px 0 8px" }}>
              {t("errorTitle")}
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#6B6F71" }}>
              {t("errorBody")}
            </p>
            <p
              style={{
                fontSize: 12,
                color: "#9CA3AF",
                marginTop: 12,
              }}
            >
              {state.message}
            </p>
          </>
        )}

        <div style={{ marginTop: 24, fontSize: 11, color: "#9CA3AF" }}>
          {t("sentVia")}
        </div>
      </div>
    </main>
  );
}
