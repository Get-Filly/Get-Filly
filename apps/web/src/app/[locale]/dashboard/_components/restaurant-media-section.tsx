"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  deleteRestaurantMedia,
  fetchRestaurantMedia,
  uploadRestaurantMedia,
  type RestaurantMediaItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

// ============================================================
// RestaurantMediaSection, foto-bibliotheek op account-pagina
// ============================================================
//
// Toont een grid van geüploade foto's met thumbnail, beschrijving en
// tags (door Filly gegenereerd bij upload). Eigenaar kan uploaden
// (drag-and-drop of file-picker) en verwijderen.
//
// Cap: 20 foto's. Bij vol bestand uitgeschakeld upload-knop met
// uitleg dat eerst een foto verwijderd moet worden.
//
// Filly gebruikt deze foto's straks in campagne-suggesties en in de
// "Kies uit bibliotheek"-modal op de campagne-detail-pagina.
// ============================================================

const MAX_PHOTOS = 20;

export function RestaurantMediaSection() {
  const t = useTranslations("dash__components_restaurant_media_section");
  const [items, setItems] = useState<RestaurantMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-item busy-state (id → true) voor delete-actie zodat we niet
  // de hele grid disablen tijdens een single delete.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    try {
      const fresh = await fetchRestaurantMedia();
      setItems(fresh);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.fetchFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const newItem = await uploadRestaurantMedia(file);
      setItems((prev) => [newItem, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.uploadFailed"));
    } finally {
      setUploading(false);
      // Reset input zodat dezelfde file 2x achter elkaar gekozen kan worden
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("deleteConfirm"))) {
      return;
    }
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await deleteRestaurantMedia(id);
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.deleteFailed"));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const isFull = items.length >= MAX_PHOTOS;

  return (
    <div className="form-section">
      <div className="form-section-title">{t("title")}</div>
      <div className="form-section-desc">
        {t("description", { max: MAX_PHOTOS })}
      </div>

      {/* Top-rij: status + upload-knop */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          marginBottom: 16,
          background: "var(--bg-soft, #F5F3EE)",
          borderRadius: 8,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text, #1a1a1a)" }}>
          {t.rich("count", {
            count: items.length,
            max: MAX_PHOTOS,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
          {uploading && (
            <span style={{ marginLeft: 8, color: "var(--tl, #6B6F71)" }}>
              {t("tagging")}
            </span>
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isFull || uploading}
            title={isFull ? t("uploadFullTitle") : t("uploadTitle")}
            loading={uploading}
          >
            {t("uploadButton")}
          </Button>
        </div>
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
        <div style={{ color: "var(--tl, #6B6F71)" }}>{t("loading")}</div>
      ) : items.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            background: "var(--bg-soft, #F5F3EE)",
            borderRadius: 8,
            textAlign: "center",
            fontSize: 14,
            color: "var(--tl, #6B6F71)",
            lineHeight: 1.5,
          }}
        >
          {t("emptyState")}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              busy={!!busy[item.id]}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MediaCard, een tegel in de grid
// ============================================================

function MediaCard({
  item,
  busy,
  onDelete,
}: {
  item: RestaurantMediaItem;
  busy: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("dash__components_restaurant_media_section");
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--border, #e5e5e5)",
        borderRadius: 10,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        opacity: busy ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      <div
        style={{
          aspectRatio: "1 / 1",
          background: "var(--bg-soft, #F5F3EE)",
          backgroundImage: item.url ? `url(${item.url})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div style={{ padding: 10, flex: 1, display: "flex", flexDirection: "column" }}>
        {item.description ? (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.4,
              color: "var(--text, #1a1a1a)",
              minHeight: 32,
            }}
            title={item.description}
          >
            {item.description.length > 80
              ? item.description.slice(0, 80) + "…"
              : item.description}
          </div>
        ) : (
          <div
            style={{
              fontSize: 11,
              color: "var(--tl, #9CA3AF)",
              fontStyle: "italic",
            }}
          >
            {t("noDescription")}
          </div>
        )}

        {item.tags.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginTop: 6,
            }}
          >
            {item.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                style={{
                  background: "var(--brand-soft, #EDF2EE)",
                  color: "var(--brand, #1F4A2D)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 10,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: "auto",
            paddingTop: 8,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title={t("deleteTitle")}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--tl, #9CA3AF)",
              fontSize: 12,
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            {t("deleteButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
