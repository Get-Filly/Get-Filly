"use client";

import { useEffect, useState } from "react";
import {
  fetchRecipientsPreview,
  sendCampaignTest,
  sendCampaignToAll,
  type RecipientsPreview,
} from "@/lib/api";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ============================================================
// CampaignSendCard — verstuur-flow voor mail-campagnes
// ============================================================
//
// Twee modes (matchen backend):
//   1. Test-mail naar één adres (default: eigenaar's contact_email).
//      Veilig om vaker te klikken, geen impact op opt-in-lijst.
//   2. Naar alle opt-in-gasten. Onomkeerbaar. Confirm-modal vereist.
//
// Toont:
//   - Aantal opt-in-gasten + eerste 5 namen ter herkenning.
//   - Input voor test-mail-adres (voorgevuld met eigenaar's e-mail).
//   - Resultaat per send (sent X, failures Y).
//
// Verschijnt alleen op mail-campagnes; caller bepaalt of 'ie rendert
// (op detail-page checken op type === 'mail').
// ============================================================

type Props = {
  campaignId: string;
};

export function CampaignSendCard({ campaignId }: Props) {
  const [preview, setPreview] = useState<RecipientsPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Test-mode-state
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // All-mode-state met confirm-modal
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [allResult, setAllResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreviewError(null);
    fetchRecipientsPreview(campaignId)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        if (p.ownerEmail && !testEmail) {
          setTestEmail(p.ownerEmail);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewError(err instanceof Error ? err.message : "Fout");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // testEmail bewust uit deps; we vullen 'm alleen bij eerste load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const handleSendTest = async () => {
    if (!testEmail.trim()) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const result = await sendCampaignTest(campaignId, testEmail.trim());
      setTestResult(`Verstuurd naar ${testEmail.trim()} (${result.sent}).`);
    } catch (err) {
      setTestResult(
        `Fout: ${err instanceof Error ? err.message : "Onbekende fout"}`,
      );
    } finally {
      setSendingTest(false);
    }
  };

  const handleSendAll = async () => {
    setSendingAll(true);
    setAllResult(null);
    try {
      const result = await sendCampaignToAll(campaignId);
      const failed = result.failures?.length ?? 0;
      setAllResult(
        failed === 0
          ? `Verstuurd naar ${result.sent} gasten.`
          : `Verstuurd naar ${result.sent} gasten, ${failed} mislukte verzending(en).`,
      );
      setConfirmingAll(false);
      // Refresh preview (count blijft hetzelfde, maar evt.
      // bounce-status verschijnt later via webhook).
    } catch (err) {
      setAllResult(
        `Fout: ${err instanceof Error ? err.message : "Onbekende fout"}`,
      );
    } finally {
      setSendingAll(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardBody>
          <div
            style={{
              height: 100,
              background: "var(--surface-muted, #F4F0E8)",
              borderRadius: 8,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: "var(--space-3)",
            color: "var(--text, #18181B)",
          }}
        >
          Versturen
        </div>

        {/* Ontvangers-preview */}
        {previewError ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--danger, #DC2626)",
              marginBottom: "var(--space-3)",
            }}
          >
            Kon ontvangers niet laden: {previewError}
          </div>
        ) : preview ? (
          <div
            style={{
              padding: "var(--space-2) var(--space-3)",
              background: "var(--surface-muted, #F4F0E8)",
              borderRadius: 8,
              marginBottom: "var(--space-3)",
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--text, #18181B)" }}>
              {preview.totalCount === 0
                ? "Nog geen opt-in-gasten"
                : preview.totalCount === 1
                  ? "1 gast met mail-opt-in"
                  : `${preview.totalCount} gasten met mail-opt-in`}
            </div>
            {preview.sampleNames.length > 0 && (
              <div style={{ marginTop: 4 }}>
                Waaronder: {preview.sampleNames.join(", ")}
                {preview.totalCount > preview.sampleNames.length && "…"}
              </div>
            )}
          </div>
        ) : null}

        {/* Test-mail-flow */}
        <div style={{ marginBottom: "var(--space-3)" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary, #52525B)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Test-mail naar jezelf
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="naam@voorbeeld.nl"
              disabled={sendingTest}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid var(--border, #E4E4E7)",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
            <Button
              variant="brand-soft"
              onClick={handleSendTest}
              disabled={sendingTest || !testEmail.trim()}
            >
              {sendingTest ? "Bezig…" : "Stuur test"}
            </Button>
          </div>
          {testResult && (
            <div
              style={{
                fontSize: 12,
                color: testResult.startsWith("Fout")
                  ? "var(--danger, #DC2626)"
                  : "var(--success, #16A34A)",
                marginTop: 6,
              }}
            >
              {testResult}
            </div>
          )}
        </div>

        {/* Verstuur-naar-iedereen-flow */}
        <div
          style={{
            borderTop: "1px solid var(--border, #E4E4E7)",
            paddingTop: "var(--space-3)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-secondary, #52525B)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Verstuur naar alle opt-in-gasten
          </div>
          {!confirmingAll ? (
            <Button
              variant="primary"
              onClick={() => setConfirmingAll(true)}
              disabled={!preview || preview.totalCount === 0 || sendingAll}
            >
              {preview && preview.totalCount > 0
                ? `Verstuur naar ${preview.totalCount} gasten`
                : "Geen opt-in-gasten"}
            </Button>
          ) : (
            <div
              style={{
                padding: "var(--space-3)",
                background: "var(--danger-soft, #FEE2E2)",
                border: "1px solid var(--danger, #DC2626)",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text, #18181B)",
                  marginBottom: 6,
                }}
              >
                Weet je het zeker?
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary, #52525B)",
                  marginBottom: 10,
                  lineHeight: 1.5,
                }}
              >
                Mail wordt onomkeerbaar verstuurd naar{" "}
                <strong>{preview?.totalCount ?? 0}</strong> gasten. Test eerst
                met een test-mail om de tekst te checken.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="primary"
                  onClick={handleSendAll}
                  disabled={sendingAll}
                >
                  {sendingAll ? "Bezig met versturen…" : "Ja, verstuur nu"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmingAll(false)}
                  disabled={sendingAll}
                >
                  Annuleer
                </Button>
              </div>
            </div>
          )}
          {allResult && (
            <div
              style={{
                fontSize: 12,
                color: allResult.startsWith("Fout")
                  ? "var(--danger, #DC2626)"
                  : "var(--success, #16A34A)",
                marginTop: 8,
              }}
            >
              {allResult}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
