"use client";

import { useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import {
  deleteCampaignMedia,
  uploadCampaignMedia,
} from "../../../lib/api";

// ============================================================
// CampaignMediaSlot — upload + preview voor campagne-foto
// ============================================================
// Vervangt de 📷-emoji-placeholder in de social-preview. Twee
// states:
//   - Geen foto: drop-zone "Sleep een foto of klik om te uploaden"
//   - Foto aanwezig: <img> + "✕ Verwijder"-knop in hoek
//
// Drag-en-drop ondersteunt jpg/png/webp/gif. Max 10MB. Backend doet
// finale validatie; client doet alleen preventieve checks zodat we
// niet zinloos een 10MB-PDF uploaden.
//
// Bij upload-succes roept onMediaChanged(newSignedUrl) aan zodat
// parent (detail-page) de fresh URL heeft. Bij delete: roept
// onMediaChanged(null) aan zodat de placeholder terugkomt.
//
// Geen edit-form-mode: preview is altijd zichtbaar (ook in edit-
// modus), upload werkt alleen op status='concept'. Disabled-state
// voor andere statussen.

const ACCEPT_MIME = "image/jpeg,image/jpg,image/png,image/webp,image/gif";
const MAX_BYTES = 10 * 1024 * 1024;

export function CampaignMediaSlot({
  campaignId,
  signedUrl,
  editable,
  onMediaChanged,
  aspectRatio = "1 / 1",
}: {
  campaignId: string;
  // Huidige signed URL (uit campaign.content.media_urls[0] of
  // .media_url). Null = geen foto.
  signedUrl: string | null;
  // Alleen bij concept-status. Andere statussen tonen alleen de
  // preview zonder upload-/delete-knoppen.
  editable: boolean;
  onMediaChanged: (newSignedUrl: string | null) => void;
  // Default 1:1 voor Instagram-feed. Stories zou 9:16 zijn, maar
  // dat regelen we later via een platform-keuze.
  aspectRatio?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = uploading || deleting;

  const validate = (file: File): string | null => {
    if (!file.type.startsWith("image/")) {
      return "Alleen afbeeldingen (JPG, PNG, WebP, GIF) zijn toegestaan.";
    }
    if (file.size > MAX_BYTES) {
      return `Bestand is te groot (${Math.round(file.size / 1024 / 1024)}MB). Max 10MB.`;
    }
    return null;
  };

  const upload = async (file: File) => {
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const { signed_url } = await uploadCampaignMedia(campaignId, file);
      onMediaChanged(signed_url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Upload mislukt. Probeer opnieuw.",
      );
    } finally {
      setUploading(false);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    // Reset input zodat dezelfde file opnieuw kan worden gekozen
    // als user er per ongeluk uit klikt.
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!editable || busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  const remove = async () => {
    if (!editable || busy) return;
    if (!confirm("Foto verwijderen?")) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteCampaignMedia(campaignId);
      onMediaChanged(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Verwijderen mislukt. Probeer opnieuw.",
      );
    } finally {
      setDeleting(false);
    }
  };

  // ──────────────────────────────────────────────────────
  // Render: foto aanwezig
  // ──────────────────────────────────────────────────────
  if (signedUrl) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio,
          background: "var(--surface, #EFE8D8)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {/* Disable Next/Image expressioneel: signed URLs zijn dynamisch
            en hebben geen vaste host-config; gewoon <img> is robuuster. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signedUrl}
          alt="Campagne-foto"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
        {editable && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              display: "flex",
              gap: 6,
            }}
          >
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              title="Vervangen"
              style={{
                padding: "6px 10px",
                background: "rgba(255,255,255,0.92)",
                color: "var(--text)",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: busy ? "not-allowed" : "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              }}
            >
              {uploading ? (
                "Uploaden…"
              ) : (
                <>
                  <RefreshCw size={12} style={{ marginRight: 4 }} />
                  Vervang
                </>
              )}
            </button>
            <button
              onClick={remove}
              disabled={busy}
              title="Verwijderen"
              aria-label="Foto verwijderen"
              style={{
                padding: "6px 10px",
                background: "rgba(255,255,255,0.92)",
                color: "var(--color-danger)",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: busy ? "not-allowed" : "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {deleting ? "…" : <X size={14} />}
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_MIME}
          onChange={onFileSelect}
          style={{ display: "none" }}
        />
        {error && (
          <div
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 8,
              padding: "6px 10px",
              background: "var(--red-soft, #fee)",
              color: "var(--red, #b00)",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────
  // Render: geen foto, drop-zone
  // ──────────────────────────────────────────────────────
  const baseStyle: React.CSSProperties = {
    width: "100%",
    aspectRatio,
    border: dragOver
      ? "2px dashed var(--accent, #1F4A2D)"
      : "2px dashed var(--border, #E5DFD0)",
    borderRadius: 4,
    background: dragOver
      ? "var(--accent-light, #D6E0D8)"
      : "var(--surface, #EFE8D8)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: editable && !busy ? "pointer" : "default",
    transition: "all 0.15s",
    color: "var(--ts)",
    textAlign: "center",
    padding: 16,
  };

  return (
    <div
      style={baseStyle}
      onClick={() => editable && !busy && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (editable && !busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div style={{ fontSize: 28 }}>📷</div>
      {editable ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {uploading
              ? "Uploaden…"
              : "Sleep een foto hierheen of klik om te uploaden"}
          </div>
          <div style={{ fontSize: 11, color: "var(--tl)" }}>
            JPG, PNG, WebP of GIF · max 10MB
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13 }}>Geen foto</div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MIME}
        onChange={onFileSelect}
        style={{ display: "none" }}
      />
      {error && (
        <div
          style={{
            padding: "6px 10px",
            background: "var(--red-soft, #fee)",
            color: "var(--red, #b00)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
