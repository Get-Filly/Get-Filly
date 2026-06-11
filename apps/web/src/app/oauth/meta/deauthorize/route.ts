import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";

/**
 * ============================================================
 * POST /oauth/meta/deauthorize, Meta deauthorize-callback
 * ============================================================
 *
 * Meta POST't hierheen (form-encoded, met `signed_request`) wanneer
 * een gebruiker de app loskoppelt vanuit z'n Facebook-instellingen.
 *
 * Deze web-route doet zelf NIETS met het secret/DB: ze stuurt de
 * signed_request door naar de Nest-API, die de handtekening verifieert
 * (App Secret) en de koppeling verwijdert (service-role). Zo blijft het
 * secret op één plek.
 *
 * We antwoorden Meta met 200 zodra we de taak hebben doorgezet; fouten
 * loggen we (Meta hoeft niet eindeloos te retryen voor een loskoppeling).
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export async function POST(request: NextRequest) {
  let signedRequest: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("signed_request");
    signedRequest = typeof value === "string" ? value : null;
  } catch {
    signedRequest = null;
  }

  if (!signedRequest) {
    return NextResponse.json(
      { error: "signed_request ontbreekt" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${API_URL}/integrations/meta/deauthorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signed_request: signedRequest }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error(`[meta-deauthorize] API faalde (${res.status}): ${body}`);
    }
  } catch (err) {
    logger.error("[meta-deauthorize] forward faalde:", err);
  }

  return NextResponse.json({ ok: true });
}

// Meta (of een browser/health-check) prikt soms met GET om te zien of
// het endpoint leeft. We geven dan 200 i.p.v. 405, zodat de
// opslaan-validatie in Meta de URL accepteert. De echte verwerking
// (signed_request) gebeurt via POST.
export function GET() {
  return NextResponse.json({ ok: true });
}
