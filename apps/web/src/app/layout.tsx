// Root-layout-passthrough. De échte <html>/<body> + providers + navbar/footer
// staan in app/[locale]/layout.tsx (dat is de root-layout voor alle
// gelokaliseerde routes). Deze dunne root bestaat alleen zodat er een
// root-not-found (app/not-found.tsx) kan zijn voor niet-gelokaliseerde
// requests (paden die de middleware overslaat). Patroon volgens next-intl.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
