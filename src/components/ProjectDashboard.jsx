import { FilePlus2, HelpCircle, Plus } from "lucide-react";
import { APP_VERSION } from "../lib/constants.js";
import { formatBytes, formatDate } from "../lib/utils.js";
import HelpDialog from "./HelpDialog.jsx";

export default function ProjectDashboard({
  projectsReady,
  projects,
  projectDialog,
  onNewProject,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onDialogChange,
  onDialogSubmit,
  onDialogClose,
  onOpenHelp,
  helpOpen,
  onCloseHelp,
}) {
  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1>QC Assistant</h1>
              <span className="version-badge">{APP_VERSION}</span>
              <button className="icon-button brand-help" onClick={onOpenHelp} title="Help and shortcuts" aria-label="Help and shortcuts">
                <HelpCircle size={17} />
              </button>
            </div>
            <p>Local inspection projects</p>
          </div>
        </div>
        <button className="button primary" onClick={onNewProject}>
          <Plus size={16} />
          New Project
        </button>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-panel">
          <div className="dashboard-title">
            <div>
              <h2>Projects</h2>
              <p>{projects.length} local projects</p>
            </div>
          </div>

          {!projectsReady ? (
            <div className="dashboard-empty">
              <FilePlus2 size={34} />
              <p>Loading projects...</p>
            </div>
          ) : projects.length ? (
            <div className="project-list">
              {projects.map((project) => (
                <article key={project.id} className="project-card">
                  <div className="project-card-main">
                    <div>
                      <h3>{project.name}</h3>
                      <p>
                        {project.drawingCount} drawings · {formatBytes(project.totalBytes)} · Updated {formatDate(project.updatedAt)}
                      </p>
                    </div>
                    <strong className={`status ${project.status.toLowerCase()}`}>{project.status}</strong>
                  </div>
                  <div className="project-card-actions">
                    <button className="button primary" onClick={() => onOpenProject(project.id)}>Open</button>
                    <button className="small-button project-action add" onClick={() => onRenameProject(project)}>Edit Name</button>
                    <button className="small-button project-action delete-project" onClick={() => onDeleteProject(project)}>Delete Project</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <FilePlus2 size={38} />
              <h2>No projects yet</h2>
              <button className="button primary" onClick={onNewProject}>
                <Plus size={16} />
                New Project
              </button>
            </div>
          )}
        </section>
      </main>

      {projectDialog.open ? (
        <div className="dialog-backdrop" role="presentation">
          <form className="project-dialog" onSubmit={onDialogSubmit}>
            <div className="dialog-title">
              <h2>{projectDialog.mode === "create" ? "New Project" : "Edit Project Name"}</h2>
              <button type="button" className="icon-button" onClick={onDialogClose} aria-label="Close project dialog">×</button>
            </div>
            <label className="stacked-label">
              Project Name
              <input
                autoFocus
                value={projectDialog.name}
                onChange={(event) => onDialogChange(event.target.value)}
                placeholder="Example: BS-Extrusion"
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={onDialogClose}>Cancel</button>
              <button type="submit" className="button primary" disabled={!projectDialog.name.trim()}>
                {projectDialog.mode === "create" ? "Create Project" : "Save Name"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <HelpDialog open={helpOpen} onClose={onCloseHelp} />
    </div>
  );
}
