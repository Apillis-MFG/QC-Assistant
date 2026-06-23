import { X } from "lucide-react";

export default function AutoBalloonReview({ busy, open, candidates, onRemove, onCancel, onCommit }) {
  if (busy) {
    return <p className="muted compact-note">Reviewing selected area...</p>;
  }

  if (!open && !candidates.length) {
    return <p className="muted">Choose the review tool, then drag around drawing numbers to preview balloon candidates.</p>;
  }

  return (
    <div className="candidate-review">
      <div className="candidate-list">
        {candidates.map((candidate) => (
          <div className="candidate-row" key={candidate.id}>
            <span className="candidate-number">{candidate.balloonNo}</span>
            <span className="candidate-label" title={candidate.label}>{candidate.label}</span>
            <button className="icon-button" onClick={() => onRemove(candidate.id)} title={`Remove candidate ${candidate.balloonNo}`}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="candidate-actions">
        <button className="small-button" onClick={onCancel}>Cancel</button>
        <button className="small-button primary-compact" disabled={!candidates.length} onClick={onCommit}>
          Add balloons
        </button>
      </div>
    </div>
  );
}
