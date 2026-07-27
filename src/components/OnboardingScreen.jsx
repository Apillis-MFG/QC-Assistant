import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import * as supabaseStore from "../lib/supabaseStore.js";

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { user, orgIds, orgsLoaded, refetchMemberships } = useAuth();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (orgsLoaded && orgIds.length) {
      navigate("/projects", { replace: true });
    }
  }, [orgsLoaded, orgIds.length, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user) return;
    setStatus("saving");
    setError("");
    try {
      await supabaseStore.createOrganization(name.trim());
      await refetchMemberships();
      navigate("/projects", { replace: true });
    } catch (submitError) {
      setError(submitError.message);
      setStatus("idle");
    }
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1>Set up your company</h1>
            </div>
            <p>Create an organization to share projects with vendors.</p>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-panel">
          <form className="project-detail-form" onSubmit={handleSubmit}>
            <label className="stacked-label">
              Company name
              <input
                autoFocus
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme Manufacturing"
              />
            </label>
            {error ? <p className="status fail mini">{error}</p> : null}
            <div className="dialog-actions">
              <button type="submit" className="button primary" disabled={status === "saving" || !name.trim()}>
                {status === "saving" ? "Creating..." : "Create organization"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
