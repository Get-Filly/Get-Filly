export default function LoginPage() {
  return (
    <section className="login-section">
      <div className="login-box">
        <div className="login-title">Welkom terug</div>
        <p className="login-sub">Log in op je Get-Filly dashboard</p>
        <div className="form-group">
          <label className="form-label">E-mailadres</label>
          <input
            className="form-input"
            type="email"
            placeholder="naam@restaurant.nl"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Wachtwoord</label>
          <input
            className="form-input"
            type="password"
            placeholder="••••••••"
          />
          <a className="forgot-link">Wachtwoord vergeten?</a>
        </div>
        <button className="login-btn">Inloggen</button>
      </div>
    </section>
  );
}
