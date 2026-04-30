"use client";

// ============================================================
// Design-System Reference — /dashboard/design-system
// ============================================================
//
// Eigen mini-Storybook zonder de Storybook-overhead. Toont alle
// design-tokens + base-components op één pagina zodat je tijdens
// UI-werk snel kan zien wat er beschikbaar is + welke variant het
// dichtst bij je bedoeling ligt.
//
// **Niet gelinkt vanuit de sidebar** — bookmark de URL. Pagina is
// technisch reachable voor elke ingelogde user, maar onzichtbaar
// voor klanten zolang we 'm niet linken. Optioneel later beperken
// tot een admin-email-check als we klanten gaan onboarden.
//
// Bij toevoegen van een nieuw base-component: voeg hier een sectie
// toe zodat het ontdekbaar blijft. Anders bouw je 't 6 maanden later
// opnieuw omdat niemand wist dat het bestond.
// ============================================================

import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Card, CardHeader, CardBody, CardFooter } from "../../../components/ui/card";

// Hulpje: kleine sectie-wrapper met titel zodat de pagina visueel
// eenduidig oogt zonder dat we een echt section-component nodig
// hebben — dit is alleen een dev-pagina.
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "var(--space-7)" }}>
      <h2
        style={{
          fontSize: "var(--font-size-xl)",
          fontWeight: "var(--font-weight-semibold)",
          marginBottom: "var(--space-2)",
        }}
      >
        {title}
      </h2>
      {description && (
        <p
          style={{
            color: "var(--color-text-soft)",
            marginBottom: "var(--space-4)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

// Token-swatch voor de palette-sectie. Toont het hex-blokje + de
// CSS-variable-naam zodat je 'm direct kan kopiëren.
function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-2)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        background: "var(--color-white)",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "var(--radius-sm)",
          background: value,
          border: "1px solid var(--color-border-soft)",
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text-soft)",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div
      style={{
        padding: "var(--space-6)",
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "var(--font-sans)",
      }}
    >
      <header style={{ marginBottom: "var(--space-7)" }}>
        <h1
          style={{
            fontSize: "var(--font-size-2xl)",
            fontWeight: "var(--font-weight-bold)",
            marginBottom: "var(--space-2)",
          }}
        >
          Design System
        </h1>
        <p style={{ color: "var(--color-text-soft)" }}>
          Reference-pagina voor alle design-tokens + base-components in de
          Get Filly UI. Bookmark 'm of grep naar &lsquo;DesignSystemPage&rsquo;
          als je iets zoekt.
        </p>
      </header>

      {/* ============================================================
          KLEUREN
          ============================================================ */}
      <Section
        title="Kleuren"
        description="Brand, surface, text en status. Alle tokens uit tokens.css."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "var(--space-2)",
          }}
        >
          <Swatch name="--color-brand" value="#1F4A2D" />
          <Swatch name="--color-brand-deep" value="#0E2B17" />
          <Swatch name="--color-brand-soft" value="#D6E0D8" />
          <Swatch name="--color-highlight" value="#D97F3C" />
          <Swatch name="--color-highlight-soft" value="#FDF0E5" />
          <Swatch name="--color-cream" value="#FAF7F1" />
          <Swatch name="--color-surface" value="#EFE8D8" />
          <Swatch name="--color-text" value="#18181B" />
          <Swatch name="--color-text-soft" value="#52525B" />
          <Swatch name="--color-text-muted" value="#71717A" />
          <Swatch name="--color-text-disabled" value="#A1A1AA" />
          <Swatch name="--color-success" value="#16A34A" />
          <Swatch name="--color-warning" value="#F97316" />
          <Swatch name="--color-danger" value="#DC2626" />
          <Swatch name="--color-info" value="#0071E3" />
        </div>
      </Section>

      {/* ============================================================
          SPACING
          ============================================================ */}
      <Section
        title="Spacing"
        description="8px-grid met 4px tussenstap. Gebruik var(--space-3) i.p.v. 12px in nieuwe code."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            ["--space-1", "4px"],
            ["--space-2", "8px"],
            ["--space-3", "12px"],
            ["--space-4", "16px"],
            ["--space-5", "24px"],
            ["--space-6", "32px"],
            ["--space-7", "48px"],
            ["--space-8", "64px"],
          ].map(([token, px]) => (
            <div
              key={token}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                fontSize: "var(--font-size-sm)",
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  width: 110,
                  color: "var(--color-text-soft)",
                }}
              >
                {token}
              </div>
              <div
                style={{
                  width: px,
                  height: 12,
                  background: "var(--color-brand)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
              <div style={{ color: "var(--color-text-muted)" }}>{px}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================
          BUTTON
          ============================================================ */}
      <Section
        title="Button"
        description="4 variants × 2 sizes + loading-state + optionele icons."
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-3)",
            alignItems: "center",
          }}
        >
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-3)",
            alignItems: "center",
            marginTop: "var(--space-4)",
          }}
        >
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="md">
            Medium
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="primary" loading>
            Loading
          </Button>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-3)",
            alignItems: "center",
            marginTop: "var(--space-4)",
          }}
        >
          <Button variant="primary" iconLeft="✓">
            Met icon links
          </Button>
          <Button variant="secondary" iconRight="→">
            Met icon rechts
          </Button>
        </div>
      </Section>

      {/* ============================================================
          BADGE
          ============================================================ */}
      <Section
        title="Badge"
        description="Pill-stijl status-indicator. 6 variants, optioneel met dot."
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            alignItems: "center",
          }}
        >
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="brand">Brand</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="info">Info</Badge>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            alignItems: "center",
            marginTop: "var(--space-3)",
          }}
        >
          <Badge variant="neutral" withDot>
            Concept
          </Badge>
          <Badge variant="info" withDot>
            Ingepland
          </Badge>
          <Badge variant="success" withDot>
            Actief
          </Badge>
          <Badge variant="brand" withDot>
            Afgerond
          </Badge>
        </div>
      </Section>

      {/* ============================================================
          CARD
          ============================================================ */}
      <Section
        title="Card"
        description="Wrapper met consistente padding/border/shadow. Sub-components voor header/body/footer."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <Card>
            <CardHeader title="Eenvoudige card" subtitle="Met subtitle" />
            <CardBody>
              <p
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-text-soft)",
                }}
              >
                Body-content komt hier. Padding zit al in de Card-wrapper, dus
                de body heeft zelf geen extra padding nodig.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Met header-actie"
              subtitle="Bedrijfs-cijfers"
              action={
                <Button variant="ghost" size="sm">
                  Zie alles →
                </Button>
              }
            />
            <CardBody>
              <p
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-text-soft)",
                }}
              >
                Header krijgt rechts een actie-area voor knoppen, badges of
                dropdown-menu's.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Met footer" />
            <CardBody>
              <p
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-text-soft)",
                }}
              >
                Forms en wizard-steps gebruiken een footer voor de
                action-buttons.
              </p>
            </CardBody>
            <CardFooter>
              <Button variant="ghost">Annuleer</Button>
              <Button variant="primary">Opslaan</Button>
            </CardFooter>
          </Card>
        </div>
      </Section>

      {/* ============================================================
          GEBRUIK
          ============================================================ */}
      <Section
        title="Hoe gebruiken in nieuwe code"
        description="Korte cheat-sheet bij refactor van bestaande inline-styled UI."
      >
        <pre
          style={{
            background: "var(--color-surface)",
            padding: "var(--space-4)",
            borderRadius: "var(--radius)",
            fontSize: "var(--font-size-sm)",
            overflowX: "auto",
            color: "var(--color-text)",
          }}
        >
{`import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";

<Button variant="primary" loading={saving}>Opslaan</Button>

<Badge variant="success" withDot>Actief</Badge>

<Card>
  <CardHeader title="Titel" subtitle="..." />
  <CardBody>...</CardBody>
</Card>`}
        </pre>
      </Section>
    </div>
  );
}
