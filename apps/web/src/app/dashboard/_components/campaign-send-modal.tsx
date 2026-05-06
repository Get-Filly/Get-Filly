"use client";

import { useState } from "react";
import {
  sendCampaign,
  type SendCampaignResult,
} from "../../../lib/api";
import { Button } from "../../../components/ui/button";

// ============================================================
// CampaignSendModal, verstuur een mail-campagne via Resend
// ============================================================
//
// Twee modes:
//   - 'test': stuurt 1 mail naar het opgegeven adres. Voor de chef
//     om visueel te checken hoe de mail eruit ziet vóór de echte
//     batch.
//   - 'all_opted_in': stuurt naar alle gasten met mail_opt_in=true.
//     Onomkeerbaar, dus extra confirm-stap.
//
// Resultaat (sent/failed-counts) tonen we direct in de modal zelf
// zodat eigenaar weet wat er gebeurd is. Bij failures: lijstje van
// problematische adressen.
// ============================================================

type Props = {
  campaignId: string;
  campaignName: string;
  campaignType: string;
  defaultTestEmail?: string;
  onClose: () => void;
};

export function CampaignSendModal({
  campaignId,
  campaignName,
  campaignType,
  defaultTestEmail,
  onClose,
}: Props) {
  const [mode, setMode] = useState<"test" | "all_opted_in">("test");
  const [testEmail, setTestEmail] = useState(defaultTestEmail ?? "");
  const [confirmText, setConfirmText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendCampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mail-campagne is een vereiste voor deze flow. Niet-mail
  // (social/whatsapp) hoort niet eens deze modal te zien, defense
  // tegen verkeerd gebruik vanuit de pagina.
  if (campaignType !== "mail") {
    return (
      <ModalShell onClose={onClose}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Niet mogelijk</h3>
        <p style={{ marginTop: 8, color: "var(--tl, #6B6F71)", fontSize: 13 }}>
          Alleen mail-campagnes kunnen via deze flow worden verzonden.
          Social en WhatsApp komen later via een aparte koppeling.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Sluiten</Button>
        </div>
      </ModalShell>
    );
  }

  const handleSend = async () => {
    setError(null);
    setSending(true);
    try {
      const r = await sendCampaign(
        campaignId,
        mode,
        mode === "test" ? testEmail.trim() : undefined,
      );
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Versturen mislukt.");
    } finally {
      setSending(false);
    }
  };

  // Voor "echt verzenden" eisen we dat de eigenaar de campagne-naam
  // overtypt, onomkeerbare actie, voorkomt accidentele klik op
  // grote actie-knop.
  const allReadyToSend =
    mode === "test"
      ? testEmail.trim().length > 3 && testEmail.includes("@")
      : confirmText.trim().toLowerCase() ===
        campaignName.trim().toLowerCase();

  // Resultaat-view
  if (result) {
    const success = result.failed === 0;
    return (
      <ModalShell onClose={onClose}>
        <h3 style={{ margin: 0, fontSize: 18 }}>
          {success ? "✓ Verstuurd" : "Deels verstuurd"}
        </h3>
        <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
          <strong>{result.sent}</strong> van <strong>{result.total}</strong>{" "}
          mails succesvol naar Resend gestuurd.
          {result.failed > 0 && (
            <>
              {" "}
              <span style={{ color: "var(--danger, #B3261E)" }}>
                {result.failed} mislukt.
              </span>
            </>
          )}
        </div>
        {result.failures.length > 0 && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "var(--bg-soft, #F5F3EE)",
              borderRadius: 8,
              fontSize: 12,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            <strong>Mislukte adressen:</strong>
            <ul style={{ margin: "6px 0 0 0", paddingLeft: 18 }}>
              {result.failures.map((f, i) => (
                <li key={i}>
                  {f.email}: {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "var(--tl, #6B6F71)",
          }}
        >
          Resend bevestigt aankomst via webhooks (delivered/bounced), die
          status verschijnt zo bij de campagne-stats.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Klaar</Button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 style={{ margin: 0, fontSize: 18 }}>Verstuur "{campaignName}"</h3>

      {/* Mode-toggle: test vs echt verzenden */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 16,
        }}
      >
        <ModeCard
          active={mode === "test"}
          onClick={() => setMode("test")}
          title="Test naar mezelf"
          subtitle="Eén mail naar 1 adres om te checken hoe 'ie eruit ziet"
        />
        <ModeCard
          active={mode === "all_opted_in"}
          onClick={() => setMode("all_opted_in")}
          title="Echt verzenden"
          subtitle="Naar alle gasten met mail-toestemming"
        />
      </div>

      {mode === "test" ? (
        <div style={{ marginTop: 16 }}>
          <label
            htmlFor="test-email"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            Test-mailadres
          </label>
          <input
            id="test-email"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="je@email.com"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 12px",
              border: "1px solid var(--border, #e5e5e5)",
              borderRadius: 8,
              fontSize: 14,
            }}
          />
          <p
            style={{
              fontSize: 11,
              color: "var(--tl, #6B6F71)",
              marginTop: 6,
            }}
          >
            Stuur 'm naar je eigen mailbox om te zien hoe gasten 't ontvangen.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              padding: 12,
              background: "var(--brand-soft, #EDF2EE)",
              color: "var(--brand, #1F4A2D)",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong>Onomkeerbaar.</strong> De campagne gaat nu uit naar
            alle gasten met mail-toestemming. Typ de campagne-naam ter
            bevestiging:
          </div>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={campaignName}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "10px 12px",
              border: "1px solid var(--border, #e5e5e5)",
              borderRadius: 8,
              fontSize: 14,
            }}
          />
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "var(--danger-soft, #FEEAEA)",
            color: "var(--danger, #B3261E)",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 20,
        }}
      >
        <Button variant="secondary" onClick={onClose} disabled={sending}>
          Annuleren
        </Button>
        <Button
          variant="primary"
          onClick={handleSend}
          disabled={!allReadyToSend || sending}
          loading={sending}
        >
          {mode === "test" ? "Verstuur test" : "Verstuur naar gasten"}
        </Button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 12,
        borderRadius: 8,
        border: active
          ? "2px solid var(--brand, #1F4A2D)"
          : "1px solid var(--border, #e5e5e5)",
        background: active ? "var(--brand-soft, #EDF2EE)" : "white",
        cursor: "pointer",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
      <div
        style={{
          fontSize: 11,
          color: "var(--tl, #6B6F71)",
          marginTop: 4,
          lineHeight: 1.4,
        }}
      >
        {subtitle}
      </div>
    </button>
  );
}
