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

// Alt-tekst voor de afbeelding (komt in og:image:alt terecht).
export const alt = "Get-Filly — Meer gasten, minder lege stoelen";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#1F4A2D";
const PAPER = "#FAF7F1";

export default function OpengraphImage() {
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
        {/* Merk-regel: vierkant "mark" + woordmerk */}
        <div
          style={{ display: "flex", alignItems: "center", marginBottom: 48 }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 18,
              backgroundColor: GREEN,
              color: PAPER,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 46,
              fontWeight: 800,
              marginRight: 26,
            }}
          >
            F
          </div>
          <div style={{ fontSize: 46, fontWeight: 700, color: GREEN }}>
            Get-Filly
          </div>
        </div>

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
