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
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { submitContactForm } from "@/lib/api";
import { COMPANY } from "@/config/company";

export default function ContactPage() {
  const t = useTranslations("contact");
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
        err instanceof Error ? err.message : t("errorFallback"),
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
            <div className="login-title">{t("sentTitle")}</div>
            <p className="login-sub">{t("sentBody")}</p>
            <Link
              href="/"
              className="login-btn"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              {t("backHome")}
            </Link>
          </>
        ) : (
          <>
            <div className="login-title">{t("title")}</div>
            <p className="login-sub">{t("intro")}</p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="contact-name">{t("name")}</label>
                <input
                  id="contact-name"
                  className="form-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="contact-restaurant">{t("restaurant")}</label>
                <input
                  id="contact-restaurant"
                  className="form-input"
                  type="text"
                  value={restaurant}
                  onChange={(e) => setRestaurant(e.target.value)}
                  placeholder={t("restaurantPlaceholder")}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="contact-email">{t("email")}</label>
                <input
                  id="contact-email"
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="contact-phone">
                  {t("phone")}{" "}
                  <span style={{ color: "var(--text-light)", fontWeight: 400 }}>
                    {t("optional")}
                  </span>
                </label>
                <input
                  id="contact-phone"
                  className="form-input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("phonePlaceholder")}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="contact-message">{t("message")}</label>
                <textarea
                  id="contact-message"
                  className="form-input"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("messagePlaceholder")}
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
                  {t("honeypot")}
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
                {loading ? t("submitting") : t("submit")}
              </button>

              <div className="auth-switch">
                {t("preferMail")}{" "}
                <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
