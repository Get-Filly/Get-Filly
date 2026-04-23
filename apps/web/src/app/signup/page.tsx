"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../lib/supabase-browser";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setSuccess(
        "Check je e-mail voor een bevestigingslink. Na bevestiging kun je inloggen.",
      );
      setLoading(false);
    }
  };

  return (
    <section className="login-section">
      <div className="login-box">
        <div className="login-title">Account aanmaken</div>
        <p className="login-sub">Start met Get-Filly</p>

        <form onSubmit={handleSubmit}>
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
            <label className="form-label">Wachtwoord</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 tekens"
              minLength={6}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Bezig..." : "Account aanmaken"}
          </button>

          <div className="auth-switch">
            Al een account? <Link href="/login">Inloggen</Link>
          </div>
        </form>
      </div>
    </section>
  );
}
