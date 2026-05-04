"use client";

import { useEffect, useState } from "react";
import {
  fetchMailDomainStatus,
  registerMailDomain,
  removeMailDomain,
  verifyMailDomain,
  type DnsRecord,
  type MailDomainStatus,
} from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";

// ============================================================
// MailDomainSection — "Mail-instellingen" op account-pagina
// ============================================================
//
// Drie views afhankelijk van status:
//
//  - status='none'    → uitleg + setup-knop "Eigen domein instellen".
//                       Default-uitleg: "verzending via social@get-filly.com
//                       met je restaurant-naam als afzender".
//
//  - status='pending' → DNS-records-tabel met copy-knoppen + uitleg
//                       per registrar + "Verifieer"-knop. Polt elke
//                       10s totdat verified of failed.
//
//  - status='verified'→ "Eigen domein actief: info@bistrodemo.nl ✓"
//                       met optie "Records bekijken" + "Loskoppelen".
//
//  - status='failed'  → "DNS-records nog niet correct" + zelfde
//                       records-tabel + "Probeer opnieuw"-knop.
// ============================================================

export function MailDomainSection() {
  const [data, setData] = useState<MailDomainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Setup-modus: eigenaar heeft op "Eigen domein instellen" geklikt
  // maar nog niet ingevuld. Toggleert tussen het lege-state-blok en
  // het invul-formulier.
  const [setupMode, setSetupMode] = useState(false);
  const [domain, setDomain] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [busy, setBusy] = useState(false);

  // Initieel ophalen + bij polling-tikken update
  const reload = async () => {
    try {
      const fresh = await fetchMailDomainStatus();
      setData(fresh);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  // Polling bij pending: elke 12s opnieuw status ophalen totdat verified
  // of failed. Stopt automatisch zodra status verandert.
  useEffect(() => {
    if (data?.status !== "pending") return;
    const id = setInterval(reload, 12000);
    return () => clearInterval(id);
  }, [data?.status]);

  const handleRegister = async () => {
    setError(null);
    setBusy(true);
    try {
      const fresh = await registerMailDomain(
        domain.trim(),
        fromAddress.trim(),
      );
      setData(fresh);
      setSetupMode(false);
      setDomain("");
      setFromAddress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registreren mislukt.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setError(null);
    setBusy(true);
    try {
      const fresh = await verifyMailDomain();
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verificatie mislukt.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (
      !window.confirm(
        "Weet je zeker dat je dit eigen domein wil loskoppelen? Mail valt daarna terug op social@get-filly.com.",
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await removeMailDomain();
      setData({
        status: "none",
        domain: null,
        fromAddress: null,
        verifiedAt: null,
        records: [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verwijderen mislukt.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SectionShell>
        <div style={{ color: "var(--tl, #6B6F71)" }}>Bezig met laden…</div>
      </SectionShell>
    );
  }

  if (!data) {
    return (
      <SectionShell>
        <ErrorBox message={error ?? "Onbekende fout."} />
      </SectionShell>
    );
  }

  return (
    <SectionShell>
      {error && <ErrorBox message={error} />}

      {/* ---------- VERIFIED ---------- */}
      {data.status === "verified" && (
        <div>
          <StatusRow
            color="var(--brand, #1F4A2D)"
            icon="✓"
            label={`Eigen domein actief: ${data.fromAddress}`}
            sub="Mails worden verzonden vanuit je eigen domein. Replies komen direct in je mailbox."
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={busy}
            >
              Loskoppelen
            </Button>
          </div>
        </div>
      )}

      {/* ---------- PENDING / FAILED ---------- */}
      {(data.status === "pending" || data.status === "failed") && (
        <div>
          <StatusRow
            color={
              data.status === "pending" ? "#9C7400" : "var(--danger, #B3261E)"
            }
            icon={data.status === "pending" ? "⏳" : "⚠"}
            label={
              data.status === "pending"
                ? `DNS-controle loopt voor ${data.domain}`
                : `DNS-records nog niet correct voor ${data.domain}`
            }
            sub={
              data.status === "pending"
                ? "Voeg de onderstaande records toe bij je DNS-host. Klik daarna op 'Verifieer'. DNS-propagatie kan 5-30 minuten duren."
                : "Controleer dat alle records exact zijn overgenomen. Sommige DNS-hosts voegen automatisch het domein achter de hostname toe — corrigeer dan zo nodig."
            }
          />
          <DnsRecordsTable records={data.records} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button onClick={handleVerify} disabled={busy} loading={busy}>
              Verifieer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={busy}
            >
              Annuleren / loskoppelen
            </Button>
          </div>
        </div>
      )}

      {/* ---------- NONE — default ---------- */}
      {data.status === "none" && !setupMode && (
        <div>
          <StatusRow
            color="var(--tl, #6B6F71)"
            icon="✉"
            label="Standaard-verzending via Get Filly"
            sub="Je campagne-mails komen van social@get-filly.com met je restaurant-naam als afzender. Voor pure klant-branding kun je je eigen domein koppelen."
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button onClick={() => setSetupMode(true)}>
              Eigen domein instellen
            </Button>
          </div>
        </div>
      )}

      {/* ---------- NONE — setup-modus ---------- */}
      {data.status === "none" && setupMode && (
        <div>
          <h4 style={{ margin: "0 0 12px", fontSize: 14 }}>
            Eigen domein koppelen
          </h4>
          <Input
            label="Domein"
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="bistrodemo.nl"
            hint="Zonder http:// of www. — alleen de domeinnaam."
          />
          <div style={{ marginTop: 12 }}>
            <Input
              label="Verzendadres"
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder={domain ? `info@${domain}` : "info@bistrodemo.nl"}
              hint="Het adres dat ontvangers zien in 'Van'. Moet eindigen op je domein."
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Button onClick={handleRegister} disabled={busy} loading={busy}>
              Aanmaken
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSetupMode(false)}
              disabled={busy}
            >
              Annuleren
            </Button>
          </div>
          <p
            style={{
              marginTop: 14,
              fontSize: 12,
              color: "var(--tl, #6B6F71)",
              lineHeight: 1.5,
            }}
          >
            Na aanmaken krijg je 4 DNS-records die je bij je DNS-host
            (TransIP / Versio / Namecheap / etc.) moet toevoegen. Daarna
            kun je verifiëren — duurt meestal 5-15 minuten na DNS-update.
          </p>
        </div>
      )}
    </SectionShell>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="form-section">
      <div className="form-section-title">Mail-instellingen</div>
      <div className="form-section-desc">
        Vanuit welk adres je campagne-mails worden verstuurd.
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

function StatusRow({
  color,
  icon,
  label,
  sub,
}: {
  color: string;
  icon: string;
  label: string;
  sub: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "12px 14px",
        background: "var(--bg-soft, #F5F3EE)",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 18, color, lineHeight: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--tl, #6B6F71)",
            lineHeight: 1.5,
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}

function DnsRecordsTable({ records }: { records: DnsRecord[] }) {
  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
    } catch {
      // privé-modus / geen permissie — negeren
    }
  };

  if (records.length === 0) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: 12,
          background: "var(--bg-soft, #F5F3EE)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--tl, #6B6F71)",
        }}
      >
        Geen records beschikbaar. Probeer de pagina te herladen.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr
            style={{
              textAlign: "left",
              color: "var(--tl, #6B6F71)",
              fontWeight: 500,
            }}
          >
            <th style={cellPad}>Type</th>
            <th style={cellPad}>Hostname</th>
            <th style={cellPad}>Waarde</th>
            <th style={cellPad}>Prio</th>
            <th style={cellPad}>Status</th>
            <th style={cellPad}></th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr
              key={i}
              style={{ borderTop: "1px solid var(--border, #e5e5e5)" }}
            >
              <td style={cellPad}>{r.type}</td>
              <td
                style={{
                  ...cellPad,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {r.name}
              </td>
              <td
                style={{
                  ...cellPad,
                  fontFamily: "ui-monospace, monospace",
                  maxWidth: 280,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={r.value}
              >
                {r.value}
              </td>
              <td style={cellPad}>{r.priority ?? "—"}</td>
              <td style={cellPad}>
                {r.status ? (
                  <span
                    style={{
                      color:
                        r.status === "verified"
                          ? "var(--brand, #1F4A2D)"
                          : "#9C7400",
                    }}
                  >
                    {r.status}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td style={cellPad}>
                <button
                  type="button"
                  onClick={() => copy(r.value)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border, #e5e5e5)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                  title="Kopieer waarde naar klembord"
                >
                  Kopieer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "var(--tl, #6B6F71)",
          lineHeight: 1.5,
        }}
      >
        Hostname-tip: bij sommige DNS-hosts hoef je{" "}
        <code>.jouw-domein.nl</code> niet zelf achter de hostname te
        zetten — die voegt 'm zelf toe. Bij andere moet je de volledige
        hostname (bv. <code>resend._domainkey.jouw-domein.nl</code>)
        invoeren.
      </p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        marginBottom: 12,
        background: "var(--danger-soft, #FEEAEA)",
        color: "var(--danger, #B3261E)",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

const cellPad: React.CSSProperties = { padding: "6px 8px" };
