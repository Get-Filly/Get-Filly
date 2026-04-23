"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../lib/supabase-browser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(nextPath);
    router.refresh();
  };

  return (
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
          placeholder="••••••••"
          required
        />
        <a className="forgot-link">Wachtwoord vergeten?</a>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <button className="login-btn" type="submit" disabled={loading}>
        {loading ? "Bezig met inloggen..." : "Inloggen"}
      </button>

      <div className="auth-switch">
        Nog geen account?{" "}
        <Link href="/signup">Maak er een aan</Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <section className="login-section">
      <div className="login-box">
        <div className="login-title">Welkom terug</div>
        <p className="login-sub">Log in op je Get-Filly dashboard</p>
        <Suspense fallback={<div>Laden...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </section>
  );
}
