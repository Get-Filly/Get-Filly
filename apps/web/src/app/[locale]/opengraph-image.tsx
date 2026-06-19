// =============================================================================
// opengraph-image, social-deelafbeelding (1200×630)
// =============================================================================
// File-conventie van Next: levert de og:image + twitter:image. Wordt op de
// build gerenderd via next/og (Satori) — alleen flexbox + een subset van CSS.
//
// Bewust minimalistisch: ALLEEN het Get-Filly-logo, gecentreerd op de
// papier-warme huisstijl-achtergrond (#FAF7F1). Geen kop/tagline — die staan
// al in de og:title/og:description die social naast de afbeelding toont.
// =============================================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Alt-tekst voor de afbeelding (komt in og:image:alt terecht).
export const alt = "Get-Filly";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#FAF7F1";

export default async function OpengraphImage() {
  // Het échte Get-Filly-logo (volledig: symbool + woordmerk). Satori kan
  // geen bestandspaden volgen, dus we lezen het PNG van schijf en geven het
  // als base64 data-URI mee. logo.png is 1628×525 (ratio ~3,1:1).
  const logoData = await readFile(join(process.cwd(), "public", "logo.png"));
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: PAPER,
        }}
      >
        {/* Alleen het logo, gecentreerd. 700×226 houdt de ~3,1:1-ratio aan. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={700} height={226} alt="Get-Filly" />
      </div>
    ),
    { ...size },
  );
}
