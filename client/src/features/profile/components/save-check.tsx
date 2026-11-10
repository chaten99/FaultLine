export function SaveCheck({ label }: { label: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="pf-pop inline-flex items-center gap-2 text-sm font-medium text-emerald-700"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
        <circle
          className="pf-check-circle"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          className="pf-check-mark"
          d="M7.5 12.5l3 3 6-6.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </span>
  );
}
