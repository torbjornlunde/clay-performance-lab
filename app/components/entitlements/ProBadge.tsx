export function ProBadge({ label = "Pro feature" }: { label?: string }) {
  return <span className="proBadge" aria-label={label}>{label}</span>;
}
