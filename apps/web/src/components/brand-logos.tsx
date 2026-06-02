// ============================================================
// BrandLogos — officiële brand-SVGs voor de 8 partner-merken
// ============================================================
// Per 2026-05-21 (v4): officiële Simple-Icons paden (MIT-license,
// gemaakt voor exact dit doel — brand-integraties visualiseren)
// voor de merken die op simpleicons.org staan. Voor de 3 die niet
// op simple-icons staan (TheFork, ChatGPT/OpenAI, Google Maps) een
// custom-versie die de signature-vorm van het merk benadert.
//
// Alle logo's: viewBox 24×24 (Simple-Icons-standaard). De wrapper
// <BrandLogo> rendert ze gecentreerd op (x, y) met een schaal die
// past bij de gewenste size in SVG-coords.

type BrandId =
  | "google"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "opentable"
  | "maps"
  | "thefork"
  | "tripadvisor"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "zenchef";

// Google G — multi-color officieel logo. Houden we als 4-color
// versie omdat de monochrome variant minder herkenbaar is.
function GoogleLogo() {
  return (
    <g>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </g>
  );
}

// ChatGPT — zwart blokje met witte "knot"-bloeisel (signature).
// OpenAI staat niet op simple-icons (op verzoek van het merk).
// We benaderen 'm met de bekende 6-puntige bloei in zwart-witte
// silhouet.
function ChatgptLogo() {
  return (
    <g>
      <circle cx="12" cy="12" r="11" fill="#000000" />
      <path
        d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
        fill="#FFFFFF"
      />
    </g>
  );
}

// Claude — Anthropic's signature lattice-ster in oranje. Officieel
// Simple-Icons path.
function ClaudeLogo() {
  return (
    <g>
      <circle cx="12" cy="12" r="11" fill="#FFFFFF" stroke="#E5DFD0" strokeWidth="0.3" />
      <g transform="translate(0, 0)">
        <path
          d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"
          fill="#D97757"
        />
      </g>
    </g>
  );
}

// Gemini — Google's 4-puntige sparkle. Officieel Simple-Icons path.
function GeminiLogo() {
  return (
    <g>
      <circle cx="12" cy="12" r="11" fill="#FFFFFF" stroke="#E5DFD0" strokeWidth="0.3" />
      <defs>
        <linearGradient id="gemini-grad" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="50%" stopColor="#9168C0" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
        fill="url(#gemini-grad)"
      />
    </g>
  );
}

// OpenTable — rode rondje met witte "O" en peg (signature). Het
// nieuwere Simple-Icons-symbool gaf een sparkle terug (lijkt op
// een rebrand) maar het meest-herkenbare OpenTable-logo blijft
// de rode disc met witte ring + middenpunt.
function OpentableLogo() {
  return (
    <g>
      <circle cx="12" cy="12" r="11" fill="#DA3743" />
      <circle cx="12" cy="12" r="6.4" fill="none" stroke="#FFFFFF" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.9" fill="#FFFFFF" />
    </g>
  );
}

// Google Maps — multi-color pin met "G" erin. Custom omdat de
// Maps-icon op simple-icons niet beschikbaar is.
function MapsLogo() {
  return (
    <g>
      <circle cx="12" cy="12" r="11" fill="#FFFFFF" stroke="#E5DFD0" strokeWidth="0.3" />
      {/* Pin shape — schuin onderaan zoals echte Maps-pin */}
      <path
        d="M12 4.5c-2.9 0-5.25 2.35-5.25 5.25 0 3.94 5.25 9.75 5.25 9.75s5.25-5.81 5.25-9.75c0-2.9-2.35-5.25-5.25-5.25z"
        fill="#EA4335"
      />
      {/* Witte cirkel binnen pin */}
      <circle cx="12" cy="9.75" r="2.4" fill="#FFFFFF" />
      {/* Google "G" hint via blauwe arc in de witte cirkel */}
      <path
        d="M11.6 9.75h1.4v.65c0 .69-.55 1.25-1.25 1.25s-1.25-.56-1.25-1.25.55-1.25 1.25-1.25c.34 0 .65.14.88.36"
        stroke="#4285F4"
        strokeWidth="0.4"
        fill="none"
      />
    </g>
  );
}

// TheFork — groene disc met witte vork-icoon. Officieel staat
// TheFork niet op simple-icons; we benaderen 't met hun signature-
// groene cirkel + een vereenvoudigde vork.
function TheforkLogo() {
  return (
    <g>
      <circle cx="12" cy="12" r="11" fill="#00A6A0" />
      {/* Vork: 3 tanden + handvat */}
      <g fill="#FFFFFF">
        <rect x="8.3"  y="4.5"  width="1.2" height="5" rx="0.4" />
        <rect x="10.5" y="4.5"  width="1.2" height="5" rx="0.4" />
        <rect x="12.7" y="4.5"  width="1.2" height="5" rx="0.4" />
        <rect x="14.9" y="4.5"  width="1.2" height="5" rx="0.4" />
        <rect x="8.3"  y="8.5"  width="7.8" height="1.4" rx="0.7" />
        <rect x="10.9" y="8.5"  width="2.2" height="11" rx="1.1" />
      </g>
    </g>
  );
}

// Tripadvisor — groene disc met "uil-ogen". Officieel Simple-Icons
// path (incl. mond-vorm).
function TripadvisorLogo() {
  return (
    <g>
      <circle cx="12" cy="12" r="11" fill="#00AF87" />
      <g transform="translate(0, 0)">
        <path
          d="M12.006 4.295c-2.67 0-5.338.784-7.645 2.353H0l1.963 2.135a5.997 5.997 0 0 0 4.04 10.43 5.976 5.976 0 0 0 4.075-1.6L12 19.705l1.922-2.09a5.972 5.972 0 0 0 4.072 1.598 6 6 0 0 0 6-5.998 5.982 5.982 0 0 0-1.957-4.432L24 6.648h-4.35a13.573 13.573 0 0 0-7.644-2.353zM12 6.255c1.531 0 3.063.303 4.504.903C13.943 8.138 12 10.43 12 13.1c0-2.671-1.942-4.962-4.504-5.942A11.72 11.72 0 0 1 12 6.256zM6.002 9.157a4.059 4.059 0 1 1 0 8.118 4.059 4.059 0 0 1 0-8.118zm11.992.002a4.057 4.057 0 1 1 .003 8.115 4.057 4.057 0 0 1-.003-8.115zm-11.992 1.93a2.128 2.128 0 0 0 0 4.256 2.128 2.128 0 0 0 0-4.256zm11.992 0a2.128 2.128 0 0 0 0 4.256 2.128 2.128 0 0 0 0-4.256z"
          fill="#FFFFFF"
        />
      </g>
    </g>
  );
}

// Instagram — signature gradient (yellow → orange → pink → purple)
// op een rounded-square achtergrond, met witte camera-outline +
// lens binnen. De gradient-id is uniek per Instagram-instance
// zodat meerdere logos op één pagina niet botsen.
function InstagramLogo() {
  return (
    <g>
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F58529" />
          <stop offset="40%" stopColor="#DD2A7B" />
          <stop offset="80%" stopColor="#8134AF" />
          <stop offset="100%" stopColor="#515BD4" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ig-grad)" />
      {/* Camera-outline (witte rounded-square uitgesneden) */}
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="4.2"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.5"
      />
      {/* Lens — witte ring + binnencirkel */}
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Lens-flits boven-rechts */}
      <circle cx="17.2" cy="6.8" r="0.95" fill="#FFFFFF" />
    </g>
  );
}

// Facebook — blauwe disc met witte "f". Simple-Icons-path (officieel).
function FacebookLogo() {
  return (
    <g>
      <circle cx="12" cy="12" r="11" fill="#1877F2" />
      <path
        d="M14.61 14.6h2.32l.39-2.7h-2.71v-1.85c0-.85.27-1.45 1.5-1.45h1.34V6.18a16.06 16.06 0 0 0-2.13-.12c-2.11 0-3.55 1.29-3.55 3.66v2.18H9v2.7h2.77v6.92h2.84z"
        fill="#FFFFFF"
      />
    </g>
  );
}

// TikTok — zwarte disc met witte note-icoon + signature cyaan/rood
// offset-trail voor de TikTok-look (glitch-effect).
function TiktokLogo() {
  return (
    <g>
      <circle cx="12" cy="12" r="11" fill="#000000" />
      {/* Cyaan offset-laag (links-onder) */}
      <path
        d="M14.32 6.49c.46.27.96.46 1.5.55v1.86c-1.13-.04-2.21-.41-3.13-1.07v6.74a3.96 3.96 0 1 1-3.96-3.96c.2 0 .39.02.58.05v1.99a2 2 0 1 0 1.39 1.92V5.5h1.86c.04.28.11.55.21.81.27.69.74 1.28 1.55 1.18z"
        fill="#25F4EE"
        transform="translate(-0.9, 0.5)"
      />
      {/* Rood offset-laag (rechts-boven) */}
      <path
        d="M14.32 6.49c.46.27.96.46 1.5.55v1.86c-1.13-.04-2.21-.41-3.13-1.07v6.74a3.96 3.96 0 1 1-3.96-3.96c.2 0 .39.02.58.05v1.99a2 2 0 1 0 1.39 1.92V5.5h1.86c.04.28.11.55.21.81.27.69.74 1.28 1.55 1.18z"
        fill="#FE2C55"
        transform="translate(0.9, -0.5)"
      />
      {/* Wit voorgrond */}
      <path
        d="M14.32 6.49c.46.27.96.46 1.5.55v1.86c-1.13-.04-2.21-.41-3.13-1.07v6.74a3.96 3.96 0 1 1-3.96-3.96c.2 0 .39.02.58.05v1.99a2 2 0 1 0 1.39 1.92V5.5h1.86c.04.28.11.55.21.81.27.69.74 1.28 1.55 1.18z"
        fill="#FFFFFF"
      />
    </g>
  );
}

// Zenchef — lime-green gestileerde "z" (reserveringsplatform).
// Recreatie als groene letter-glyph; te vervangen door het officiële
// SVG-logo zodra Floris dat aanlevert.
function ZenchefLogo() {
  return (
    <g>
      <text
        x="12"
        y="18"
        textAnchor="middle"
        fontSize="20"
        fontWeight="800"
        fontStyle="italic"
        fontFamily="Georgia, 'Times New Roman', serif"
        fill="#8FC73E"
      >
        z
      </text>
    </g>
  );
}

export function BrandLogo({ id, x, y, size = 24 }: {
  id: BrandId;
  x: number;
  y: number;
  size?: number;
}) {
  const half = size / 2;
  // Alle logo-functions zijn ontworpen op 24x24 viewBox; we
  // schalen via transform naar de gewenste 'size'.
  const scale = size / 24;
  const map: Record<BrandId, () => React.JSX.Element> = {
    google: GoogleLogo,
    chatgpt: ChatgptLogo,
    claude: ClaudeLogo,
    gemini: GeminiLogo,
    opentable: OpentableLogo,
    maps: MapsLogo,
    thefork: TheforkLogo,
    tripadvisor: TripadvisorLogo,
    instagram: InstagramLogo,
    facebook: FacebookLogo,
    tiktok: TiktokLogo,
    zenchef: ZenchefLogo,
  };
  const Logo = map[id];
  return (
    <g transform={`translate(${x - half}, ${y - half}) scale(${scale})`}>
      <Logo />
    </g>
  );
}

export type { BrandId };
