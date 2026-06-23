"use client";

// ============================================================
// MissendeAspectenCard, per kanaal de openstaande velden — inline fix-hub
// ============================================================
//
// Toont een rij per kanaal met de velden die nog ingevuld moeten
// worden. ● = vereist (blokkeert Goedkeuren), ○ = optioneel.
//
// Sinds 2026-06-23: klik op een veld klapt INLINE een paneel uit waarin
// je het meteen regelt (geen scroll-jump meer):
//   - foto/video → bibliotheek-picker + optie "gebruik voor alle kanalen"
//   - datum      → Filly's voorstel accepteren of zelf kiezen
//   - onderwerp  → tekstveld met het voorstel + andere variant kiezen
//   - tekst      → textarea met de inhoud + andere variant kiezen
//
// De persistentie verschilt per pagina (campagne- vs suggestie-endpoints),
// dus die komt via callbacks binnen; de kaart regelt UI/state/picker zelf.
//
// Verbergt zich automatisch als geen enkel kanaal nog actie nodig heeft.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  PLATFORM_LABEL as SHORT_PLATFORM_LABEL,
  getMissingLabel,
  type ChecklistItem,
  type MissingField,
} from "@/lib/campaign-checks";
import { Button } from "@/components/ui/button";
import { type RestaurantMediaItem } from "@/lib/api";
import { MediaLibraryPicker } from "../media-library-picker";
import { toDatetimeLocalValue, formatDutchDateTime } from "./types";

export type MissendeAspectenChannel = {
  id: string;
  platform: string;
  items: ChecklistItem[];
  // Inline-bewerk-data per kanaal:
  subjectLine: string;
  body: string;
  variants: Array<{ subject_line?: string | null; body?: string }>;
  selectedIndex: number;
  // Filly's voorgestelde verzendmoment (of een fallback); null = geen.
  fillyIso: string | null;
};

type Props = {
  channels: MissendeAspectenChannel[];
  // Kanalen die foto's/video's ondersteunen (mail uitgezonderd), met of ze
  // al media hebben — voor "gebruik voor alle kanalen".
  mediaChannels: Array<{ id: string; hasMedia: boolean }>;
  canEdit: boolean;
  localeTag: string;
  // Persistentie (page-specifiek). Targetten een kanaal op id.
  onSaveText: (
    channelId: string,
    index: number,
    patch: { subject_line?: string; body: string },
  ) => Promise<void>;
  onSelectVariant: (channelId: string, index: number) => Promise<void>;
  onSetSchedule: (channelId: string, iso: string) => Promise<void>;
  onApplyMedia: (
    channelIds: string[],
    item: RestaurantMediaItem,
  ) => Promise<void>;
  // Genereer nieuwe versies (incl. onderwerp) voor één kanaal.
  onRegenerate: (channelId: string) => Promise<void>;
};

export function MissendeAspectenCard({
  channels,
  mediaChannels,
  canEdit,
  localeTag,
  onSaveText,
  onSelectVariant,
  onSetSchedule,
  onApplyMedia,
  onRegenerate,
}: Props) {
  const t = useTranslations(
    "dash__components_campaign_detail_missende_aspecten_card",
  );
  // Welk veld is uitgeklapt? Key = `${channelId}:${field}`.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const withItems = channels.filter((c) => c.items.length > 0);
  if (withItems.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">{t("title")}</div>
        </div>
      </div>
      <div className="card-b">
        <div style={{ display: "flex", flexDirection: "column" }}>
          {withItems.map((c, idx) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "10px 0",
                borderTop:
                  idx === 0 ? "none" : "1px solid var(--border, #E5DFD0)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text, #18181B)",
                    minWidth: 110,
                    flexShrink: 0,
                    paddingTop: 2,
                  }}
                >
                  {SHORT_PLATFORM_LABEL[c.platform] ?? c.platform}
                </div>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: 14, flex: 1 }}
                >
                  {c.items.map((item) => {
                    const key = `${c.id}:${item.field}`;
                    return (
                      <ChecklistButton
                        key={item.field}
                        item={item}
                        platform={c.platform}
                        open={openKey === key}
                        disabled={!canEdit}
                        onClick={() =>
                          setOpenKey((cur) => (cur === key ? null : key))
                        }
                      />
                    );
                  })}
                </div>
              </div>

              {/* Inline fix-panelen voor dit kanaal */}
              {canEdit &&
                c.items.map((item) => {
                  const key = `${c.id}:${item.field}`;
                  if (openKey !== key) return null;
                  return (
                    <InlineFixPanel
                      key={key}
                      field={item.field}
                      channel={c}
                      mediaChannels={mediaChannels}
                      localeTag={localeTag}
                      onClose={() => setOpenKey(null)}
                      onSaveText={onSaveText}
                      onSelectVariant={onSelectVariant}
                      onSetSchedule={onSetSchedule}
                      onApplyMedia={onApplyMedia}
                      onRegenerate={onRegenerate}
                    />
                  );
                })}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px solid var(--border, #E5DFD0)",
            fontSize: 11,
            color: "var(--tl)",
            display: "flex",
            gap: 16,
          }}
        >
          <span>
            <span style={{ color: "var(--text)", fontSize: 12 }}>●</span>{" "}
            {t("legendRequired")}
          </span>
          <span>
            <span style={{ color: "var(--tl)", fontSize: 12 }}>○</span>{" "}
            {t("legendOptional")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// InlineFixPanel, het uitklap-paneel per veld
// ============================================================
function InlineFixPanel({
  field,
  channel,
  mediaChannels,
  localeTag,
  onClose,
  onSaveText,
  onSelectVariant,
  onSetSchedule,
  onApplyMedia,
  onRegenerate,
}: {
  field: MissingField;
  channel: MissendeAspectenChannel;
  mediaChannels: Array<{ id: string; hasMedia: boolean }>;
  localeTag: string;
  onClose: () => void;
  onSaveText: (
    channelId: string,
    index: number,
    patch: { subject_line?: string; body: string },
  ) => Promise<void>;
  onSelectVariant: (channelId: string, index: number) => Promise<void>;
  onSetSchedule: (channelId: string, iso: string) => Promise<void>;
  onApplyMedia: (
    channelIds: string[],
    item: RestaurantMediaItem,
  ) => Promise<void>;
  onRegenerate: (channelId: string) => Promise<void>;
}) {
  const t = useTranslations(
    "dash__components_campaign_detail_missende_aspecten_card",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Klik buiten het paneel → sluiten. De bibliotheek-modal is een DOM-kind
  // van het paneel, dus klikken daarin telt als 'binnen' en sluit niet.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (busy) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [busy, onClose]);

  // Sluit ná een geslaagde actie (opslaan/kiezen/accepteren).
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inlineError"));
    } finally {
      setBusy(false);
    }
  };

  // Blijf open ná de actie (bv. genereren: je wilt de nieuwe versies zien).
  const runStay = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inlineError"));
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode = null;
  if (field === "photo") {
    body = (
      <PhotoFix
        channel={channel}
        mediaChannels={mediaChannels}
        busy={busy}
        onApply={(channelIds, item) =>
          run(() => onApplyMedia(channelIds, item))
        }
      />
    );
  } else if (field === "date") {
    body = (
      <DateFix
        channel={channel}
        localeTag={localeTag}
        busy={busy}
        onSet={(iso) => run(() => onSetSchedule(channel.id, iso))}
      />
    );
  } else {
    body = (
      <TextFix
        field={field}
        channel={channel}
        busy={busy}
        onSave={(value) =>
          run(() =>
            onSaveText(
              channel.id,
              channel.selectedIndex,
              field === "subject"
                ? { subject_line: value, body: channel.body }
                : { body: value },
            ),
          )
        }
        onPickVariant={(idx) => run(() => onSelectVariant(channel.id, idx))}
        onRegenerate={() => runStay(() => onRegenerate(channel.id))}
      />
    );
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        marginLeft: 126,
        padding: "12px 36px 14px 14px",
        background: "var(--bg-soft, #F5F3EE)",
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: 8,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("inlineClose")}
        title={t("inlineClose")}
        style={{
          position: "absolute",
          top: 8,
          right: 10,
          width: 24,
          height: 24,
          lineHeight: 1,
          background: "transparent",
          border: "none",
          fontSize: 15,
          color: "var(--tl, #6B6F71)",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
      {body}
      {error && <ErrorLine text={error} />}
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: "var(--danger, #B3261E)" }}>
      {text}
    </div>
  );
}

// ---------- Foto/video ----------
function PhotoFix({
  channel,
  mediaChannels,
  busy,
  onApply,
}: {
  channel: MissendeAspectenChannel;
  mediaChannels: Array<{ id: string; hasMedia: boolean }>;
  busy: boolean;
  onApply: (channelIds: string[], item: RestaurantMediaItem) => void;
}) {
  const t = useTranslations(
    "dash__components_campaign_detail_missende_aspecten_card",
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // Andere media-kanalen (mail is door de parent al uitgesloten).
  const others = mediaChannels.filter((c) => c.id !== channel.id);
  const withoutPhoto = others.filter((c) => !c.hasMedia);
  const withPhoto = others.filter((c) => c.hasMedia);
  // Default: dezelfde media ook op de andere kanalen die nog niets hebben.
  const [applyWithout, setApplyWithout] = useState(withoutPhoto.length > 0);
  const [overwrite, setOverwrite] = useState(false);
  const isVideoChannel = channel.platform === "tiktok";

  const targetIds = [
    channel.id,
    ...(applyWithout ? withoutPhoto.map((c) => c.id) : []),
    ...(overwrite ? withPhoto.map((c) => c.id) : []),
  ];

  const cb: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    cursor: "pointer",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13, color: "var(--ts)" }}>{t("photoIntro")}</div>
      {withoutPhoto.length > 0 && (
        <label style={cb}>
          <input
            type="checkbox"
            checked={applyWithout}
            onChange={(e) => setApplyWithout(e.target.checked)}
            style={{ accentColor: "var(--color-brand, #1F4A2D)" }}
          />
          {t("photoApplyOthers", { count: withoutPhoto.length })}
        </label>
      )}
      {withPhoto.length > 0 && (
        <label style={cb}>
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            style={{ accentColor: "var(--color-brand, #1F4A2D)" }}
          />
          {t("photoOverwrite", { count: withPhoto.length })}
        </label>
      )}
      {targetIds.length > 1 && (
        <div style={{ fontSize: 12, color: "var(--tl)" }}>{t("photoShared")}</div>
      )}
      <div>
        <Button
          variant="secondary"
          onClick={() => setPickerOpen(true)}
          disabled={busy}
        >
          {t("photoPick")}
        </Button>
      </div>
      <MediaLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialFilter={isVideoChannel ? "video" : "all"}
        onPick={(item) => {
          setPickerOpen(false);
          onApply(targetIds, item);
        }}
      />
    </div>
  );
}

// ---------- Datum ----------
function DateFix({
  channel,
  localeTag,
  busy,
  onSet,
}: {
  channel: MissendeAspectenChannel;
  localeTag: string;
  busy: boolean;
  onSet: (iso: string) => void;
}) {
  const t = useTranslations(
    "dash__components_campaign_detail_missende_aspecten_card",
  );
  const [draft, setDraft] = useState(
    toDatetimeLocalValue(channel.fillyIso ?? new Date().toISOString()),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {channel.fillyIso && (
        <div style={{ fontSize: 13, color: "var(--ts)" }}>
          {t("dateFillySuggests")}{" "}
          <strong>{formatDutchDateTime(channel.fillyIso, localeTag)}</strong>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {channel.fillyIso && (
          <Button
            onClick={() => onSet(channel.fillyIso!)}
            disabled={busy}
            loading={busy}
          >
            {t("dateAccept")}
          </Button>
        )}
        <input
          type="datetime-local"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{
            padding: "7px 10px",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "inherit",
            background: "var(--white, #FFFFFF)",
          }}
        />
        <Button
          variant="secondary"
          onClick={() => draft && onSet(new Date(draft).toISOString())}
          disabled={busy || !draft}
        >
          {t("dateSave")}
        </Button>
      </div>
    </div>
  );
}

// ---------- Onderwerp / tekst ----------
function TextFix({
  field,
  channel,
  busy,
  onSave,
  onPickVariant,
  onRegenerate,
}: {
  field: MissingField;
  channel: MissendeAspectenChannel;
  busy: boolean;
  onSave: (value: string) => void;
  onPickVariant: (idx: number) => void;
  onRegenerate: () => void;
}) {
  const t = useTranslations(
    "dash__components_campaign_detail_missende_aspecten_card",
  );
  const isSubject = field === "subject";
  const initial = isSubject ? channel.subjectLine : channel.body;
  const [value, setValue] = useState(initial);
  // Andere varianten als snelkeuze (alleen wanneer er meer dan 1 is).
  const altVariants = channel.variants
    .map((v, idx) => ({ v, idx }))
    .filter((x) => x.idx !== channel.selectedIndex)
    .filter((x) =>
      isSubject ? !!x.v.subject_line?.trim() : !!x.v.body?.trim(),
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {isSubject ? (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("subjectPlaceholder")}
          maxLength={200}
          style={{
            padding: "8px 10px",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "inherit",
            background: "var(--white, #FFFFFF)",
          }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("bodyPlaceholder")}
          maxLength={5000}
          rows={5}
          style={{
            padding: "8px 10px",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: 6,
            fontSize: 13,
            lineHeight: 1.55,
            fontFamily: "inherit",
            background: "var(--white, #FFFFFF)",
            resize: "vertical",
          }}
        />
      )}
      {altVariants.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 11, color: "var(--tl)" }}>
            {t("textOtherVersions")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {altVariants.map(({ v, idx }) => (
              <button
                key={idx}
                type="button"
                onClick={() => onPickVariant(idx)}
                disabled={busy}
                title={isSubject ? (v.subject_line ?? "") : (v.body ?? "")}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  borderRadius: 999,
                  border: "1px solid var(--border, #E5DFD0)",
                  background: "var(--white, #FFFFFF)",
                  cursor: busy ? "not-allowed" : "pointer",
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {(isSubject ? v.subject_line : v.body)?.slice(0, 40)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          onClick={() => onSave(value)}
          disabled={busy || !value.trim()}
          loading={busy}
        >
          {t("textSave")}
        </Button>
        {/* Filly nieuwe versies (incl. onderwerp) laten genereren. Blijft
            open zodat je daarna de gewenste versie kunt kiezen. */}
        <Button variant="secondary" onClick={onRegenerate} disabled={busy}>
          {t("textGenerate")}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// ChecklistButton, één openstaand veld als klikbare regel
// ============================================================
function ChecklistButton({
  item,
  platform,
  open,
  disabled,
  onClick,
}: {
  item: ChecklistItem;
  platform: string;
  open: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useTranslations(
    "dash__components_campaign_detail_missende_aspecten_card",
  );
  const bullet = item.required ? "●" : "○";
  const color = item.required
    ? "var(--text, #18181B)"
    : "var(--tl, #6B6F71)";
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        fontSize: 13,
        color,
        fontWeight: item.required ? 500 : 400,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      title={item.required ? t("tooltipRequired") : t("tooltipOptional")}
    >
      <span style={{ fontSize: 8, lineHeight: 1 }}>{bullet}</span>
      <span
        style={{
          textDecoration: "underline",
          textUnderlineOffset: 2,
          textDecorationColor: "rgba(24, 24, 27, 0.3)",
        }}
      >
        {getMissingLabel(item.field, platform)}
      </span>
      {!disabled && (
        <span style={{ fontSize: 12, color: "var(--tl)" }}>
          {open ? "▾" : "▸"}
        </span>
      )}
    </button>
  );
}
