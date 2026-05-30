"use client";

// =============================================================================
// /contact, publiek demo-aanvraag / contactformulier
// =============================================================================
// Waar alle "Vraag een demo" + "Plan een gratis kennismaking"-knoppen op de
// site naartoe linken. Bij verzenden POST't dit naar het publieke backend-
// endpoint (POST /public/contact), dat de aanvraag mailt naar
// info@get-filly.com met de bezoeker als reply-to.
//
// Geen auth: dit is een lead vóór er een account bestaat. Navbar + footer
// komen automatisch via de root-layout.
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { submitContactForm } from "@/lib/api";
import { COMPANY } from "@/config/company";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot: verborgen veld dat een echte bezoeker nooit invult. Bots
  // vullen 't vaak wel → backend slikt zulke inzendingen stil.
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await submitContactForm({
        name,
        restaurant,
        email,
        phone,
        message,
        honeypot,
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Versturen mislukt. Probeer het later opnieuw.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="login-section">
      <div className="login-box" style={{ maxWidth: 520 }}>
        {sent ? (
          // Bevestiging na succesvolle verzending, vervangt het formulier.
          <>
            <div className="login-title">Bedankt voor je aanvraag!</div>
            <p className="login-sub">
              We hebben je bericht ontvangen en nemen zo snel mogelijk contact
              met je op om een kennismaking in te plannen.
            </p>
            <Link
              href="/"
              className="login-btn"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Terug naar home
            </Link>
          </>
        ) : (
          <>
            <div className="login-title">Vraag een demo aan</div>
            <p className="login-sub">
              Laat je gegevens achter, dan plannen we een vrijblijvende
              kennismaking in.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Naam</label>
                <input
                  className="form-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Voor- en achternaam"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Restaurant</label>
                <input
                  className="form-input"
                  type="text"
                  value={restaurant}
                  onChange={(e) => setRestaurant(e.target.value)}
                  placeholder="Naam van je zaak"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">E-mailadres</label>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="naam@restaurant.nl"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Telefoonnummer{" "}
                  <span style={{ color: "var(--text-light)", fontWeight: 400 }}>
                    (optioneel)
                  </span>
                </label>
                <input
                  className="form-input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="06 12345678"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Bericht</label>
                <textarea
                  className="form-input"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Waar kunnen we je mee helpen?"
                  required
                  rows={4}
                  style={{
                    resize: "vertical",
                    minHeight: 110,
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Honeypot, off-screen + onzichtbaar voor screenreaders en
                  autofill. Echte gebruikers zien dit niet. */}
              <div
                style={{ position: "absolute", left: "-9999px" }}
                aria-hidden="true"
              >
                <label>
                  Laat dit veld leeg
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </label>
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button className="login-btn" type="submit" disabled={loading}>
                {loading ? "Versturen..." : "Verstuur aanvraag"}
              </button>

              <div className="auth-switch">
                Liever direct mailen?{" "}
                <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
