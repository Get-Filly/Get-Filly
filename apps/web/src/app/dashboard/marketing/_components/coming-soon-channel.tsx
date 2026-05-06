import Link from "next/link";
import { PageHeader } from "../../../../components/ui/page-header";
import { Card, CardBody } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";

/**
 * ============================================================
 * <ComingSoonChannel>, gedeeld template voor IG/FB/TikTok-pagina's
 * ============================================================
 *
 * Toont een placeholder met:
 *   - Titel + uitleg waarom 't nog niet werkt (Meta/TikTok approval)
 *   - Mockup-beschrijving: lijst met wat er straks komt
 *   - "Naar de hub"-link voor wat wel werkt (Mail)
 *
 * Eén component voor alle drie de socials zodat we de copy en het
 * design op één plek beheren. Bij approval-binnen vervangen we de
 * /[platform]/page.tsx-files door echte detail-pagina's.
 * ============================================================
 */
type Props = {
  channelName: string;
  // Bv. "Meta App Review (2-8 weken)" of "TikTok Marketing API approval"
  approvalDescription: string;
  // Lijst met wat de eigenaar straks ziet zodra 't live is.
  features: string[];
};

export function ComingSoonChannel({
  channelName,
  approvalDescription,
  features,
}: Props) {
  return (
    <div className="page-full">
      <PageHeader
        title={`${channelName}-prestaties`}
        subtitle={`Bereik, engagement en publiek-data, beschikbaar zodra ${channelName} gekoppeld is.`}
      />

      {/* Status-banner met uitleg waarom nog niet werkt. Vergelijkbaar
          met de Google Business hub-banner zodat de styling consistent is. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--space-3)",
          padding: "var(--space-4)",
          marginBottom: "var(--space-5)",
          backgroundColor: "var(--color-brand-soft, #F3F4F6)",
          border: "1px solid var(--color-border, #E4E4E7)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
          🔵
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              marginBottom: 4,
              color: "var(--text, #18181B)",
            }}
          >
            Nog niet beschikbaar
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              lineHeight: 1.5,
            }}
          >
            We werken aan {approvalDescription} om je {channelName}-account
            officieel te kunnen koppelen. Dit duurt typisch enkele weken.
            Daarna pakken we direct alles uit dit overzicht hieronder op.
          </div>
        </div>
      </div>

      {/* Mockup-beschrijving: lijst met features die komen */}
      <Card>
        <CardBody>
          <div
            style={{
              fontWeight: 600,
              fontSize: 16,
              marginBottom: "var(--space-3)",
              color: "var(--text, #18181B)",
            }}
          >
            Wat je straks ziet op deze pagina
          </div>
          <ul
            style={{
              fontSize: 14,
              color: "var(--text-secondary, #52525B)",
              lineHeight: 1.8,
              paddingLeft: "var(--space-5)",
              margin: 0,
            }}
          >
            {features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <div
        style={{
          marginTop: "var(--space-5)",
          display: "flex",
          gap: "var(--space-2)",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href="/dashboard/marketing">
          <Button variant="secondary">Terug naar Marketing-hub</Button>
        </Link>
        <Link href="/dashboard/marketing/mail">
          <Button variant="primary">Bekijk Mail (werkt al)</Button>
        </Link>
      </div>
    </div>
  );
}
