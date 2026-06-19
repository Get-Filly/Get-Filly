// ============================================================
// WanneerCard, verzendmoment per actief kanaal
// ============================================================
//
// Toont 'Filly stelt voor: donderdag 14 mei om 17:00' + Wijzig-
// knop. Bij afwijking van Filly's voorstel verschijnt een rode
// banner ('Je wijkt af van Filly's voorstel ...') én een 'Terug
// naar Filly's voorstel'-knop. Filly's per-kanaal redenering
// (bv. 'IG presteert beste op donderdag 17u') verschijnt als
// italic-tekst alleen bij Filly's eigen voorstel.
//
// State (editing/draft/saving) leeft in de parent; deze
// component is 'controlled'.

import { Button } from "@/components/ui/button";
import { formatDutchDateTime } from "./types";

type Props = {
  // Scroll-target voor jump-to-fix vanuit Missende aspecten.
  sectionId?: string;
  // Wat we daadwerkelijk gaan plaatsen — eigenaar's keuze of
  // Filly's voorstel.
  effectiveIso: string | null;
  // Filly's voorstel (basis voor de 'afwijking'-banner + reset).
  fillyIso: string | null;
  // True als eigenaar afwijkt van Filly's voorstel (minuut-precisie).
  isCustomTime: boolean;
  // Filly's redenering voor deze tijd ('IG presteert beste op
  // donderdag 17u'). Null = generieke fallback, geen uitleg.
  fillyReasoning: string | null;
  // canEdit = mogen knoppen + datepicker actief zijn?
  canEdit: boolean;
  busy: boolean;
  editingSchedule: boolean;
  // datetime-local input value ('2026-05-14T17:00').
  draftDatetime: string;
  savingSchedule: boolean;
  onStartEditSchedule: () => void;
  onCancelEditSchedule: () => void;
  onSaveSchedule: () => void;
  onResetToFilly: () => void;
  onDraftDatetimeChange: (val: string) => void;
};

export function WanneerCard({
  sectionId,
  effectiveIso,
  fillyIso,
  isCustomTime,
  fillyReasoning,
  canEdit,
  busy,
  editingSchedule,
  draftDatetime,
  savingSchedule,
  onStartEditSchedule,
  onCancelEditSchedule,
  onSaveSchedule,
  onResetToFilly,
  onDraftDatetimeChange,
}: Props) {
  return (
    <div
      id={sectionId}
      className="card"
      style={{ marginBottom: 16, scrollMarginTop: 120 }}
    >
      <div className="card-h">
        <div>
          <div className="card-t">Wanneer plaatsen</div>
        </div>
      </div>
      <div className="card-b">
        {editingSchedule ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--ts)",
              }}
            >
              <span>Verzenddatum + tijd</span>
              <input
                type="datetime-local"
                value={draftDatetime}
                onChange={(e) => onDraftDatetimeChange(e.target.value)}
                style={{
                  padding: "8px 10px",
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: "inherit",
                  background: "var(--white, #FFFFFF)",
                  maxWidth: 280,
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                onClick={onSaveSchedule}
                disabled={!draftDatetime}
                loading={savingSchedule}
              >
                Opslaan
              </Button>
              <Button
                variant="secondary"
                onClick={onCancelEditSchedule}
                disabled={savingSchedule}
              >
                Annuleren
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                fontSize: 12,
                color: "var(--tl)",
                marginBottom: 4,
              }}
            >
              {isCustomTime ? "Jouw keuze" : "Filly stelt voor"}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 10,
                color: "var(--text)",
              }}
            >
              {effectiveIso
                ? formatDutchDateTime(effectiveIso)
                : "Nog niet gekozen"}
            </div>
            {/* Filly's redenering — alleen bij Filly's eigen voorstel
                (niet wanneer eigenaar afwijkt, dan is de banner
                hieronder leidend). */}
            {!isCustomTime && fillyReasoning && (
              <div
                style={{
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--ts)",
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                {fillyReasoning}
              </div>
            )}
            {isCustomTime && fillyIso && (
              <div
                style={{
                  fontSize: 12,
                  color: "#B91C1C",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  padding: "6px 10px",
                  borderRadius: 6,
                  marginBottom: 12,
                  lineHeight: 1.4,
                }}
              >
                Je wijkt af van Filly&rsquo;s voorstel (
                {formatDutchDateTime(fillyIso)}).
              </div>
            )}
            {canEdit && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  variant="secondary"
                  onClick={onStartEditSchedule}
                  disabled={busy}
                >
                  ✎ Wijzig
                </Button>
                {isCustomTime && (
                  <Button
                    variant="secondary"
                    onClick={onResetToFilly}
                    disabled={busy}
                    loading={savingSchedule}
                  >
                    ↺ Terug naar Filly&rsquo;s voorstel
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
