import { useState } from "react";
import "./LoginPage.css";

const API_URL = "https://spider-bot-arzw.onrender.com";

// Landscape background (desktop / tablet)
const SPIDERMAN_IMAGE = "/spiderman.png";
// Portrait background (mobile phones)
const SPIDERMAN_IMAGE_PORTRAIT = "/spiderman-portrait.png";

export default function LoginPage({ onAuthSuccess }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();

    if (
      !trimmedEmail ||
      !password ||
      (mode === "signup" && !trimmedUsername)
    ) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const endpoint =
        mode === "login" ? "/auth/login" : "/auth/signup";

      const body =
        mode === "login"
          ? { email: trimmedEmail, password }
          : {
              email: trimmedEmail,
              username: trimmedUsername,
              password,
            };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("Invalid server response.");
      }

      if (!response.ok) {
        throw new Error(data.detail || "Authentication failed.");
      }

      if (!data.token) {
        throw new Error("No token returned by server.");
      }

      onAuthSuccess(data.token, data.user);
    } catch (err) {
      setError(
        err.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* Full-page Spider-Man background */}
      <div className="sm-background" aria-hidden="true">
        {/* Landscape image — desktop / tablet */}
        <img
          src={SPIDERMAN_IMAGE}
          alt=""
          className="sm-background-image sm-background-landscape"
          draggable="false"
        />
        {/* Portrait image — mobile phones */}
        <img
          src={SPIDERMAN_IMAGE_PORTRAIT}
          alt=""
          className="sm-background-image sm-background-portrait"
          draggable="false"
        />
        <div className="sm-background-overlay" />
      </div>

      {/* Login card */}
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-text">Spider Bot</span>
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
            disabled={loading}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => switchMode("signup")}
            disabled={loading}
          >
            Sign up
          </button>
          <span
            className={`login-tab-indicator ${
              mode === "signup" ? "right" : "left"
            }`}
          />
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-field">
            <span className="login-label-text">Email</span>
            <input
              type="email"
              autoComplete="off"
              name="spiderbot-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="you@example.com"
              required
            />
          </label>

          <div
            className={`login-field-extra ${
              mode === "signup" ? "expanded" : ""
            }`}
          >
            <label className="login-field">
              <span className="login-label-text">Username</span>
              <input
                type="text"
                autoComplete="off"
                name="spiderbot-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading || mode !== "signup"}
                placeholder="spiderfan"
                tabIndex={mode === "signup" ? 0 : -1}
              />
            </label>
          </div>

          <label className="login-field">
            <span className="login-label-text">Password</span>
            <input
              type="password"
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              name="spiderbot-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••"
              required
            />
          </label>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            <span className="login-submit-shine" aria-hidden="true" />
            <span className="login-submit-label">
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Log in"
                  : "Create account"}
            </span>
          </button>
        </form>

        <p className="login-footer-tagline">
          With great power comes great responsibility.
        </p>
      </div>
    </div>
  );
}