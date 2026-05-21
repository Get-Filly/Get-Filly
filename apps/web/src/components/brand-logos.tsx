// ============================================================
// BrandLogos — inline SVG voor de 8 partner-merken
// ============================================================
// Vereenvoudigde maar herkenbare merk-iconen voor de
// VindbaarheidVisualizer. Allemaal 32x32 viewBox, geen
// achtergrond — de SVG vult naar wens via parent <svg>
// container. Gebruikt door <BrandLogo id="..." /> waar id
// matched met de PARTNERS-lijst in vindbaarheid-visualizer.

type BrandId =
  | "google"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "opentable"
  | "maps"
  | "thefork"
  | "tripadvisor";

// Google G — multi-color (Simple-Icons paths, vereenvoudigd).
function GoogleLogo() {
  return (
    <g>
      <path
        d="M30.06 16.36c0-1.06-.09-2.07-.27-3.04H16v5.76h7.88c-.34 1.83-1.37 3.38-2.92 4.42v3.67h4.72c2.76-2.55 4.38-6.31 4.38-10.81z"
        fill="#4285F4"
      />
      <path
        d="M16 31c3.95 0 7.27-1.31 9.69-3.55l-4.72-3.67c-1.31.88-2.99 1.4-4.97 1.4-3.82 0-7.05-2.58-8.21-6.04H2.91v3.79C5.32 27.96 10.27 31 16 31z"
        fill="#34A853"
      />
      <path
        d="M7.79 19.13c-.29-.88-.46-1.82-.46-2.79s.16-1.91.46-2.79V9.76H2.91C1.93 11.71 1.36 13.79 1.36 16s.57 4.29 1.55 6.24l4.88-3.11z"
        fill="#FBBC05"
      />
      <path
        d="M16 7.18c2.15 0 4.07.74 5.59 2.19l4.19-4.19C23.27 2.79 19.95 1.5 16 1.5 10.27 1.5 5.32 4.54 2.91 9.07l4.88 3.79c1.16-3.46 4.39-5.68 8.21-5.68z"
        fill="#EA4335"
      />
    </g>
  );
}

// ChatGPT / OpenAI — vereenvoudigde 6-punt knot. De originele
// is een complex pad; deze benadering houdt de signature 'bloei'-
// vorm met 6 stralende blaadjes.
function ChatgptLogo() {
  return (
    <g>
      <circle cx="16" cy="16" r="14" fill="#000000" />
      <path
        d="M22.7 13.3c.4-1.2.2-2.6-.5-3.7-1.1-1.9-3.4-2.9-5.5-2.3-1-1.1-2.4-1.7-3.9-1.7-2.4 0-4.5 1.5-5.2 3.8-1.2.3-2.3 1-3 2-1.2 1.9-1 4.4.5 6 .4 2.2 2.3 3.9 4.6 4.2 1 1.1 2.4 1.7 3.9 1.7 2.4 0 4.5-1.5 5.2-3.8 1.2-.3 2.3-1 3-2 1.2-1.9 1-4.4-.5-6zm-7.5 9.4c-1 0-1.9-.3-2.7-.9.5-.3 1.4-.8 1.4-.8l4.5-2.6c.2-.1.4-.4.4-.7v-6.3l1.9 1.1v6.4c0 2.1-1.7 3.8-3.8 3.8zm-7.5-3.2c-.5-.8-.6-1.7-.4-2.6.3.2 1 .6 1 .6l4.5 2.6c.2.1.5.1.7 0l5.5-3.1v2.2l-4.6 2.7c-1.8 1-4.1.4-5.1-1.4l-1.6-1zm-1.1-9.5c.5-.9 1.3-1.5 2.3-1.9 0 .4 0 1 0 1l-.1 5.2c0 .3.1.5.3.6l5.5 3.2-1.9 1.1-4.5-2.6c-1.8-1-2.4-3.3-1.4-5.1l-.2-1.5zm15.7 3.7l-5.5-3.2 1.9-1.1 4.5 2.6c1.8 1 2.4 3.3 1.4 5.1-.5.9-1.3 1.5-2.3 1.8v-5.2zm1.9-2.8l-.6-.4-4.5-2.6c-.2-.1-.5-.1-.7 0l-5.5 3.1v-2.2l4.6-2.7c1.8-1 4.1-.4 5.1 1.4l1.6 3.4zm-12 3.8l-1.9-1.1V8.4c0-2.1 1.7-3.8 3.8-3.8 1 0 1.9.3 2.7.9-.5.3-1.4.8-1.4.8l-4.5 2.6c-.2.1-.4.4-.4.7v3z"
        fill="#FFFFFF"
        fillRule="evenodd"
      />
    </g>
  );
}

// Claude / Anthropic — 8-stralige burst in oranje (signature).
function ClaudeLogo() {
  return (
    <g>
      <circle cx="16" cy="16" r="14" fill="#FFFFFF" stroke="#E5DFD0" strokeWidth="0.5" />
      <g fill="#D97757">
        {/* 8-stralige burst, elk balletje een staafje vanuit centrum */}
        <rect x="15" y="4"  width="2" height="7" rx="1" />
        <rect x="15" y="21" width="2" height="7" rx="1" />
        <rect x="4"  y="15" width="7" height="2" rx="1" />
        <rect x="21" y="15" width="7" height="2" rx="1" />
        <rect x="7.7"  y="6.3"  width="2" height="7" rx="1" transform="rotate(-45 8.7 9.8)" />
        <rect x="7.7"  y="18.7" width="2" height="7" rx="1" transform="rotate(45 8.7 22.2)" />
        <rect x="22.3" y="6.3"  width="2" height="7" rx="1" transform="rotate(45 23.3 9.8)" />
        <rect x="22.3" y="18.7" width="2" height="7" rx="1" transform="rotate(-45 23.3 22.2)" />
      </g>
    </g>
  );
}

// Gemini — 4-puntige sparkle in blauwe gradient (vereenvoudigd
// naar enkele kleur).
function GeminiLogo() {
  return (
    <g>
      <circle cx="16" cy="16" r="14" fill="#FFFFFF" stroke="#E5DFD0" strokeWidth="0.5" />
      <path
        d="M16 4 L18.5 13.5 L28 16 L18.5 18.5 L16 28 L13.5 18.5 L4 16 L13.5 13.5 Z"
        fill="#4F8CFF"
      />
    </g>
  );
}

// OpenTable — rode cirkel met witte 'O'-ring.
function OpentableLogo() {
  return (
    <g>
      <circle cx="16" cy="16" r="14" fill="#DA3743" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#FFFFFF" strokeWidth="2.6" />
      <circle cx="16" cy="16" r="2.5" fill="#FFFFFF" />
    </g>
  );
}

// Google Maps / Kaarten — pin-drop shape, multi-color.
function MapsLogo() {
  return (
    <g>
      <circle cx="16" cy="16" r="14" fill="#FFFFFF" stroke="#E5DFD0" strokeWidth="0.5" />
      {/* Pin shape: drop met cirkel binnen */}
      <path
        d="M16 6c-3.86 0-7 3.14-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7z"
        fill="#EA4335"
      />
      <circle cx="16" cy="13" r="3" fill="#FFFFFF" />
    </g>
  );
}

// TheFork — groene cirkel met witte vork.
function TheforkLogo() {
  return (
    <g>
      <circle cx="16" cy="16" r="14" fill="#00A36E" />
      {/* Eenvoudige vork: 3 tanden + handvat */}
      <g fill="#FFFFFF">
        <rect x="11" y="6"  width="1.6" height="6.5" rx="0.6" />
        <rect x="14"   y="6"  width="1.6" height="6.5" rx="0.6" />
        <rect x="17" y="6"  width="1.6" height="6.5" rx="0.6" />
        <rect x="11" y="11" width="7.6" height="2" rx="1" />
        <rect x="13.5" y="11" width="3" height="15" rx="1.4" />
      </g>
    </g>
  );
}

// Tripadvisor — groene cirkel met owl-eyes (2 cirkels).
function TripadvisorLogo() {
  return (
    <g>
      <circle cx="16" cy="16" r="14" fill="#00AA6C" />
      {/* Twee witte 'owl-eyes' */}
      <circle cx="11" cy="16" r="4" fill="#FFFFFF" />
      <circle cx="21" cy="16" r="4" fill="#FFFFFF" />
      <circle cx="11" cy="16" r="1.6" fill="#0F2C2A" />
      <circle cx="21" cy="16" r="1.6" fill="#0F2C2A" />
    </g>
  );
}

export function BrandLogo({ id, x, y, size = 32 }: {
  id: BrandId;
  x: number;
  y: number;
  size?: number;
}) {
  const half = size / 2;
  // Render het brand-SVG in een groep gecentreerd op (x, y).
  // De source-SVGs zijn 32x32 viewBox; we schalen via transform
  // zodat ze de gewenste 'size' krijgen.
  const scale = size / 32;
  const map: Record<BrandId, () => React.JSX.Element> = {
    google: GoogleLogo,
    chatgpt: ChatgptLogo,
    claude: ClaudeLogo,
    gemini: GeminiLogo,
    opentable: OpentableLogo,
    maps: MapsLogo,
    thefork: TheforkLogo,
    tripadvisor: TripadvisorLogo,
  };
  const Logo = map[id];
  return (
    <g transform={`translate(${x - half}, ${y - half}) scale(${scale})`}>
      <Logo />
    </g>
  );
}

export type { BrandId };
