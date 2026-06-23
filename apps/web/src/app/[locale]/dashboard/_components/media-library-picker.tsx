"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  fetchRestaurantMedia,
  uploadRestaurantMedia,
  type RestaurantMediaItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

// ============================================================
// MediaLibraryPicker, modal voor "Kies uit bibliotheek"
// ============================================================
//
// Toont alle foto's uit restaurant_media in een grid. Bij selectie
// returnt de modal het gekozen item via onPick. De parent regelt
// daarna wat er gebeurt (bv. uploaden naar campaign_media via
// fetch-as-blob).
//
// Per 2026-05-12 ook upload direct vanuit deze modal (i.p.v. de
// eigenaar door te sturen naar Account → Foto-bibliotheek). Werkt
// zowel via file-picker als drag-and-drop. Nieuwe foto verschijnt
// bovenaan de grid; eigenaar kan 'm dan meteen kiezen.
// ============================================================

const MAX_PHOTOS = 20;

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (item: RestaurantMediaItem) => void;
  // "video" toont + uploadt video's (TikTok-campagnes); default "image".
  // Zelfde bibliotheek (restaurant_media), gefilterd op mediatype.
  mode?: "image" | "video";
};

export function MediaLibraryPicker({
  open,
  onClose,
  onPick,
  mode = "image",
}: Props) {
  const t = useTranslations("dash__components_media_library_picker");
  const isVideoMode = mode === "video";
  const [items, setItems] = useState<RestaurantMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchRestaurantMedia()
      .then((fresh) => {
        setItems(fresh);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("errors.fetchFailed"));
      })
      .finally(() => setLoading(false));
  }, [open, t]);

  // Bibliotheek is gedeeld; toon alleen het gevraagde mediatype.
  const shown = items.filter((it) =>
    isVideoMode
      ? it.mime_type.startsWith("video/")
      : it.mime_type.startsWith("image/"),
  );
  // Cap geldt op de hele bibliotheek (foto's + video's samen).
  const isFull = items.length >= MAX_PHOTOS;

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    if (isFull) {
      setError(t("errors.libraryFull", { max: MAX_PHOTOS }));
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const newItem = await uploadRestaurantMedia(file);
      // Direct bovenaan in de grid laten zien; eigenaar kan 'm
      // meteen kiezen zonder de modal te sluiten.
      setItems((prev) => [newItem, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.uploadFailed"));
    } finally {
      setUploading(false);
      // Reset input zodat dezelfde file 2x achter elkaar gekozen kan worden.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Drag-and-drop op de hele modal-body. Browser doet z'n eigen
  // open-file-dialog als je niet preventDefault, vandaar de stop.
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 24,
          maxWidth: 720,
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          // Visuele hint dat de drop-zone "live" is wanneer een file
          // boven de modal hangt.
          outline: dragOver
            ? "2px dashed var(--color-brand, #1F4A2D)"
            : "none",
          outlineOffset: -8,
        }}
        onClick={(e) => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>
            {isVideoMode ? t("titleVideo") : t("title")}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept={
                isVideoMode
                  ? "video/mp4,video/quicktime,video/webm"
                  : "image/jpeg,image/png,image/webp"
              }
              style={{ display: "none" }}
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isFull || uploading}
              loading={uploading}
              title={
                isFull
                  ? t("errors.libraryFull", { max: MAX_PHOTOS })
                  : t("uploadTitle")
              }
            >
              {isVideoMode ? t("uploadVideo") : t("uploadPhoto")}
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 18,
                cursor: "pointer",
                color: "var(--tl, #6B6F71)",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Status-strook: aantal foto's + Filly-tagging-hint tijdens
            upload. Geeft 'm gewicht zodat de upload-knop niet als
            "stilstand" voelt — Filly doet 1-2s vision-tagging. */}
        <div
          style={{
            fontSize: 12,
            color: "var(--tl, #6B6F71)",
            marginBottom: 12,
          }}
        >
          {t.rich("photoCount", {
            count: shown.length,
            max: MAX_PHOTOS,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
          {uploading && (
            <span style={{ marginLeft: 8 }}>{t("taggingHint")}</span>
          )}
          {!uploading && (
            <span style={{ marginLeft: 8 }}>{t("dragHint")}</span>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: "10px 12px",
              marginBottom: 12,
              background: "var(--danger-soft, #FEEAEA)",
              color: "var(--danger, #B3261E)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div
            style={{
              padding: "40px 16px",
              textAlign: "center",
              color: "var(--tl, #6B6F71)",
            }}
          >
            {t("loadingPhotos")}
          </div>
        ) : shown.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              background: "var(--bg-soft, #F5F3EE)",
              borderRadius: 8,
              textAlign: "center",
              fontSize: 14,
              color: "var(--tl, #6B6F71)",
              lineHeight: 1.6,
            }}
          >
            {t("emptyTitle")}
            <br />
            <Button
              variant="primary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              loading={uploading}
              style={{ marginTop: 10 }}
            >
              {t("uploadFirstPhoto")}
            </Button>
            <div style={{ fontSize: 12, marginTop: 8 }}>
              {t("emptyDragHint")}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {shown.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick(item)}
                title={item.description ?? ""}
                style={{
                  padding: 0,
                  border: "1px solid var(--border, #e5e5e5)",
                  borderRadius: 8,
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "white",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {item.mime_type.startsWith("video/") ? (
                  <video
                    src={item.url}
                    muted
                    playsInline
                    preload="metadata"
                    style={{
                      aspectRatio: "1 / 1",
                      width: "100%",
                      objectFit: "cover",
                      background: "var(--bg-soft, #F5F3EE)",
                      display: "block",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      aspectRatio: "1 / 1",
                      background: "var(--bg-soft, #F5F3EE)",
                      backgroundImage: item.url
                        ? `url(${item.url})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                )}
                {item.description && (
                  <div
                    style={{
                      padding: "6px 8px",
                      fontSize: 11,
                      color: "var(--tl, #6B6F71)",
                      lineHeight: 1.3,
                      textAlign: "left",
                      minHeight: 28,
                    }}
                  >
                    {item.description.length > 60
                      ? item.description.slice(0, 60) + "…"
                      : item.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 16,
          }}
        >
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
