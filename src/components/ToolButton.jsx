export default function ToolButton({ active, title, onClick, icon }) {
  return (
    <button className={`icon-button ${active ? "active" : ""}`} onClick={onClick} title={title}>
      {icon}
    </button>
  );
}
