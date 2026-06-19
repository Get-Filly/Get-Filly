"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CHAT_CONVERSATION_CAP,
  type ChatConversationSummary,
} from "@/lib/api";

// ============================================================
// FillyChatHistoryMenu, dropdown in chat-card-header met conversaties
// ============================================================
//
// Toont een list van eerdere chat-conversaties + "+ Nieuw gesprek"-
// knop bovenaan. Klik op een titel → switch naar die chat.
//
// Gedraagt zich als een controlled menu: parent (FillyChat) houdt de
// "open" state bij en levert de actuele conversation-id zodat we
// die met een check-mark kunnen markeren.
//
// Auto-close gedrag:
//   - Klik buiten de dropdown
//   - Escape-toets
//   - Klik op een titel of "+ Nieuw gesprek"
//
// Lege staat: bij 0 conversaties tonen we alleen de "+ Nieuw gesprek"-
// item, geen "geen conversaties"-boodschap, want de gebruiker zit
// per definitie al in een conversatie als 'ie de menu opent.
// ============================================================

type Props = {
  conversations: ChatConversationSummary[];
  activeConversationId: string | null;
  onSwitch: (conversationId: string) => void;
  onNew: () => void;
  onDelete: (conversationId: string) => void;
};

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "vandaag";
  if (diffDays === 1) return "gisteren";
  if (diffDays < 7) return `${diffDays} dagen geleden`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} wkn geleden`;
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

export function FillyChatHistoryMenu({
  conversations,
  activeConversationId,
  onSwitch,
  onNew,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSwitch = (id: string) => {
    setOpen(false);
    onSwitch(id);
  };

  const handleNew = () => {
    setOpen(false);
    onNew();
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat-geschiedenis"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Wissel chat / start nieuw"
        style={{
          background: "transparent",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "4px 10px",
          fontSize: "var(--font-size-xs)",
          color: "var(--color-text-soft)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        Gesprekken <span aria-hidden>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 240,
            maxHeight: 320,
            overflowY: "auto",
            background: "var(--color-white)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-md)",
            padding: 4,
            zIndex: 20,
          }}
        >
          {/* + Nieuw gesprek-item bovenaan, groen-getint zodat 't visueel
              de primaire actie is */}
          <button
            type="button"
            role="menuitem"
            onClick={handleNew}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              background: "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "var(--font-size-sm)",
              fontWeight: 500,
              color: "var(--color-brand)",
              textAlign: "left",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--color-brand-soft)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <Plus size={14} />
            Nieuw gesprek
          </button>

          {conversations.length > 0 && (
            <div
              style={{
                height: 1,
                background: "var(--color-border-soft)",
                margin: "4px 0",
              }}
              aria-hidden
            />
          )}

          {conversations.map((c) => {
            const isActive = c.id === activeConversationId;
            const title =
              c.title ?? `Gesprek van ${formatRelativeDate(c.updated_at)}`;
            const handleDelete = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (
                window.confirm(
                  `"${title}" verwijderen? Filly bewaart geleerde voorkeuren maar de chat-berichten gaan weg.`,
                )
              ) {
                onDelete(c.id);
              }
            };
            return (
              <div
                key={c.id}
                role="menuitem"
                aria-current={isActive}
                onClick={() => handleSwitch(c.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 4,
                  width: "100%",
                  padding: "8px 10px",
                  background: isActive
                    ? "var(--color-brand-soft)"
                    : "transparent",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-text)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background =
                      "var(--color-brand-soft)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    textAlign: "left",
                  }}
                >
                  {title}
                </span>
                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text-disabled)",
                    flexShrink: 0,
                  }}
                >
                  {c.message_count}/{CHAT_CONVERSATION_CAP}
                </span>
                {/* Delete-knop, stopPropagation voorkomt dat de
                    parent-row-onClick (switch) ook wordt afgevuurd. */}
                <button
                  type="button"
                  onClick={handleDelete}
                  aria-label={`${title} verwijderen`}
                  title="Verwijder gesprek"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--color-text-disabled)",
                    cursor: "pointer",
                    padding: 4,
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--color-danger, #B3261E)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--color-text-disabled)";
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
