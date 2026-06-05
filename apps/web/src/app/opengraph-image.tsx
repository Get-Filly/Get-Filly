// =============================================================================
// opengraph-image, gegenereerde social-deelafbeelding (1200×630)
// =============================================================================
// File-conventie van Next: dit levert de og:image + twitter:image voor de
// HELE site (propageert naar alle routes) en heeft voorrang op het
// openGraph-object. Wordt op de build gerenderd via next/og (Satori) — let
// op: alleen flexbox + een subset van CSS werkt, geen grid.
//
// Huisstijl: papier-warm (#FAF7F1) + British Racing Green (#1F4A2D).
// Wil je later een echt ontworpen beeld? Plaats simpelweg een
// `opengraph-image.png` (1200×630) in deze map — een statisch bestand
// wint van dit gegenereerde beeld.
// =============================================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Alt-tekst voor de afbeelding (komt in og:image:alt terecht).
export const alt = "Get-Filly — Meer gasten, minder lege stoelen";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#1F4A2D";
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
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: PAPER,
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Het echte Get-Filly-logo (volledig logo, geen nagemaakt mark) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={298}
          height={96}
          alt="Get-Filly"
          style={{ marginBottom: 48 }}
        />

        {/* Kop — twee regels, zodat 'm lekker groot blijft */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 82,
            fontWeight: 800,
            color: GREEN,
            lineHeight: 1.05,
            letterSpacing: -2,
          }}
        >
          <span>Meer gasten.</span>
          <span>Minder lege stoelen.</span>
        </div>

        {/* Subregel */}
        <div style={{ fontSize: 32, color: "#5B6B5F", marginTop: 36 }}>
          AI-marketing die je restaurant automatisch voller maakt.
        </div>
      </div>
    ),
    { ...size },
  );
}
