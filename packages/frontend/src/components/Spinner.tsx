export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spinner__circle" aria-hidden="true" />
      {label !== undefined && <span className="spinner__label">{label}</span>}
    </div>
  );
}
