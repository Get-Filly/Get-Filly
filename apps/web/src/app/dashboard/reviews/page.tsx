import { redirect } from "next/navigation";

/**
 * Permanente redirect van de oude /dashboard/reviews-route naar de
 * nieuwe Google Business-hub.
 *
 * Per 2026-05-05 is "Reviews" hernoemd naar "Google Business" en is
 * de pagina zelf verhuisd naar /dashboard/google-business/reviews.
 * Bestaande bookmarks, mail-links en audit-log-entries blijven werken
 * via deze stub.
 *
 * NB: dit is een server-component (geen "use client") zodat de redirect
 * server-side gebeurt vóór de pagina-render — geen flicker bij de
 * gebruiker en zoekmachines volgen de 308 keurig.
 */
export default function ReviewsRedirectPage() {
  redirect("/dashboard/google-business/reviews");
}
