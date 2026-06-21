"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  tiktokStatus,
  tiktokCreatorInfo,
  tiktokUpload,
  type TikTokStatus,
  type TikTokCreatorInfo,
} from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";

// ============================================================
// TikTokUploadPanel — compliant upload-scherm (Content Posting API)
// ============================================================
// Stuurt een video als CONCEPT naar de TikTok-inbox; de eigenaar voltooit
// + publiceert vanuit de TikTok-app. Bevat de DRIE door TikTok vereiste
// UX-elementen (audit-vereiste, zie demovideo-script Scène 3):
//   1. Creator-username + avatar vóór de upload-knop.
//   2. Commercial-content-disclosure-toggle (standaard uit) → Your Brand /
//      Branded Content.
//   3. Music-Usage-Confirmation-consenttekst bij de knop.
// ============================================================
export function TikTokUploadPanel() {
  const t = useTranslations("dash_tiktok_upload");
  const { active } = useRestaurant();

  const [status, setStatus] = useState<TikTokStatus | null>(null);
  const [creator, setCreator] = useState<TikTokCreatorInfo | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [disclose, setDisclose] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<"success" | string | null>(null);

  useEffect(() => {
    if (!active?.id) return;
    tiktokStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, [active?.id]);

  // creator_info alleen ophalen als verbonden (vereist een geldige token).
  useEffect(() => {
    if (status?.connected) {
      tiktokCreatorInfo()
        .then(setCreator)
        .catch(() => setCreator(null));
    }
  }, [status?.connected]);

  if (status === null) {
    return <div style={{ color: "var(--tl)" }}>…</div>;
  }

  // Niet verbonden → eerst koppelen.
  if (!status.connected) {
    const startHref = `/oauth/tiktok/start${active?.id ? `?restaurantId=${encodeURIComponent(active.id)}` : ""}`;
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>{t("title")}</h3>
        <p style={{ color: "var(--ts)", fontSize: 14, margin: "8px 0 16px" }}>
          {t("connectPrompt")}
        </p>
        <a href={startHref} style={primaryBtnStyle}>
          {t("connectButton")}
        </a>
      </div>
    );
  }

  const nickname = creator?.nickname ?? status.username ?? null;
  const avatarUrl = creator?.avatarUrl ?? status.avatarUrl ?? null;
  const canUpload = videoUrl.trim().length > 0 && !uploading;

  const handleUpload = async () => {
    setUploading(true);
    setResult(null);
    try {
      await tiktokUpload(videoUrl.trim());
      setResult("success");
    } catch (e) {
      setResult(e instanceof Error ? e.message : t("error"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h3 style={titleStyle}>{t("title")}</h3>

      {/* (1) VERPLICHT: creator-username + avatar vóór de upload. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          background: "var(--surface, #EFE8D8)",
          borderRadius: "var(--radius, 8px)",
          marginBottom: 16,
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={nickname ?? "TikTok"}
            style={{ width: 36, height: 36, borderRadius: "50%" }}
          />
        ) : (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--border, #E5DFD0)",
            }}
          />
        )}
        <div>
          <div style={{ fontSize: 12, color: "var(--tl)" }}>
            {t("creatorLabel")}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {nickname ?? "—"}
          </div>
        </div>
      </div>

      {/* Video-bron. Voorlopig een URL-veld; de media-library-picker +
          get-filly.com-mediaroute (voor PULL_FROM_URL) zijn de follow-up. */}
      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="tiktok-video-url"
          style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}
        >
          {t("videoUrlLabel")}
        </label>
        <input
          id="tiktok-video-url"
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder={t("videoUrlPlaceholder")}
          style={inputStyle}
        />
        <div style={hintStyle}>{t("videoUrlHint")}</div>
      </div>

      {/* (2) VERPLICHT: commercial-content-disclosure-toggle (default uit). */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
        >
          <label htmlFor="tiktok-disclose" style={{ fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {t("disclosureLabel")}
          </label>
          <button
            id="tiktok-disclose"
            type="button"
            role="switch"
            aria-checked={disclose}
            onClick={() => setDisclose((v) => !v)}
            style={{
              flexShrink: 0,
              width: 44,
              height: 24,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              padding: 2,
              background: disclose ? "var(--color-brand, #1F4A2D)" : "var(--border, #E5DFD0)",
              transition: "background 150ms ease",
            }}
          >
            <span
              style={{
                display: "block",
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#FFFFFF",
                transform: disclose ? "translateX(20px)" : "translateX(0)",
                transition: "transform 150ms ease",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }}
            />
          </button>
        </div>
        <div style={hintStyle}>{t("disclosureHint")}</div>

        {disclose && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={checkRowStyle}>
              <input
                type="checkbox"
                checked={yourBrand}
                onChange={(e) => setYourBrand(e.target.checked)}
              />
              <span>
                <strong>{t("yourBrand")}</strong>
                <span style={{ color: "var(--tl)", marginLeft: 6 }}>{t("yourBrandHint")}</span>
              </span>
            </label>
            <label style={checkRowStyle}>
              <input
                type="checkbox"
                checked={brandedContent}
                onChange={(e) => setBrandedContent(e.target.checked)}
              />
              <span>
                <strong>{t("brandedContent")}</strong>
                <span style={{ color: "var(--tl)", marginLeft: 6 }}>{t("brandedContentHint")}</span>
              </span>
            </label>
          </div>
        )}
      </div>

      {/* (3) VERPLICHT: Music-Usage-Confirmation-consenttekst bij de knop. */}
      <p style={{ fontSize: 12, color: "var(--ts)", margin: "12px 0" }}>
        {t("musicConsent")}
      </p>

      <button
        type="button"
        onClick={handleUpload}
        disabled={!canUpload}
        style={{ ...primaryBtnStyle, opacity: canUpload ? 1 : 0.55, cursor: canUpload ? "pointer" : "default" }}
      >
        {uploading ? t("uploading") : t("uploadButton")}
      </button>

      {result === "success" && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: "var(--surface, #EFE8D8)",
            borderRadius: "var(--radius, 8px)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t("successTitle")}</div>
          <div style={{ fontSize: 13, color: "var(--ts)", marginTop: 2 }}>
            {t("successBody")}
          </div>
        </div>
      )}
      {result && result !== "success" && (
        <div style={{ marginTop: 14, color: "var(--color-danger, #b00)", fontSize: 13 }}>
          {result}
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--white, #FFFFFF)",
  border: "1px solid var(--border, #E5DFD0)",
  borderRadius: "var(--radius-lg, 12px)",
  padding: 20,
  maxWidth: 560,
};
const titleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, margin: 0 };
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border, #E5DFD0)",
  borderRadius: "var(--radius, 8px)",
  fontSize: 14,
  fontFamily: "inherit",
};
const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--tl)",
  marginTop: 4,
  lineHeight: 1.4,
};
const checkRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  fontSize: 13,
  cursor: "pointer",
};
const primaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 18px",
  background: "var(--color-brand, #1F4A2D)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: "var(--radius-full, 999px)",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
};
