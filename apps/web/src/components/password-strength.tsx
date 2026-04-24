"use client";

// ============================================================
// PasswordStrength — checklist onder een wachtwoord-input
// ============================================================
// Toont live welke eisen wel/niet voldaan zijn terwijl de user tikt.
// Eenzelfde component voor /signup én /reset-password zodat de
// regels overal gelijk zijn.
//
// Gebruik:
//   <PasswordStrength password={password} />
//   ...
//   <button disabled={!isPasswordValid(password)}>Opslaan</button>
//
// Alle 4 de eisen zijn verplicht. Als we later "aanbevolen" eisen
// willen (bv. 12+ tekens als bonus) voegen we een tweede tier toe.
// ============================================================

// Eén bron van waarheid voor de regels — zowel UI als validatie
// gebruiken deze array zodat ze niet uit de pas kunnen lopen.
const REQUIREMENTS: Array<{
  id: string;
  label: string;
  test: (pw: string) => boolean;
}> = [
  {
    id: "length",
    label: "Minimaal 8 tekens",
    test: (pw) => pw.length >= 8,
  },
  {
    id: "letter",
    label: "Een letter (a–z of A–Z)",
    test: (pw) => /[a-zA-Z]/.test(pw),
  },
  {
    id: "digit",
    label: "Een cijfer (0–9)",
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: "special",
    label: "Een speciaal teken (! @ # $ % …)",
    // Alles wat geen letter of cijfer is (inclusief spatie, koppelteken,
    // leesteken) telt mee. Houdt de regel uitlegbaar en tolerant.
    test: (pw) => /[^a-zA-Z0-9]/.test(pw),
  },
];

// Exporteer validatie-helper zodat het submit-handler dezelfde check
// doet als het UI-vinkje. Importeer in elke pagina die dit gebruikt.
export function isPasswordValid(password: string): boolean {
  return REQUIREMENTS.every((r) => r.test(password));
}

export function PasswordStrength({ password }: { password: string }) {
  // Bij leeg veld tonen we de checklist in "neutrale" stand zodat de
  // user meteen ziet wat er van hem gevraagd wordt.
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: "8px 0 16px",
        fontSize: 12,
        lineHeight: 1.8,
      }}
    >
      {REQUIREMENTS.map((r) => {
        const ok = r.test(password);
        return (
          <li
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: ok ? "var(--brand, #1F4A2D)" : "var(--tl, #6B6B6B)",
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: ok ? "var(--brand, #1F4A2D)" : "transparent",
                border: ok ? "none" : "1px solid var(--tl, #6B6B6B)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {ok ? "✓" : ""}
            </span>
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
