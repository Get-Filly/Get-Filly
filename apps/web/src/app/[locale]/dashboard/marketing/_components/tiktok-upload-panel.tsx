"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  tiktokStatus,
  tiktokCreatorInfo,
  tiktokUpload,
  type TikTokStatus,
  type TikTokCreatorInfo,
  type RestaurantMediaItem,
} from "@/lib/api";
import { useRestaurant } from "@/lib/restaurant-context";
import { MediaLibraryPicker } from "../../_components/media-library-picker";

// Map een publieke restaurant-media-URL (op *.supabase.co) naar het
// geverifieerde get-filly.com-pad (zie de rewrite in next.config.ts), zodat
// TikTok PULL_FROM_URL het bestand van een geverifieerd domein kan ophalen.
function toVerifiedUrl(supabaseUrl: string): string | null {
  const marker = "/object/public/restaurant-media/";
  const idx = supabaseUrl.indexOf(marker);
  if (idx === -1) return null;
  const path = supabaseUrl.slice(idx + marker.length).split("?")[0];
  if (!path) return null;
  return `${window.location.origin}/media/r/${path}`;
}

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
  const [picked, setPicked] = useState<RestaurantMediaItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState("");
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
  // Het bepaalt ook welke privacy-niveaus mogen (onaudited app: SELF_ONLY).
  useEffect(() => {
    if (status?.connected) {
      tiktokCreatorInfo()
        .then((info) => {
          setCreator(info);
          // Default privacy = eerste toegestane optie (vaak SELF_ONLY).
          setPrivacyLevel((p) => p || info.privacyOptions[0] || "SELF_ONLY");
        })
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
  const privacyOptions = creator?.privacyOptions ?? [];
  const canUpload = !!picked && !!privacyLevel && !uploading;

  const handleUpload = async () => {
    if (!picked) return;
    const videoUrl = toVerifiedUrl(picked.url);
    if (!videoUrl) {
      setResult(t("invalidMedia"));
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      await tiktokUpload({
        videoUrl,
        title: title.trim() || undefined,
        privacyLevel,
        brandOrganic: disclose && yourBrand,
        brandedContent: disclose && brandedContent,
      });
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

      {/* Video-bron: kies uit de media-bibliotheek (restaurant-media, publiek).
          De gekozen URL wordt naar het get-filly.com-pad gemapt (PULL_FROM_URL). */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          {t("videoUrlLabel")}
        </div>
        {picked ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              border: "1px solid var(--border, #E5DFD0)",
              borderRadius: "var(--radius, 8px)",
            }}
          >
            <span style={{ fontSize: 13, flex: 1, wordBreak: "break-all" }}>
              <span style={{ color: "var(--tl)" }}>{t("selectedLabel")}: </span>
              {picked.file_name}
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              style={{ ...secondaryBtnStyle }}
            >
              {t("changeButton")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={secondaryBtnStyle}
          >
            {t("pickButton")}
          </button>
        )}
        <div style={hintStyle}>{t("videoUrlHint")}</div>
      </div>

      <MediaLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(item) => {
          setPicked(item);
          setPickerOpen(false);
          setResult(null);
        }}
      />

      {/* Titel/caption (Direct Post). */}
      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="tiktok-title"
          style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}
        >
          {t("titleLabel")}
        </label>
        <input
          id="tiktok-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          maxLength={150}
          style={{
            width: "100%",
            padding: "8px 10px",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: "var(--radius, 8px)",
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Privacy-niveau (Direct Post vereist dit; opties komen uit creator_info,
          onaudited app: alleen SELF_ONLY). */}
      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="tiktok-privacy"
          style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}
        >
          {t("privacyLabel")}
        </label>
        <select
          id="tiktok-privacy"
          value={privacyLevel}
          onChange={(e) => setPrivacyLevel(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: "var(--radius, 8px)",
            fontSize: 14,
            fontFamily: "inherit",
            background: "var(--white, #FFFFFF)",
          }}
        >
          {privacyOptions.length === 0 && privacyLevel && (
            <option value={privacyLevel}>{t(`privacy.${privacyLevel}`)}</option>
          )}
          {privacyOptions.map((opt) => (
            <option key={opt} value={opt}>
              {t(`privacy.${opt}`)}
            </option>
          ))}
        </select>
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
        {uploading ? t("publishing") : t("publishButton")}
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
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {t("successTitleDirect")}
          </div>
          <div style={{ fontSize: 13, color: "var(--ts)", marginTop: 2 }}>
            {t("successBodyDirect")}
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
const secondaryBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid var(--border, #E5DFD0)",
  background: "transparent",
  color: "var(--text, #18181B)",
  borderRadius: "var(--radius, 8px)",
  cursor: "pointer",
  flexShrink: 0,
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
