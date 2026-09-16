"use client";

// ============================================================
// PROTOTYPE — Filly Beeld-studio (UX-voorstel, mock-data)
// ============================================================
//
// GEEN productie-code. Klik-prototype om de UX voor te leggen
// (prototype-first). Geen next-intl / business-context / echte API:
// alles is mock met setTimeout.
//
// Kernidee (v2): EEN bronfoto ("master") -> Filly zet 'm automatisch
// in het JUISTE FORMAAT op ELK geselecteerd kanaal van de campagne.
//   Stap 1  maak de master  (verbeteren / aanpassen / genereren)
//   Stap 2  kies de master-variant
//   Stap 3  Filly maakt per kanaal het juiste formaat -> plaats op alles
//
// Zodra de UX klopt bouw ik dit als echte component in FotoCard en
// koppel aan de bestaande endpoints (enhance/edit/generate/apply),
// uitgebreid met een per-kanaal fan-out.
//
// Bereikbaar op: http://localhost:3000/proto-fototool
// ============================================================

import { useState } from "react";

// Huisstijl hardcoded (prototype): papier-warm + British Racing Green.
const C = {
  paper: "#FAF7F1",
  card: "#FFFFFF",
  green: "#1F4A2D",
  greenDark: "#163A22",
  greenSoft: "rgba(31,74,45,0.08)",
  greenSoftBorder: "rgba(31,74,45,0.20)",
  text: "#1A1A1A",
  ts: "#6B6B6B",
  border: "#E5DFD0",
  danger: "#B91C1C",
  amber: "#8A6D1F",
  amberBg: "#FCF6E3",
};

// De kanalen van deze (voorbeeld)campagne. ratio = breedte/hoogte.
//  - accepts: neemt dit kanaal een foto? (video-kanalen niet)
//  - gbp: representatieve-foto's-regel -> alleen bijsnijden
//  - grows: doel-formaat kan groter zijn dan de master -> outpaint
type Channel = {
  id: string;
  label: string;
  ratioLabel: string;
  ratio: number;
  accepts: boolean; // foto toegestaan?
  reason?: string; // waarom niet meegenomen
  gbp?: boolean;
};
const ALL_CHANNELS: Channel[] = [
  { id: "instagram_feed", label: "Instagram feed", ratioLabel: "1:1", ratio: 1, accepts: true },
  { id: "facebook", label: "Facebook", ratioLabel: "1.91:1", ratio: 1.91, accepts: true },
  { id: "whatsapp", label: "WhatsApp", ratioLabel: "1:1", ratio: 1, accepts: true },
  { id: "google_business", label: "Google Bedrijfsprofiel", ratioLabel: "4:3", ratio: 4 / 3, accepts: true, gbp: true },
  { id: "instagram_reels", label: "Instagram Reels", ratioLabel: "9:16", ratio: 9 / 16, accepts: false, reason: "vereist video" },
];

type Mode = "verbeteren" | "aanpassen" | "genereren";
type Step = "create" | "formatting" | "review";

// Mock-"foto": warme gradient. Vaste background-size zodat verschillende
// frame-ratio's een ANDER deel tonen = "zelfde foto, ander formaat".
function mockPhoto(seed: number): string {
  const hues = [24, 32, 14, 40, 8, 20];
  const h = hues[seed % hues.length];
  return [
    `radial-gradient(60% 50% at 30% 30%, hsl(${h} 72% 62%) 0%, transparent 55%)`,
    `radial-gradient(70% 60% at 78% 72%, hsl(${(h + 18) % 360} 55% 40%) 0%, transparent 60%)`,
    `radial-gradient(50% 50% at 60% 45%, hsl(${(h + 8) % 360} 62% 55%) 0%, transparent 65%)`,
    `linear-gradient(135deg, hsl(${h} 45% 45%), hsl(${(h + 24) % 360} 40% 30%))`,
  ].join(", ");
}
// Achtergrond-props zodat een crop zichtbaar wordt bij verschillende ratio's.
function photoBg(seed: number): React.CSSProperties {
  return {
    backgroundImage: mockPhoto(seed),
    backgroundSize: "420px 420px",
    backgroundPosition: "center",
  };
}

export default function ProtoFotoTool() {
  // Vanuit welk kanaal open je de studio (voor de contextregel).
  const entryChannel = ALL_CHANNELS[0]; // Instagram feed
  const [hasPhoto, setHasPhoto] = useState(true);
  const [mode, setMode] = useState<Mode>("verbeteren");
  const [instruction, setInstruction] = useState("");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(2);

  const [step, setStep] = useState<Step>("create");
  const [creating, setCreating] = useState(false); // master aan het maken
  const [masters, setMasters] = useState<number[]>([]);
  const [pickedMaster, setPickedMaster] = useState<number | null>(null);
  const [placedSeed, setPlacedSeed] = useState<number | null>(0); // wat er nu op de kanalen staat
  const [toast, setToast] = useState<string | null>(null);

  const effectiveMode: Mode = hasPhoto ? mode : "genereren";
  const photoChannels = ALL_CHANNELS.filter((c) => c.accepts);
  const videoChannels = ALL_CHANNELS.filter((c) => !c.accepts);

  const fillySuggestion =
    "Sfeervolle najaarsborrel: houten tafel, kaarslicht, bittergarnituur en twee glazen rode wijn, warme avondsfeer.";

  const canRun =
    effectiveMode === "genereren"
      ? prompt.trim().length > 0
      : effectiveMode === "aanpassen"
        ? instruction.trim().length > 0 && hasPhoto
        : hasPhoto;

  const makeMaster = () => {
    setStep("create");
    setPickedMaster(null);
    setMasters([]);
    setCreating(true); // toon laad-skeletons van de master-varianten
    window.setTimeout(() => {
      const base = Math.floor(Math.random() * 1000);
      setMasters(Array.from({ length: count }, (_, i) => base + i + 1));
      setCreating(false);
    }, 1100);
  };

  const chooseMaster = (seed: number) => {
    setPickedMaster(seed);
    setStep("formatting");
    // Filly rendert per kanaal het juiste formaat.
    window.setTimeout(() => setStep("review"), 1300);
  };

  const placeOnAll = () => {
    setPlacedSeed(pickedMaster);
    setHasPhoto(true);
    setToast(`Foto op ${photoChannels.length} kanalen geplaatst, elk in het juiste formaat.`);
    setStep("create");
    setMasters([]);
    setPickedMaster(null);
    window.setTimeout(() => setToast(null), 3000);
  };

  const restart = () => {
    setStep("create");
    setMasters([]);
    setPickedMaster(null);
  };

  return (
    <main style={{ background: C.paper, minHeight: "100vh", color: C.text }}>
      <style>{`
        .pbtn { font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid ${C.border};
          background: ${C.card}; color: ${C.text}; padding: 9px 14px; font-weight: 600; transition: all .12s; }
        .pbtn:hover:not(:disabled) { border-color: ${C.green}; color: ${C.green}; }
        .pbtn:disabled { opacity: .45; cursor: not-allowed; }
        .pbtn.primary { background: ${C.green}; border-color: ${C.green}; color: #fff; }
        .pbtn.primary:hover:not(:disabled) { background: ${C.greenDark}; color: #fff; }
        .ptab { flex: 1; text-align: left; padding: 12px 14px; border-radius: 8px; cursor: pointer;
          border: 1px solid ${C.border}; background: ${C.card}; transition: all .12s; }
        .ptab:hover:not(:disabled) { border-color: ${C.greenSoftBorder}; }
        .ptab.active { border-color: ${C.green}; background: ${C.greenSoft}; box-shadow: 0 0 0 1px ${C.green} inset; }
        .ptab:disabled { opacity: .4; cursor: not-allowed; }
        .pinput { font: inherit; width: 100%; box-sizing: border-box; border: 1px solid ${C.border};
          border-radius: 8px; padding: 10px 12px; color: ${C.text}; background: ${C.card}; resize: vertical; }
        .pinput:focus { outline: none; border-color: ${C.green}; box-shadow: 0 0 0 3px ${C.greenSoft}; }
        .frame { position: relative; border-radius: 8px; overflow: hidden; border: 2px solid transparent; transition: border-color .12s; }
        .frame.pick { cursor: pointer; }
        .frame.pick:hover { border-color: ${C.greenSoftBorder}; }
        .frame.sel { border-color: ${C.green}; }
        .chip { display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; }
        @keyframes pulse { 0%,100%{opacity:.55} 50%{opacity:1} }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 90px" }}>
        <div style={{ ...banner(C.amberBg, C.amber), marginBottom: 20 }}>
          <strong>Prototype</strong> — klikbaar UX-voorstel met mock-beelden. Nog geen echte AI.
          Toggle rechtsboven voor de twee begintoestanden (met / zonder foto).
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: C.ts, fontWeight: 600, letterSpacing: ".02em" }}>FILLY BEELD-STUDIO</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 800, color: C.green }}>
              Eén foto, passend op al je kanalen
            </h1>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.ts, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hasPhoto}
              onChange={(e) => {
                setHasPhoto(e.target.checked);
                setPlacedSeed(e.target.checked ? 0 : null);
                if (!e.target.checked) setMode("genereren");
                restart();
              }}
            />
            campagne heeft al een foto
          </label>
        </div>

        {/* Contextregel: je opent vanuit 1 kanaal, maar het geldt voor alle */}
        <div style={{ ...card(C), padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 14 }}>
            Je voegt de foto toe vanuit <strong>{entryChannel.label}</strong>. Filly plaatst
            dezelfde foto <strong>passend op alle kanalen</strong> van deze campagne.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {ALL_CHANNELS.map((c) => (
              <span
                key={c.id}
                className="chip"
                title={c.accepts ? undefined : c.reason}
                style={{
                  background: c.accepts ? C.greenSoft : "#EFEAE0",
                  color: c.accepts ? C.green : C.ts,
                  border: `1px solid ${c.accepts ? C.greenSoftBorder : C.border}`,
                  opacity: c.accepts ? 1 : 0.7,
                }}
              >
                {c.label} · {c.ratioLabel}{c.accepts ? "" : ` (${c.reason})`}
              </span>
            ))}
          </div>
        </div>

        {/* Kaart die zich als 96px-thumb-rij gedraagt zodra er een foto staat */}
        {placedSeed != null && step === "create" && masters.length === 0 && (
          <div style={{ ...card(C), padding: 14, marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ ...photoBg(placedSeed), width: 84, height: 84, borderRadius: 8, border: `1px solid ${C.border}` }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 700 }}>Huidige campagne-foto</div>
              <div style={{ fontSize: 13, color: C.ts, marginTop: 2 }}>
                Staat op {photoChannels.length} kanalen, elk in eigen formaat
              </div>
            </div>
          </div>
        )}

        {/* ─────────── STAP 1: master maken ─────────── */}
        {(step === "create") && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <button className={`ptab ${effectiveMode === "verbeteren" ? "active" : ""}`} onClick={() => setMode("verbeteren")} disabled={!hasPhoto}>
                <div style={{ fontWeight: 700 }}>✨ Verbeteren</div>
                <div style={{ fontSize: 12, color: C.ts, marginTop: 3 }}>Licht, kleur en scherpte oppoetsen. Inhoud blijft gelijk.</div>
              </button>
              <button className={`ptab ${effectiveMode === "aanpassen" ? "active" : ""}`} onClick={() => setMode("aanpassen")} disabled={!hasPhoto}>
                <div style={{ fontWeight: 700 }}>🖌️ Aanpassen</div>
                <div style={{ fontSize: 12, color: C.ts, marginTop: 3 }}>Iets toevoegen of veranderen op je eigen foto.</div>
              </button>
              <button className={`ptab ${effectiveMode === "genereren" ? "active" : ""}`} onClick={() => setMode("genereren")}>
                <div style={{ fontWeight: 700 }}>🎨 Genereren</div>
                <div style={{ fontSize: 12, color: C.ts, marginTop: 3 }}>Geen foto? Filly maakt er een op basis van de campagne.</div>
              </button>
            </div>

            <div style={{ ...card(C), padding: 18 }}>
              <div style={{ fontSize: 13, color: C.ts, marginBottom: 12 }}>
                Stap 1 van 2 — Filly maakt eerst de foto. Daarna zet je 'm in één klik op alle kanalen in het juiste formaat.
              </div>

              {effectiveMode === "verbeteren" && (
                <p style={{ margin: "0 0 14px", color: C.ts, fontSize: 14 }}>
                  Filly poetst je huidige foto op als een fotograaf: betere belichting, natuurlijke kleuren, scherper. De inhoud verandert niet.
                </p>
              )}
              {effectiveMode === "aanpassen" && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle(C)}>Wat wil je aanpassen?</label>
                  <textarea className="pinput" rows={2} placeholder="Bijv: leg er wat bittergarnituur en twee glazen rode wijn bij, warmer avondlicht" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                </div>
              )}
              {effectiveMode === "genereren" && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle(C)}>Beschrijf de foto die Filly moet maken</label>
                  <textarea className="pinput" rows={3} placeholder="Bijv: sfeervolle najaarsborrel met bittergarnituur en rode wijn op een houten tafel" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                  <button className="pbtn" style={{ marginTop: 8, fontSize: 13, padding: "6px 10px" }} onClick={() => setPrompt(fillySuggestion)}>💡 Neem Filly&apos;s suggestie over</button>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: C.ts }}>Aantal varianten</span>
                  {[1, 2, 3].map((n) => (
                    <button key={n} className={`pbtn ${count === n ? "primary" : ""}`} style={{ padding: "6px 12px" }} onClick={() => setCount(n)}>{n}</button>
                  ))}
                </div>
                <button className="pbtn primary" disabled={!canRun} onClick={makeMaster}>
                  {effectiveMode === "verbeteren" ? "✨ Verbeter foto" : effectiveMode === "aanpassen" ? "🖌️ Pas foto aan" : "🎨 Genereer foto"}
                </button>
              </div>

              {/* Skeletons tijdens het maken van de master-varianten */}
              {creating && (
                <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 12 }}>
                  {Array.from({ length: count }).map((_, i) => (
                    <div key={i} style={{ aspectRatio: "4 / 5", borderRadius: 8, background: `linear-gradient(90deg, ${C.greenSoft}, #EFE9DC, ${C.greenSoft})`, animation: "pulse 1.2s infinite" }} />
                  ))}
                </div>
              )}

              {masters.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 13, color: C.ts, marginBottom: 8 }}>
                    Kies de foto die je wilt gebruiken. Filly zet 'm daarna op elk kanaal in het juiste formaat. Je origineel blijft bewaard.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${masters.length}, 1fr)`, gap: 12 }}>
                    {masters.map((seed) => (
                      <div key={seed} className={`frame pick ${pickedMaster === seed ? "sel" : ""}`} style={{ ...photoBg(seed), aspectRatio: "4 / 5" }} onClick={() => chooseMaster(seed)}>
                        <span className="chip" style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,.55)", color: "#fff" }}>AI · SynthID</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─────────── STAP tussenin: formatteren ─────────── */}
        {step === "formatting" && (
          <div style={{ ...card(C), padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Filly maakt de kanaalformaten...</div>
            <div style={{ fontSize: 13, color: C.ts }}>
              Dezelfde foto, bijgesneden en waar nodig bijgevuld voor {photoChannels.length} kanalen.
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
              {photoChannels.map((c) => (
                <div key={c.id} style={{ width: 90 }}>
                  <div style={{ aspectRatio: String(c.ratio), borderRadius: 8, background: `linear-gradient(90deg, ${C.greenSoft}, #EFE9DC, ${C.greenSoft})`, animation: "pulse 1.2s infinite" }} />
                  <div style={{ fontSize: 11, color: C.ts, marginTop: 4 }}>{c.ratioLabel}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─────────── STAP 2: review per kanaal ─────────── */}
        {step === "review" && pickedMaster != null && (
          <div style={{ ...card(C), padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Stap 2 van 2 — zo komt de foto op elk kanaal</div>
                <div style={{ fontSize: 13, color: C.ts, marginTop: 2 }}>
                  Alles is dezelfde foto, bijgesneden op het juiste formaat. Waar het formaat groter is, vult Filly netjes bij.
                </div>
              </div>
              <button className="pbtn" onClick={restart}>Andere foto kiezen</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 16, marginTop: 18 }}>
              {photoChannels.map((c) => (
                <div key={c.id}>
                  <div className="frame" style={{ ...photoBg(pickedMaster), aspectRatio: String(c.ratio), border: `1px solid ${C.border}` }}>
                    <span className="chip" style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,.55)", color: "#fff" }}>{c.ratioLabel}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span>
                    <button className="pbtn" style={{ padding: "2px 8px", fontSize: 12 }}>bijsnijden</button>
                  </div>
                  {c.gbp && (
                    <div style={{ fontSize: 11, color: C.amber, marginTop: 3 }}>Alleen bijgesneden (representatief)</div>
                  )}
                </div>
              ))}
            </div>

            {videoChannels.length > 0 && (
              <div style={{ ...banner(C.amberBg, C.amber), marginTop: 16, fontSize: 13 }}>
                {videoChannels.map((c) => c.label).join(", ")} {videoChannels.length === 1 ? "vereist" : "vereisen"} video, dus die {videoChannels.length === 1 ? "wordt" : "worden"} niet automatisch meegenomen. Daar regel je los een video.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button className="pbtn primary" onClick={placeOnAll}>Plaats op alle kanalen</button>
              <button className="pbtn">Bewaar ook in bibliotheek</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: C.ts, textAlign: "right" }}>
          Filly-beeld deze maand: 12 van 200 gebruikt
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.green, color: "#fff", padding: "12px 20px", borderRadius: 8, fontWeight: 600, boxShadow: "0 6px 24px rgba(0,0,0,.18)" }}>
          {toast}
        </div>
      )}
    </main>
  );
}

// ---- helpers ----
function card(c: typeof C): React.CSSProperties {
  return { background: c.card, border: `1px solid ${c.border}`, borderRadius: 8 };
}
function banner(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, border: `1px solid ${fg}33`, borderRadius: 8, padding: "10px 14px", fontSize: 14 };
}
function labelStyle(c: typeof C): React.CSSProperties {
  return { display: "block", fontSize: 13, fontWeight: 600, color: c.text, marginBottom: 6 };
}
