import { NextResponse, type NextRequest } from "next/server";

/**
 * ============================================================
 * POST /oauth/meta/data-deletion, Meta data-deletion-callback
 * ============================================================
 *
 * Meta POST't hierheen (form-encoded, met `signed_request`) wanneer
 * een gebruiker via Facebook expliciet verwijdering van z'n data
 * aanvraagt (AVG/GDPR-verplicht).
 *
 * We sturen de signed_request door naar de Nest-API, die de
 * handtekening verifieert, de data verwijdert en het door Meta
 * vereiste antwoord teruggeeft:
 *
 *   { "url": "<status-pagina>", "confirmation_code": "<code>" }
 *
 * Die JSON geven we 1-op-1 door aan Meta. Lukt de verwerking niet,
 * dan geven we 503 zodat Meta het later opnieuw probeert.
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
    const res = await fetch(`${API_URL}/integrations/meta/data-deletion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signed_request: signedRequest }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[meta-data-deletion] API faalde (${res.status}): ${body}`);
      return NextResponse.json({ error: "verwerking mislukt" }, { status: 503 });
    }
    // { url, confirmation_code } — exact wat Meta verwacht.
    const data = (await res.json()) as {
      url: string;
      confirmation_code: string;
    };
    return NextResponse.json(data);
  } catch (err) {
    console.error("[meta-data-deletion] forward faalde:", err);
    return NextResponse.json({ error: "verwerking mislukt" }, { status: 503 });
  }
}
