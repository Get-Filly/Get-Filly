"use client";

import { useState } from "react";
import { createInvite, type CreateInviteResult } from "../../../../lib/api";
import { type Role } from "@getfilly/shared";

const ROLE_LABELS: Record<Role, string> = {
  owner: "Eigenaar — alles mag",
  manager: "Manager — dagelijks werk",
  staff: "Medewerker — beperkt",
};

/**
 * InviteModal — simpele dialog om iemand uit te nodigen.
 *
 * Minimaal form:
 *   - e-mail
 *   - rol (dropdown)
 *
 * Custom permissies niet hier; owner kan die na accept aanpassen in
 * de team-lijst. Houdt deze stap simpel.
 *
 * Na verzenden:
 *   - deliveredByEmail: true  → "Uitnodiging verstuurd naar <email>"
 *   - deliveredByEmail: false → toon de magic-link die owner kan
 *     kopiëren en handmatig naar de collega sturen.
 */
export function InviteModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateInviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await createInvite(email.trim(), role);
      setResult(r);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="invite-backdrop" onClick={onClose}>
      <div className="invite-modal" onClick={(e) => e.stopPropagation()}>
        <div className="invite-header">
          <h2>Teamlid uitnodigen</h2>
          <button className="invite-close" onClick={onClose} aria-label="Sluiten">
            ×
          </button>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="invite-form">
            <label className="invite-field">
              <span>E-mailadres</span>
              <input
                type="email"
                required
                placeholder="naam@voorbeeld.nl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="invite-field">
              <span>Rol</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={submitting}
              >
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <p className="invite-hint">
              Na de uitnodiging kun je in de teamlijst nog custom permissies
              per module aan of uit zetten.
            </p>

            {error && <div className="invite-error">Fout: {error}</div>}

            <div className="invite-actions">
              <button type="button" className="invite-btn-secondary" onClick={onClose}>
                Annuleren
              </button>
              <button type="submit" className="invite-btn-primary" disabled={submitting}>
                {submitting ? "Versturen…" : "Versturen"}
              </button>
            </div>
          </form>
        ) : (
          <div className="invite-success">
            {result.deliveredByEmail ? (
              <>
                <div className="invite-success-icon">✅</div>
                <p>
                  Uitnodiging verstuurd naar <strong>{result.invite.email}</strong>.
                </p>
                <p className="invite-hint">
                  Zodra de ontvanger op de link in de mail klikt en inlogt, komt
                  hij of zij in je team.
                </p>
              </>
            ) : (
              <>
                <div className="invite-success-icon">📎</div>
                <p>
                  Deze persoon heeft al een Get-Filly-account. Deel de onderstaande
                  link met hem of haar — klikken = direct binnen.
                </p>
                <div className="invite-link-box">
                  <code>{result.manualLink}</code>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(result.manualLink ?? "")
                    }
                  >
                    Kopieer
                  </button>
                </div>
              </>
            )}
            <div className="invite-actions">
              <button className="invite-btn-primary" onClick={onClose}>
                Sluiten
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
