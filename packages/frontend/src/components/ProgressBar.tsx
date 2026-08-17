export function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div className="progress">
      <div
        className="progress__track"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "進捗"}
      >
        <div className="progress__bar" style={{ width: `${clamped}%` }} />
      </div>
      <span className="progress__value">{clamped}%</span>
    </div>
  );
}
