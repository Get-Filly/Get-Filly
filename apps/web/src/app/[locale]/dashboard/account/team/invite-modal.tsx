"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createInvite, type CreateInviteResult } from "@/lib/api";
import { type Role } from "@getfilly/shared";

const ROLE_ORDER: Role[] = ["owner", "manager", "staff"];

/**
 * InviteModal, simpele dialog om iemand uit te nodigen.
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
  const t = useTranslations("dash_account_team_invite_modal");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateInviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Escape sluit de modal (a11y). De modal wordt alleen gemount als 'ie
  // open is, dus de listener leeft precies zolang de modal zichtbaar is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roleLabels: Record<Role, string> = {
    owner: t("roles.owner"),
    manager: t("roles.manager"),
    staff: t("roles.staff"),
  };

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
      <div
        className="invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="invite-header">
          <h2 id="invite-modal-title">{t("title")}</h2>
          <button className="invite-close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="invite-form">
            <label className="invite-field">
              <span>{t("emailLabel")}</span>
              <input
                type="email"
                required
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="invite-field">
              <span>{t("roleLabel")}</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={submitting}
              >
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </label>
            <p className="invite-hint">{t("permissionsHint")}</p>

            {error && <div className="invite-error">{t("errorPrefix", { message: error })}</div>}

            <div className="invite-actions">
              <button type="button" className="invite-btn-secondary" onClick={onClose}>
                {t("cancel")}
              </button>
              <button type="submit" className="invite-btn-primary" disabled={submitting}>
                {submitting ? t("sending") : t("send")}
              </button>
            </div>
          </form>
        ) : (
          <div className="invite-success">
            {result.deliveredByEmail ? (
              <>
                <div className="invite-success-icon">✅</div>
                <p>
                  {t.rich("sentToEmail", {
                    email: result.invite.email,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </p>
                <p className="invite-hint">{t("sentHint")}</p>
              </>
            ) : (
              <>
                <div className="invite-success-icon">📎</div>
                <p>{t("existingAccount")}</p>
                <div className="invite-link-box">
                  <code>{result.manualLink}</code>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(result.manualLink ?? "")
                    }
                  >
                    {t("copy")}
                  </button>
                </div>
              </>
            )}
            <div className="invite-actions">
              <button className="invite-btn-primary" onClick={onClose}>
                {t("close")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
