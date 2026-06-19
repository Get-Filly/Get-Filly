"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  fetchMailDomainStatus,
  registerMailDomain,
  removeMailDomain,
  verifyMailDomain,
  type DnsRecord,
  type MailDomainStatus,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ============================================================
// MailDomainSection, "Mail-instellingen" op account-pagina
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
  const t = useTranslations("dash__components_mail_domain_section");

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
      setError(e instanceof Error ? e.message : t("errors.unknown"));
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
      setError(e instanceof Error ? e.message : t("errors.register"));
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
      setError(e instanceof Error ? e.message : t("errors.verify"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(t("removeConfirm"))) {
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
      setError(e instanceof Error ? e.message : t("errors.remove"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SectionShell>
        <div style={{ color: "var(--tl, #6B6F71)" }}>{t("loading")}</div>
      </SectionShell>
    );
  }

  if (!data) {
    return (
      <SectionShell>
        <ErrorBox message={error ?? t("errors.unknown")} />
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
            label={t("verified.label", { address: data.fromAddress ?? "" })}
            sub={t("verified.sub")}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={busy}
            >
              {t("verified.disconnect")}
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
                ? t("pending.label", { domain: data.domain ?? "" })
                : t("failed.label", { domain: data.domain ?? "" })
            }
            sub={
              data.status === "pending"
                ? t("pending.sub")
                : t("failed.sub")
            }
          />
          <DnsRecordsTable records={data.records} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button onClick={handleVerify} disabled={busy} loading={busy}>
              {t("pending.verify")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={busy}
            >
              {t("pending.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* ---------- NONE, default ---------- */}
      {data.status === "none" && !setupMode && (
        <div>
          <StatusRow
            color="var(--tl, #6B6F71)"
            icon="✉"
            label={t("none.label")}
            sub={t("none.sub")}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button onClick={() => setSetupMode(true)}>
              {t("none.setup")}
            </Button>
          </div>
        </div>
      )}

      {/* ---------- NONE, setup-modus ---------- */}
      {data.status === "none" && setupMode && (
        <div>
          <h4 style={{ margin: "0 0 12px", fontSize: 14 }}>
            {t("setup.title")}
          </h4>
          <Input
            label={t("setup.domainLabel")}
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="bistrodemo.nl"
            hint={t("setup.domainHint")}
          />
          <div style={{ marginTop: 12 }}>
            <Input
              label={t("setup.fromLabel")}
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder={domain ? `info@${domain}` : "info@bistrodemo.nl"}
              hint={t("setup.fromHint")}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Button onClick={handleRegister} disabled={busy} loading={busy}>
              {t("setup.create")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSetupMode(false)}
              disabled={busy}
            >
              {t("setup.cancel")}
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
            {t("setup.note")}
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
  const t = useTranslations("dash__components_mail_domain_section");
  return (
    <div className="form-section">
      <div className="form-section-title">{t("sectionTitle")}</div>
      <div className="form-section-desc">{t("sectionDesc")}</div>
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
  const t = useTranslations("dash__components_mail_domain_section");

  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
    } catch {
      // privé-modus / geen permissie, negeren
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
        {t("table.empty")}
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
            <th style={cellPad}>{t("table.type")}</th>
            <th style={cellPad}>{t("table.hostname")}</th>
            <th style={cellPad}>{t("table.value")}</th>
            <th style={cellPad}>{t("table.priority")}</th>
            <th style={cellPad}>{t("table.status")}</th>
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
                  title={t("table.copyTitle")}
                >
                  {t("table.copy")}
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
        {t.rich("table.hostnameTip", {
          code: (chunks) => <code>{chunks}</code>,
        })}
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
