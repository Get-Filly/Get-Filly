"use client";

// ============================================================
// MetaPublishPanel, stap 4: pagina kiezen + testbericht posten
// ============================================================
// Verschijnt onder de koppelingen-lijst. Alleen zichtbaar als Meta
// gekoppeld is (status.connected). Laat de eigenaar:
//   1. een Facebook-pagina kiezen (lijst via /me/accounts)
//   2. een testbericht posten naar FB en/of IG
// Dit is ook wat Meta in App Review wil zien: de app gebruikt de
// gevraagde rechten (pages_show_list, pages_manage_posts,
// instagram_content_publish) echt.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { useRestaurant } from "@/lib/restaurant-context";
import {
  metaStatus,
  metaListPages,
  metaSelectPage,
  metaPublish,
  type MetaPage,
} from "@/lib/api";

export function MetaPublishPanel() {
  const t = useTranslations("dash__components_meta_publish_panel");
  const { active } = useRestaurant();

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [savingPage, setSavingPage] = useState(false);

  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [toFacebook, setToFacebook] = useState(true);
  const [toInstagram, setToInstagram] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Status + pagina's laden bij mount en bij wissel van restaurant.
  // Inline async IIFE met cancel-guard (zelfde patroon als
  // restaurant-context): geen synchrone setState vóór de eerste await.
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
          // Voorselecteren: opgeslagen pagina, anders de eerste.
          setSelectedPageId(status.page?.id ?? list[0]?.id ?? "");
        } else {
          setPages([]);
        }
      } catch {
        // Geen koppeling / nog geen restaurant-context: paneel verbergt zich.
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  // Niet gekoppeld → toon een subtiele hint i.p.v. een leeg paneel.
  if (!connected) {
    if (loading) return null;
    return (
      <div style={{ marginTop: "var(--space-5)", fontSize: 12, color: "var(--tl)" }}>
        {t.rich("notConnectedHint", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </div>
    );
  }

  const selectedPage = pages.find((p) => p.id === selectedPageId) ?? null;

  const savePage = async () => {
    if (!selectedPageId) return;
    setSavingPage(true);
    setFeedback(null);
    try {
      await metaSelectPage(selectedPageId);
      setFeedback(t("pageSaved"));
    } catch {
      setFeedback(t("pageSaveFailed"));
    } finally {
      setSavingPage(false);
    }
  };

  const publish = async () => {
    if (!message.trim()) return;
    setPublishing(true);
    setFeedback(null);
    try {
      const res = await metaPublish({
        message,
        imageUrl: imageUrl.trim() || undefined,
        toFacebook,
        toInstagram,
      });
      const ok: string[] = [];
      if (res.facebook) ok.push("Facebook");
      if (res.instagram) ok.push("Instagram");
      const parts: string[] = [];
      if (ok.length) parts.push(t("publishedTo", { channels: ok.join(" + ") }));
      if (res.errors.length) parts.push(res.errors.join(" "));
      setFeedback(parts.join(" ") || t("noChannelSelected"));
      if (ok.length) setMessage("");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t("publishFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border, #E5DFD0)",
    borderRadius: 6,
    fontSize: 13,
    background: "var(--white, #FFFFFF)",
  };

  return (
    <div
      style={{
        marginTop: "var(--space-5)",
        padding: 16,
        background: "var(--white, #FFFFFF)",
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        {t("title")}
      </div>
      <div style={{ fontSize: 12, color: "var(--tl)", marginBottom: 14 }}>
        {t("subtitle")}
      </div>

      {/* Pagina-keuze */}
      {pages.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--tl)" }}>
          {t("noPages")}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
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
      )}

      {/* Testbericht */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t("messagePlaceholder")}
        rows={3}
        style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
      />
      <input
        type="url"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        placeholder={t("imageUrlPlaceholder")}
        style={{ ...inputStyle, marginBottom: 10 }}
      />

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={toFacebook}
            onChange={(e) => setToFacebook(e.target.checked)}
          />
          Facebook
        </label>
        <label
          style={{
            fontSize: 13,
            display: "flex",
            gap: 6,
            alignItems: "center",
            opacity: selectedPage?.hasInstagram ? 1 : 0.5,
          }}
        >
          <input
            type="checkbox"
            checked={toInstagram}
            disabled={!selectedPage?.hasInstagram}
            onChange={(e) => setToInstagram(e.target.checked)}
          />
          Instagram
        </label>

        <button
          type="button"
          onClick={publish}
          disabled={publishing || !message.trim() || (!toFacebook && !toInstagram)}
          style={{
            marginLeft: "auto",
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            background:
              publishing || !message.trim() || (!toFacebook && !toInstagram)
                ? "var(--border, #E5DFD0)"
                : "var(--brand, #1F4A2D)",
            color: "#FFFFFF",
            borderRadius: 6,
            cursor: publishing ? "wait" : "pointer",
          }}
        >
          {publishing ? t("publishing") : t("publish")}
        </button>
      </div>

      {feedback && (
        <div style={{ fontSize: 13, color: "var(--text, #18181B)" }}>{feedback}</div>
      )}
    </div>
  );
}
