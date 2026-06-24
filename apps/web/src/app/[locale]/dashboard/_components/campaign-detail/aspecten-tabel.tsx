"use client";

// ============================================================
// AspectenTabel — gedeeld overzicht (Kanaal | Missende items | Datum &
// tijd | Foto's | Inhoud), één rij per kanaal.
// ============================================================
//
// Gebruikt door zowel de voorstel-detailpagina als de concept-detail-
// pagina. Puur presentatie: de pagina normaliseert z'n kanalen naar
// AspectRow[] en levert de callbacks. Het echte bewerken (InhoudCard,
// media-modal, schedule-opslag) blijft in de pagina; deze tabel toont
// het overzicht en triggert die acties.
//
// Per 2026-06-24 geëxtraheerd uit voorstel/[id]/page.tsx zodat de concept-
// detailpagina dezelfde tabel toont (i.p.v. de oude kaart-stapel).

import { Button } from "@/components/ui/button";
import {
  getMissingLabel,
  type MissingField,
} from "@/lib/campaign-checks";
import {
  PLATFORM_ICON,
  formatDutchDateTime,
  shortPlatformName,
  type Platform,
} from "./types";

const imgPlaceholder = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

export type AspectRow = {
  id: string;
  platform: Platform;
  // Vereiste, nog-ontbrekende velden (zonder datum — die heeft eigen kolom).
  missing: MissingField[];
  // Vastgelegd moment; null = nog te kiezen.
  scheduledFor: string | null;
  // Standaardwaarde voor de datetime-input bij bewerken (Filly's voorstel).
  effectiveIso: string | null;
  supportsMedia: boolean;
  mediaUrl: string | null;
  mediaIsVideo: boolean;
  subjectLine: string | null;
  bodyPreview: string;
};

export type AspectenLabels = {
  aspects: string;
  channel: string;
  missing: string;
  when: string;
  photo: string;
  content: string;
  complete: string;
  addPhoto: string;
  noPhotoMail: string;
  edit: string;
  chooseTime: string;
  save: string;
  cancel: string;
  noContentYet: string;
};

type Props = {
  rows: AspectRow[];
  canEdit: boolean;
  busy: boolean;
  activeChannelId: string | null;
  // Welk kanaal staat in datum-bewerken (= activeChannelId zodra editingSchedule).
  scheduleEditChannelId: string | null;
  draftDatetime: string;
  savingSchedule: boolean;
  localeTag: string;
  labels: AspectenLabels;
  onSelectChannel: (channelId: string) => void;
  onOpenMedia: (channelId: string) => void;
  // Pagina zet active + draftDatetime + editingSchedule.
  onStartSchedule: (channelId: string, effectiveIso: string | null) => void;
  onSaveSchedule: () => void;
  onCancelSchedule: () => void;
  onDraftDatetimeChange: (value: string) => void;
  // Pagina zet active + opent de inhoud-editor (InhoudCard) en scrollt.
  onEditContent: (channelId: string) => void;
};

export function AspectenTabel({
  rows,
  canEdit,
  busy,
  activeChannelId,
  scheduleEditChannelId,
  draftDatetime,
  savingSchedule,
  localeTag,
  labels,
  onSelectChannel,
  onOpenMedia,
  onStartSchedule,
  onSaveSchedule,
  onCancelSchedule,
  onDraftDatetimeChange,
  onEditContent,
}: Props) {
  const tdStyle: React.CSSProperties = {
    padding: "14px",
    borderBottom: "1px solid var(--border, #E5DFD0)",
    verticalAlign: "top",
  };
  const redLink: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    cursor: canEdit ? "pointer" : "default",
    color: "var(--danger, #DC2626)",
    fontWeight: 500,
    fontSize: 13,
    textDecoration: "underline",
    textUnderlineOffset: 2,
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">{labels.aspects}</div>
        </div>
      </div>
      <div className="card-b" style={{ padding: 0, overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ textAlign: "left" }}>
              {[
                labels.channel,
                labels.missing,
                labels.when,
                labels.photo,
                labels.content,
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--border, #E5DFD0)",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isRow = row.id === activeChannelId;
              const isEditingThisSchedule =
                scheduleEditChannelId === row.id;
              return (
                <tr
                  key={row.id}
                  onClick={() => {
                    if (canEdit) onSelectChannel(row.id);
                  }}
                  style={{
                    cursor: canEdit ? "pointer" : "default",
                    background: isRow
                      ? "var(--accent-light, #D6E0D8)"
                      : "transparent",
                  }}
                >
                  {/* Kanaal */}
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <span style={{ marginRight: 6 }}>
                      {PLATFORM_ICON[row.platform]}
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {shortPlatformName(row.platform)}
                    </span>
                  </td>

                  {/* Missende items */}
                  <td style={tdStyle}>
                    {row.missing.length === 0 ? (
                      <span style={{ color: "#15703A", fontSize: 13 }}>
                        ✓ {labels.complete}
                      </span>
                    ) : (
                      <span style={{ lineHeight: 1.7 }}>
                        {row.missing.map((field, idx) => (
                          <span key={field}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!canEdit) return;
                                if (field === "photo") onOpenMedia(row.id);
                                else onEditContent(row.id);
                              }}
                              disabled={!canEdit}
                              style={redLink}
                            >
                              {getMissingLabel(field, row.platform).toLowerCase()}
                            </button>
                            {idx < row.missing.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>

                  {/* Datum & tijd */}
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {isEditingThisSchedule ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="datetime-local"
                          value={draftDatetime}
                          onChange={(e) =>
                            onDraftDatetimeChange(e.target.value)
                          }
                          style={{
                            padding: "6px 8px",
                            border: "1px solid var(--border, #E5DFD0)",
                            borderRadius: 6,
                            fontSize: 13,
                            fontFamily: "inherit",
                          }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button
                            size="sm"
                            onClick={onSaveSchedule}
                            loading={savingSchedule}
                            disabled={busy && !savingSchedule}
                          >
                            {labels.save}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={onCancelSchedule}
                            disabled={savingSchedule}
                          >
                            {labels.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : row.scheduledFor ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canEdit)
                            onStartSchedule(row.id, row.effectiveIso);
                        }}
                        disabled={!canEdit}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          cursor: canEdit ? "pointer" : "default",
                          color: "var(--text)",
                          fontSize: 13,
                        }}
                      >
                        {formatDutchDateTime(row.scheduledFor, localeTag)}{" "}
                        {canEdit && (
                          <span style={{ color: "var(--ts)" }}>✎</span>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canEdit)
                            onStartSchedule(row.id, row.effectiveIso);
                        }}
                        disabled={!canEdit}
                        style={redLink}
                      >
                        {labels.chooseTime}
                      </button>
                    )}
                  </td>

                  {/* Foto's / video's */}
                  <td style={tdStyle}>
                    {!row.supportsMedia ? (
                      <span style={{ color: "var(--text)", fontSize: 13 }}>
                        {labels.noPhotoMail}
                      </span>
                    ) : row.mediaUrl ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canEdit) onOpenMedia(row.id);
                        }}
                        disabled={!canEdit}
                        style={{
                          padding: 0,
                          border: "1px solid var(--border, #E5DFD0)",
                          borderRadius: 8,
                          overflow: "hidden",
                          cursor: canEdit ? "pointer" : "default",
                          background: "var(--surface)",
                          display: "block",
                        }}
                      >
                        {row.mediaIsVideo ? (
                          <video
                            src={row.mediaUrl}
                            muted
                            playsInline
                            preload="metadata"
                            style={{
                              width: 56,
                              height: 56,
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 56,
                              height: 56,
                              backgroundImage: `url(${row.mediaUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }}
                          />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canEdit) onOpenMedia(row.id);
                        }}
                        disabled={!canEdit}
                        style={{
                          width: 130,
                          height: 50,
                          border: "1px dashed var(--border, #E5DFD0)",
                          borderRadius: 8,
                          background: "transparent",
                          color: "var(--text)",
                          fontSize: 13,
                          cursor: canEdit ? "pointer" : "default",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                        }}
                      >
                        <span style={{ width: 18, height: 18, display: "inline-block" }}>
                          {imgPlaceholder}
                        </span>
                        {labels.addPhoto}
                      </button>
                    )}
                  </td>

                  {/* Inhoud */}
                  <td style={{ ...tdStyle, maxWidth: 340 }}>
                    {row.platform === "mail" && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--ts)",
                          marginBottom: 4,
                        }}
                      >
                        {row.subjectLine ? (
                          row.subjectLine
                        ) : (
                          <span style={{ color: "var(--danger, #DC2626)" }}>
                            {getMissingLabel("subject", row.platform)}
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: "var(--text)",
                        whiteSpace: "pre-line",
                      }}
                    >
                      {row.bodyPreview ? (
                        row.bodyPreview.length > 160 ? (
                          row.bodyPreview.slice(0, 160) + "…"
                        ) : (
                          row.bodyPreview
                        )
                      ) : (
                        <em style={{ color: "var(--ts)" }}>
                          {labels.noContentYet}
                        </em>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditContent(row.id);
                        }}
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          fontWeight: 500,
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid var(--border, #E5DFD0)",
                          background: "var(--white, #FFFFFF)",
                          cursor: "pointer",
                        }}
                      >
                        {labels.edit}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
