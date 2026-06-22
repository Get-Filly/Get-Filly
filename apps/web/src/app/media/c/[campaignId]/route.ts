import { type NextRequest } from "next/server";

// ============================================================
// GET /media/c/:campaignId — publieke campagne-video op het web-domein
// ============================================================
// TikTok haalt via PULL_FROM_URL de video op van het GEVERIFIEERDE domein
// (www.get-filly.com). campaign-media is een private bucket, dus we kunnen
// geen directe publieke URL geven (zoals /media/r voor restaurant-media).
// In plaats daarvan:
//   1. vraag de API om een korte signed URL voor de campagne-video,
//   2. stream de bytes door via dít domein.
// Zo ziet TikTok een get-filly.com-URL (verificatie klopt) terwijl de
// inhoud uit de private bucket komt. Geen video → 404.
//
// Niet gelokaliseerd: /media/* is uitgesloten van de i18n-middleware
// (zie middleware.ts matcher).

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;

  // 1. Signed URL bij de API opvragen (admin-kant, public endpoint).
  const metaRes = await fetch(
    `${API_URL}/media/tiktok-video/${encodeURIComponent(campaignId)}`,
    { cache: "no-store" },
  );
  if (!metaRes.ok) {
    return new Response("Video niet gevonden.", { status: 404 });
  }
  const { url } = (await metaRes.json()) as { url?: string };
  if (!url) {
    return new Response("Video niet gevonden.", { status: 404 });
  }

  // 2. De video-bytes ophalen en doorstreamen vanaf dit domein.
  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Video niet beschikbaar.", { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
      ...(upstream.headers.get("content-length")
        ? { "Content-Length": upstream.headers.get("content-length")! }
        : {}),
      // Korte cache: TikTok haalt 'm één keer op; we hoeven 'm niet lang
      // te bewaren maar een paar minuten scheelt bij retries.
      "Cache-Control": "public, max-age=300",
    },
  });
}
