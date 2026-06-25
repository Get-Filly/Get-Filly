"use client";

// ============================================================
// MetaPageSelector, uitklapbare pagina-keuze onder de Meta-rij
// ============================================================
// Verschijnt direct ONDER de "Facebook & Instagram"-rij in de
// koppelingenlijst, alleen als Meta verbonden is. Eén taak: de
// Facebook-pagina kiezen waarop campagnes gepubliceerd worden (incl.
// het daaraan gekoppelde Instagram-account). Het echte publiceren van
// campagnes loopt via "Activeer nu" op de campagne zelf — het oude
// testbericht-paneel (tekst/url/kanaalvinkjes/Plaats) is verwijderd.
//
// In/uitklapbaar: standaard dicht, maar automatisch open als er nog
// GEEN pagina gekozen is — anders zou een eigenaar de stap missen en
// faalt publiceren stil (geen pagina = niets geplaatst).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { useRestaurant } from "@/lib/restaurant-context";
import {
  metaStatus,
  metaListPages,
  metaSelectPage,
  type MetaPage,
} from "@/lib/api";

export function MetaPageSelector() {
  const t = useTranslations("dash__components_meta_publish_panel");
  const { active } = useRestaurant();

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [savedPageId, setSavedPageId] = useState<string | null>(null);
  const [savingPage, setSavingPage] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Status + pagina's laden bij mount en bij wissel van restaurant.
  // Inline async IIFE met cancel-guard (zelfde patroon als elders).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await metaStatus();
        if (cancelled) return;
        setConnected(status.connected);
        if (status.connected) {
          const list = await metaListPages();
          if (cancelled) return;
          setPages(list);
          const saved = status.page?.id ?? null;
          setSavedPageId(saved);
          setSelectedPageId(saved ?? list[0]?.id ?? "");
          // Nog geen pagina gekozen → standaard open zodat de eigenaar de
          // stap niet mist (anders faalt publiceren stil).
          setOpen(!saved);
        } else {
          setPages([]);
        }
      } catch {
        // Geen koppeling / geen restaurant-context: niets tonen.
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  // Alleen tonen als Meta verbonden is; anders regelt de rij zelf "Verbind".
  if (loading || !connected) return null;

  const savedPageName =
    pages.find((p) => p.id === savedPageId)?.name ?? null;

  const savePage = async () => {
    if (!selectedPageId) return;
    setSavingPage(true);
    setFeedback(null);
    try {
      await metaSelectPage(selectedPageId);
      setSavedPageId(selectedPageId);
      setFeedback(t("pageSaved"));
    } catch {
      setFeedback(t("pageSaveFailed"));
    } finally {
      setSavingPage(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border, #E5DFD0)",
    borderRadius: 6,
    fontSize: 13,
    background: "var(--white, #FFFFFF)",
    color: "var(--text, #18181B)",
  };

  return (
    <div
      style={{
        // Subtiele warme tint zodat de uitklap zich onderscheidt van de
        // witte rijen. Onder-rand scheidt 'm van de volgende rij; de
        // boven-scheiding levert de Meta-rij zelf (borderBottom).
        background: "#FCFAF5",
        borderBottom: "1px solid var(--border, #E5DFD0)",
      }}
    >
      {/* Toggle-kop: klik om in/uit te klappen. Toont de huidige pagina. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          textAlign: "left",
          padding: "10px 14px 10px 46px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--brand, #1F4A2D)",
          fontFamily: "inherit",
        }}
      >
        <span style={{ flex: 1 }}>
          {t("choosePage")}
          {savedPageName ? `: ${savedPageName}` : ""}
        </span>
        <ChevronDown
          size={15}
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        />
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px 46px" }}>
          {pages.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--tl)" }}>{t("noPages")}</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={selectedPageId}
                  onChange={(e) => setSelectedPageId(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.hasInstagram ? " (+ Instagram)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={savePage}
                  disabled={savingPage || !selectedPageId}
                  style={{
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid var(--border, #E5DFD0)",
                    background: "var(--brand, #1F4A2D)",
                    color: "#FFFFFF",
                    borderRadius: 6,
                    cursor: savingPage ? "wait" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  {savingPage ? t("saving") : t("savePage")}
                </button>
              </div>
              {feedback && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--brand, #1F4A2D)",
                    marginTop: 8,
                  }}
                >
                  {feedback}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
