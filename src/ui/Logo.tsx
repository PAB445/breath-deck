export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="BreathDeck logo">
      <circle cx="32" cy="28" r="17" fill="none" stroke="var(--sage)" strokeWidth="2.5" />
      <circle cx="32" cy="28" r="8" fill="var(--fg)" />
      <rect x="14" y="51" width="36" height="3" rx="1.5" fill="var(--clay)" />
    </svg>
  )
}
