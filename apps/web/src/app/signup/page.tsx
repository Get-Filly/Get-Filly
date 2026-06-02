import { redirect } from "next/navigation";

// Self-service registratie is per 2026-06-02 uitgeschakeld. Nieuwe accounts
// worden uitsluitend door Get-Filly aangemaakt (invite-only via Supabase),
// zodat concurrenten zich niet zelf kunnen registreren en ongezien in de
// app kunnen rondkijken. De ECHTE blokkade zit in Supabase ("Allow new
// users to sign up" = uit) — dat dicht ook de directe API-route met de
// anon-key. Deze redirect zorgt enkel dat de oude /signup-URL geen dode of
// verwarrende pagina meer toont en bezoekers naar de demo-aanvraag stuurt.
export default function SignupPage() {
  redirect("/contact");
}
