// ============================================================
// WaaromCard, read-only uitleg van Filly's redenering
// ============================================================
//
// Toont waarom Filly dit voorstel doet, bovenaan de detail-pagina
// zodat eigenaar de context heeft vóór 'ie kanalen of inhoud
// bewerkt. Geen interactie — als reasoning ontbreekt rendert
// 'ie niets (return null) zodat de pagina-flow niet hapert.

type Props = {
  reasoning: string | null;
};

export function WaaromCard({ reasoning }: Props) {
  if (!reasoning) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">Waarom dit voorstel</div>
        </div>
      </div>
      <div className="card-b">
        <div
          style={{
            fontSize: 14,
            color: "var(--ts)",
            lineHeight: 1.6,
          }}
        >
          {reasoning}
        </div>
      </div>
    </div>
  );
}
