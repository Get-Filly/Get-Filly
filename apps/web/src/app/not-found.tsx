// Root-not-found: vangt requests buiten het [locale]-segment (paden die de
// middleware overslaat, bv. een niet-bestaande /auth/* of /oauth/*). Er is
// hier geen locale-context, dus deze pagina rendert z'n eigen <html> en is
// bewust taal-neutraal (NL + EN). De gelokaliseerde, on-brand 404 voor
// gewone paden zit in app/[locale]/not-found.tsx.
export default function RootNotFound() {
  return (
    <html lang="nl">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#FAF7F1",
          color: "#18181B",
          textAlign: "center",
          padding: "96px 24px",
          margin: 0,
        }}
      >
        <h1 style={{ fontSize: 56, margin: "0 0 8px" }}>404</h1>
        <p style={{ color: "#52525B", margin: "0 0 24px" }}>
          Pagina niet gevonden &middot; Page not found
        </p>
        <a href="/" style={{ color: "#1F4A2D", fontWeight: 600 }}>
          Home
        </a>
      </body>
    </html>
  );
}
