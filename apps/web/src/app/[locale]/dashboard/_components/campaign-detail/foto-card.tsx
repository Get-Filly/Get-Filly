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
import { useTranslations } from "next-intl";
import {
  deleteCampaignMedia,
  uploadCampaignMedia,
  type RestaurantMediaItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MediaLibraryPicker } from "../media-library-picker";

const ACCEPT_IMAGE = "image/jpeg,image/jpg,image/png,image/webp,image/gif";
const ACCEPT_VIDEO = "video/mp4,video/quicktime,video/webm";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

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
  // allowVideo: TikTok-campagnes vereisen een video (mp4/mov/webm). Voor
  // andere kanalen blijft het bij foto's. Stuurt accept + validatie.
  allowVideo?: boolean;
  onMediaChanged: (newSignedUrl: string | null) => void;
};

export function FotoCard({
  campaignId,
  signedUrl,
  fileName,
  canEdit,
  allowVideo = false,
  onMediaChanged,
}: Props) {
  const t = useTranslations("dash__components_campaign_detail_foto_card");
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
      setError(t("errors.libraryLoadFailed"));
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
          : t("errors.libraryLinkFailed"),
      );
    } finally {
      setUploading(false);
    }
  };

  const validateAndUpload = async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !(allowVideo && isVideo)) {
      setError(t("errors.imagesOnly"));
      return;
    }
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      setError(
        t("errors.fileTooLarge", {
          size: Math.round(file.size / 1024 / 1024),
        }),
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
        e instanceof Error ? e.message : t("errors.uploadFailed"),
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
    if (!confirm(t("confirmRemove"))) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteCampaignMedia(campaignId);
      onMediaChanged(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("errors.removeFailed"),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">{t("title")}</div>
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
              alt={fileName ?? t("photoAlt")}
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
                {fileName ?? t("photoAlt")}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--ts)",
                  marginTop: 2,
                }}
              >
                {t("linkedToCampaign")}
              </div>
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() => setPickerOpen(true)}
                  disabled={busy}
                >
                  {t("change")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={remove}
                  disabled={busy}
                  loading={deleting}
                  style={{ color: "var(--color-danger, #B91C1C)" }}
                >
                  {t("remove")}
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
              {t("empty")}
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() => setPickerOpen(true)}
                  disabled={busy}
                >
                  {t("pickFromLibrary")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                  loading={uploading}
                >
                  {t("uploadNew")}
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
          accept={allowVideo ? `${ACCEPT_IMAGE},${ACCEPT_VIDEO}` : ACCEPT_IMAGE}
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
        mode={allowVideo ? "video" : "image"}
      />
    </div>
  );
}
