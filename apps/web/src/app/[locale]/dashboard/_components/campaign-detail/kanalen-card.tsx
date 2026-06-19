// ============================================================
// KanalenCard, kanaal-toggle + 'bewerken voor'-tabs
// ============================================================
//
// Twee rijen:
//   1. Alle 5 kanalen als pill-toggles. Actief = groene fill,
//      inactief = omlijnd. Klik op actief = verwijder kanaal,
//      klik op inactief = voeg toe. Laatste kanaal kan niet
//      verwijderd worden (anders heeft het voorstel niets meer).
//   2. 'Bewerken voor' = tabs om te kiezen welk kanaal de
//      Inhoud/Wanneer/Foto-sectie hieronder bewerkt. Alleen
//      zichtbaar bij 2+ kanalen.
//
// State (welk kanaal actief is, busy-flag) wordt door de parent
// beheerd; deze component is puur 'controlled'. Add/remove geven
// een API-call terug aan de parent.

import {
  PLATFORM_ICON,
  PLATFORM_LABEL,
  shortPlatformName,
  type Platform,
} from "./types";

const ALL_PLATFORMS: Platform[] = [
  "mail",
  "whatsapp",
  "instagram",
  "facebook",
  "tiktok",
  // Per 2026-05-21 toegevoegd. Concept-fase werkt; auto-publish wacht
  // op Google's GBP-API-approval (BACKLOG fase F).
  "google_business",
];

export type KanalenCardChannel = {
  id: string;
  platform: Platform;
};

type Props = {
  channels: KanalenCardChannel[];
  activeChannelId: string | undefined;
  // Disabled = parent is met een andere actie bezig of de status
  // staat geen kanaal-mutaties toe (bv. campagne 'actief').
  busy: boolean;
  // canEdit = mag eigenaar kanalen toevoegen/verwijderen? Op
  // 'voorstel' altijd true, op latere statussen wellicht false.
  canEdit: boolean;
  onAddChannel: (platform: Platform) => void;
  onRemoveChannel: (channelId: string) => void;
  onSetActive: (channelId: string) => void;
};

export function KanalenCard({
  channels,
  activeChannelId,
  busy,
  canEdit,
  onAddChannel,
  onRemoveChannel,
  onSetActive,
}: Props) {
  const activePlatforms = new Set(channels.map((c) => c.platform));

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">Kanalen</div>
        </div>
      </div>
      <div className="card-b">
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {ALL_PLATFORMS.map((p) => {
            const isActive = activePlatforms.has(p);
            const channel = channels.find((c) => c.platform === p);
            // Laatste actieve kanaal mag niet verwijderd worden.
            const isLast = isActive && channels.length <= 1;
            const disabled = busy || !canEdit || isLast;
            const onClick = () => {
              if (disabled) return;
              if (isActive && channel) {
                onRemoveChannel(channel.id);
              } else {
                onAddChannel(p);
              }
            };
            return (
              <button
                key={p}
                type="button"
                onClick={onClick}
                disabled={disabled}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: isActive
                    ? "2px solid var(--accent, #1F4A2D)"
                    : "1px solid var(--border, #E5DFD0)",
                  background: isActive
                    ? "var(--accent, #1F4A2D)"
                    : "var(--white, #FFFFFF)",
                  color: isActive
                    ? "var(--white, #FFFFFF)"
                    : "var(--text)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: disabled ? "default" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                <span>{PLATFORM_ICON[p]}</span>
                <span>{shortPlatformName(p)}</span>
                {isActive && canEdit && !isLast && (
                  <span
                    style={{
                      fontSize: 10,
                      opacity: 0.8,
                    }}
                  >
                    ✕
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {channels.length > 1 && (
          <>
            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: "1px solid var(--border, #E5DFD0)",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--ts)",
                marginBottom: 8,
              }}
            >
              Bewerken voor:
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              {channels.map((c) => {
                const isActive = c.id === activeChannelId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      if (busy) return;
                      onSetActive(c.id);
                    }}
                    disabled={busy}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      borderRadius: 999,
                      border: isActive
                        ? "2px solid var(--accent, #1F4A2D)"
                        : "1px solid var(--border, #E5DFD0)",
                      background: isActive
                        ? "var(--accent-light, #D6E0D8)"
                        : "var(--white, #FFFFFF)",
                      color: "var(--text)",
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    <span>{PLATFORM_ICON[c.platform]}</span>
                    <span>{shortPlatformName(c.platform)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Type re-export voor de parent zodat 'ie alleen uit dit bestand
// hoeft te importeren als 'ie dat wil. Optioneel.
export type { Platform };
