import { notFound } from "next/navigation";

// Catch-all binnen het [locale]-segment: elk onbekend pad onder een taal
// (bv. /en/bestaat-niet of /tikfout) belandt hier en triggert notFound(),
// zodat de GELOKALISEERDE not-found.tsx rendert i.p.v. de kale Next-404.
// Zonder deze route toont Next bij een totaal onbekend pad de standaard-404
// (de [locale]/not-found.tsx wordt anders alleen bij een expliciete
// notFound()-call vanuit een bestaande route gebruikt).
export default function CatchAllNotFound() {
  notFound();
}
