"use client";

// ============================================================
// FotoCard, compacte foto/video-keuze voor campaign-detail
// ============================================================
//
// Vervangt de full-width CampaignMediaSlot-dropzone op de unified-
// detail-page. Twee states:
//   - Foto gekoppeld:  96x96 thumbnail (links) + bestandsnaam +
//                       Wijzig / Verwijder-knoppen (canEdit only).
//   - Geen foto:        tekst + "Kies uit bibliotheek" +
//                       "Upload nieuw"-knoppen (canEdit only).
//
// Slank ontwerp dat de pagina niet domineert. Lijkt 1-op-1 op de
// voorstel-detail-foto-rendering zodat eigenaar geen layout-shift
// ervaart bij goedkeuren.
//
// Backend-flow:
//   - Pick uit bibliotheek → fetch signed URL → blob → File →
//     uploadCampaignMedia (zelfde endpoint als nieuwe upload).
//   - Upload nieuw → bestandskeuze → uploadCampaignMedia.
//   - Verwijder → deleteCampaignMedia.
//
// onMediaChanged(newSignedUrl|null) triggert refetch in parent.

import { useRef, useState } from "react";
import {
  deleteCampaignMedia,
  uploadCampaignMedia,
  type RestaurantMediaItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MediaLibraryPicker } from "../media-library-picker";

const ACCEPT_MIME = "image/jpeg,image/jpg,image/png,image/webp,image/gif";
const MAX_BYTES = 10 * 1024 * 1024;

type Props = {
  campaignId: string;
  signedUrl: string | null;
  // Display-naam voor de thumbnail-rij. Komt uit campaign_media of
  // de bestandsnaam bij upload. Null = generieke 'Campagne-foto'-label.
  fileName?: string | null;
  // canEdit: alleen op concept-status mogen Wijzig/Verwijder/Upload-
  // knoppen worden getoond. Op ingepland/actief is alles immutable
  // en zien we alleen de thumbnail.
  canEdit: boolean;
  onMediaChanged: (newSignedUrl: string | null) => void;
};

export function FotoCard({
  campaignId,
  signedUrl,
  fileName,
  canEdit,
  onMediaChanged,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = uploading || deleting;

  // Bibliotheek-foto → fetch URL → blob → File → upload-endpoint.
  // Geen aparte backend-call: het campaign krijgt een eigen kopie
  // in campaign_media en de bibliotheek-rij blijft intact voor
  // hergebruik (zelfde patroon als CampaignMediaSlot).
  const useFromLibrary = async (item: RestaurantMediaItem) => {
    setPickerOpen(false);
    if (!item.url) {
      setError("Foto kon niet geladen worden uit de bibliotheek.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const blob = await fetch(item.url).then((r) => r.blob());
      const file = new File([blob], item.file_name, {
        type: item.mime_type,
      });
      const { signed_url } = await uploadCampaignMedia(campaignId, file);
      onMediaChanged(signed_url);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Foto uit bibliotheek koppelen mislukt.",
      );
    } finally {
      setUploading(false);
    }
  };

  const validateAndUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Alleen afbeeldingen (JPG, PNG, WebP, GIF).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(
        `Bestand te groot (${Math.round(file.size / 1024 / 1024)}MB). Max 10MB.`,
      );
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
    if (file) void validateAndUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = async () => {
    if (!canEdit || busy) return;
    if (!confirm("Foto verwijderen?")) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteCampaignMedia(campaignId);
      onMediaChanged(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Verwijderen mislukt.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">Foto of video</div>
        </div>
      </div>
      <div className="card-b">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {signedUrl ? (
          <div
            style={{ display: "flex", alignItems: "center", gap: 16 }}
          >
            <img
              src={signedUrl}
              alt={fileName ?? "Campagne-foto"}
              style={{
                width: 96,
                height: 96,
                borderRadius: 8,
                objectFit: "cover",
                border: "1px solid var(--border, #E5DFD0)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fileName ?? "Campagne-foto"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--ts)",
                  marginTop: 2,
                }}
              >
                Gekoppeld aan deze campagne.
              </div>
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() => setPickerOpen(true)}
                  disabled={busy}
                >
                  Wijzig
                </Button>
                <Button
                  variant="secondary"
                  onClick={remove}
                  disabled={busy}
                  loading={deleting}
                  style={{ color: "var(--color-danger, #B91C1C)" }}
                >
                  Verwijder
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 14, color: "var(--ts)" }}>
              Nog geen foto of video gekoppeld.
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() => setPickerOpen(true)}
                  disabled={busy}
                >
                  Kies uit bibliotheek
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                  loading={uploading}
                >
                  Upload nieuw
                </Button>
              </div>
            )}
          </div>
        )}
        {/* Hidden file input — fungeert als upload-trigger voor de
            "Upload nieuw"-knop. Native picker, zelfde MIME-filter
            als het backend-endpoint. */}
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
              marginTop: 10,
              fontSize: 12,
              color: "var(--color-danger, #B91C1C)",
            }}
          >
            {error}
          </div>
        )}
      </div>
      <MediaLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(item) => void useFromLibrary(item)}
      />
    </div>
  );
}
