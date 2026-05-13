// ============================================================
// MissendeAspectenCard, per kanaal de openstaande velden
// ============================================================
//
// Toont een rij per kanaal met de velden die nog ingevuld moeten
// worden. ● = vereist (blokkeert Goedkeuren), ○ = optioneel.
// Klik op een item = jump-to-fix: activeer dat kanaal in de
// Kanalen-card én scroll naar de juiste sectie (Wanneer/Foto/
// Inhoud). De parent owned scroll + active-channel-state.
//
// Verbergt zich automatisch als geen enkel kanaal nog actie nodig
// heeft, óf als de hele card op de pagina niet getoond mag worden
// (bv. campagne-status 'actief' waarin niets meer ontbreekt).

import {
  PLATFORM_LABEL as SHORT_PLATFORM_LABEL,
  getMissingLabel,
  type ChecklistItem,
  type MissingField,
} from "../../../../lib/campaign-checks";

export type MissendeAspectenChannel = {
  id: string;
  platform: string;
  items: ChecklistItem[];
};

type Props = {
  channels: MissendeAspectenChannel[];
  onJumpTo: (field: MissingField, channelId: string) => void;
};

export function MissendeAspectenCard({ channels, onJumpTo }: Props) {
  // Filter alvast: kanalen zonder items hoeven we niet te tonen,
  // en als er na filtering 0 over zijn rendert de card überhaupt
  // niet (voorkomt lege card-shell op een 'volledig ingevuld'-
  // voorstel).
  const withItems = channels.filter((c) => c.items.length > 0);
  if (withItems.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">Missende aspecten</div>
        </div>
      </div>
      <div className="card-b">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          {withItems.map((c, idx) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                padding: "10px 0",
                borderTop:
                  idx === 0 ? "none" : "1px solid var(--border, #E5DFD0)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text, #18181B)",
                  minWidth: 110,
                  flexShrink: 0,
                }}
              >
                {SHORT_PLATFORM_LABEL[c.platform] ?? c.platform}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 14,
                  flex: 1,
                }}
              >
                {c.items.map((item) => (
                  <ChecklistButton
                    key={item.field}
                    item={item}
                    platform={c.platform}
                    onClick={() => onJumpTo(item.field, c.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Legenda voor de ●/○-conventie. Zonder uitleg snapt
            eigenaar niet waarom sommige items wel/niet
            blokkeren. */}
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
            vereist
          </span>
          <span>
            <span style={{ color: "var(--tl)", fontSize: 12 }}>○</span>{" "}
            optioneel
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ChecklistButton, één openstaand veld als klikbare regel
// ============================================================
// ● = vereist (zwarte tekst, blokkeert Goedkeuren)
// ○ = optioneel (grijze tekst, aanbeveling)
// Klik = jump-to-fix naar de juiste sectie.
function ChecklistButton({
  item,
  platform,
  onClick,
}: {
  item: ChecklistItem;
  platform: string;
  onClick: () => void;
}) {
  const bullet = item.required ? "●" : "○";
  const color = item.required
    ? "var(--text, #18181B)"
    : "var(--tl, #6B6F71)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        fontSize: 13,
        color,
        fontWeight: item.required ? 500 : 400,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      title={
        item.required
          ? "Vereist — klik om in te vullen"
          : "Optioneel — klik om in te vullen"
      }
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
    </button>
  );
}
