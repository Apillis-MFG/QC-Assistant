import { useMemo } from "react";
import { Circle, Trash2 } from "lucide-react";
import { getLimits, getStatus } from "../lib/exporters.js";
import { types, methods } from "../lib/constants.js";

export default function CharacteristicTable({
  characteristics,
  selectedId,
  sampleCount,
  onSelect,
  onChange,
  onReassign,
  onSampleChange,
  onDelete,
}) {
  const sorted = useMemo(
    () => characteristics.slice().sort((a, b) => a.balloonNo - b.balloonNo),
    [characteristics],
  );

  if (!characteristics.length) {
    return (
      <div className="table-empty">
        <Circle size={26} />
        <p>No characteristics yet. Add a balloon on the drawing or create a row manually.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>ID #</th>
            <th>Type</th>
            <th>Unit</th>
            <th>Nominal / Requirement</th>
            <th>Tolerance</th>
            <th>USL</th>
            <th>LSL</th>
            {Array.from({ length: sampleCount }, (_, index) => <th key={index}>#{index + 1}</th>)}
            <th>Method</th>
            <th>Status</th>
            <th aria-label="Row actions"></th>
          </tr>
        </thead>
        <tbody>
          {sorted
            .map((item) => {
              const { usl, lsl } = getLimits(item);
              const status = getStatus(item, sampleCount);
              return (
                <tr
                  key={item.id}
                  className={selectedId === item.id ? "row-selected" : ""}
                  onClick={() => onSelect(item.id)}
                >
                  <td className="id-cell">
                    <input
                      type="number"
                      min="1"
                      value={item.balloonNo}
                      aria-label={`Reassign balloon ${item.balloonNo}`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onReassign(item.id, event.target.value)}
                    />
                  </td>
                  <td>
                    <select value={item.type} onChange={(event) => onChange(item.id, { type: event.target.value })}>
                      {types.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </td>
                  <td><input value={item.unit} onChange={(event) => onChange(item.id, { unit: event.target.value })} /></td>
                  <td><input value={item.nominal} onChange={(event) => onChange(item.id, { nominal: event.target.value })} /></td>
                  <td><input value={item.tolerance} onChange={(event) => onChange(item.id, { tolerance: event.target.value })} /></td>
                  <td className="readonly">{usl}</td>
                  <td className="readonly">{lsl}</td>
                  {Array.from({ length: sampleCount }, (_, index) => (
                    <td key={index}>
                      <input value={item.samples[index] ?? ""} onChange={(event) => onSampleChange(item.id, index, event.target.value)} />
                    </td>
                  ))}
                  <td>
                    <select value={item.method} onChange={(event) => onChange(item.id, { method: event.target.value })}>
                      {methods.map((method) => <option key={method} value={method}>{method}</option>)}
                    </select>
                  </td>
                  <td><span className={`status mini ${status.toLowerCase()}`}>{status}</span></td>
                  <td className="row-actions">
                    <button
                      className="icon-button danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(item.id);
                      }}
                      title={`Delete balloon ${item.balloonNo}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
