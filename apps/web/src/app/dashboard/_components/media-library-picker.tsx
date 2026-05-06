"use client";

import { useEffect, useState } from "react";
import {
  fetchRestaurantMedia,
  type RestaurantMediaItem,
} from "../../../lib/api";
import { Button } from "../../../components/ui/button";

// ============================================================
// MediaLibraryPicker, modal voor "Kies uit bibliotheek"
// ============================================================
//
// Toont alle foto's uit restaurant_media in een grid. Bij selectie
// returnt de modal het gekozen item via onPick. De parent regelt
// daarna wat er gebeurt (bv. uploaden naar campaign_media via
// fetch-as-blob).
//
// Geen filteren/zoeken voor MVP, bij 20 foto's max past 't allemaal
// op één scherm. Uploadknop verwijst naar de account-pagina (niet
// dubbel implementeren met de RestaurantMediaSection).
// ============================================================

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (item: RestaurantMediaItem) => void;
};

export function MediaLibraryPicker({ open, onClose, onPick }: Props) {
  const [items, setItems] = useState<RestaurantMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchRestaurantMedia()
      .then((fresh) => {
        setItems(fresh);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Foto's ophalen mislukt.");
      })
      .finally(() => setLoading(false));
  }, [open]);

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
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>Kies uit bibliotheek</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
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
            Foto's laden…
          </div>
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
            Nog geen foto's in je bibliotheek.<br />
            Ga naar <strong>Account → Foto-bibliotheek</strong> om foto's te uploaden.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {items.map((item) => (
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
                <div
                  style={{
                    aspectRatio: "1 / 1",
                    background: "var(--bg-soft, #F5F3EE)",
                    backgroundImage: item.url ? `url(${item.url})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
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
            Annuleren
          </Button>
        </div>
      </div>
    </div>
  );
}
