import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";

export function LoginPage({ onBack }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/accept-invite` },
    });
    if (signInError) {
      setError(signInError.message);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1>Sign in</h1>
            </div>
            <p>Sign in to access shared projects.</p>
          </div>
        </div>
        {onBack ? (
          <button className="button secondary" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to Projects
          </button>
        ) : null}
      </header>

      <main className="dashboard-main">
        <section className="dashboard-panel">
          {status === "sent" ? (
            <p>Check <strong>{email}</strong> for a sign-in link.</p>
          ) : (
            <form className="project-detail-form" onSubmit={handleSubmit}>
              <label className="stacked-label">
                Email
                <input
                  autoFocus
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                />
              </label>
              {error ? <p className="status fail mini">{error}</p> : null}
              <div className="dialog-actions">
                <button type="submit" className="button primary" disabled={status === "sending" || !email.trim()}>
                  {status === "sending" ? "Sending link..." : "Send sign-in link"}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

export function InviteAcceptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("saving");
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setStatus("idle");
      return;
    }
    navigate("/projects");
  }

  const projectId = searchParams.get("invited_to_project_id");

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1>Accept invite</h1>
            </div>
            <p>Set a password to finish joining {projectId ? "the shared project" : "your account"}.</p>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-panel">
          <form className="project-detail-form" onSubmit={handleSubmit}>
            <label className="stacked-label">
              New Password
              <input
                autoFocus
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="status fail mini">{error}</p> : null}
            <div className="dialog-actions">
              <button type="submit" className="button primary" disabled={status === "saving" || password.length < 8}>
                {status === "saving" ? "Saving..." : "Set password and continue"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
