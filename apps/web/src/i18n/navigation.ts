import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-bewuste vervangers voor next/link + next/navigation. Wie hiervandaan
// importeert (i.p.v. uit "next/link") houdt automatisch de actieve taal vast:
// een <Link href="/pricing"> op een /en-pagina linkt naar /en/pricing.
//
// Migratie gaat per groep (zie BACKLOG i18n-fasering): bestanden die nog uit
// "next/link" importeren blijven werken — op de NL-default (geen prefix) is er
// geen verschil; alleen op /en zou de taal anders wegvallen.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
