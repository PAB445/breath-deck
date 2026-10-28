import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-sage text-on-accent hover:brightness-110 shadow-[0_8px_24px_-12px_var(--sage)]',
  secondary: 'bg-raised text-fg hover:bg-[color-mix(in_srgb,var(--raised),var(--fg)_6%)] border border-line',
  ghost: 'text-soft hover:text-fg hover:bg-raised',
  danger: 'text-clay hover:bg-clay-tint',
}
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-2xl',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center font-semibold whitespace-nowrap transition-all select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    />
  )
}

export function IconButton({
  label,
  className,
  size = 40,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: number }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...p}
      style={{ width: size, height: size }}
      className={cx(
        'inline-grid shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-raised text-fg transition-all hover:border-[color-mix(in_srgb,var(--fg),transparent_70%)] active:scale-95 disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    />
  )
}

export function Card({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-3xl border border-line bg-panel p-4 px-5 shadow-[var(--shadow)]', className)} aria-label={title}>
      {(title || aside) && (
        <div className="mb-3 flex h-6 items-center justify-between gap-3">
          {title && <h2 className="text-[13px] font-semibold tracking-wide text-soft">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  size = 'md',
}: {
  value: T | null
  options: { value: T; label: ReactNode; hint?: string; disabled?: boolean }[]
  onChange: (v: T) => void
  label: string
  className?: string
  size?: 'md' | 'lg'
}) {
  return (
    <div role="group" aria-label={label} className={cx('flex gap-1 rounded-2xl border border-line bg-bg/40 p-1', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            title={o.hint}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex-1 cursor-pointer rounded-xl px-3 font-semibold transition-all disabled:cursor-default disabled:opacity-40',
              size === 'lg' ? 'h-14 text-base' : 'h-9 text-[13px]',
              on ? 'bg-raised text-fg shadow-[0_1px_2px_rgba(0,0,0,.2)] ring-1 ring-line' : 'text-soft hover:text-fg',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Slider({ min, max, value, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { min: number; max: number; value: number }) {
  const fill = ((value - min) / (max - min)) * 100
  return <input type="range" min={min} max={max} value={value} {...p} className={className} style={{ ['--fill' as string]: `${fill}%` }} />
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx('relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors', on ? 'bg-sage' : 'bg-line')}
    >
      <span className={cx('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-panel shadow transition-transform', on && 'translate-x-4')} />
    </button>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'sage' | 'clay'; children: ReactNode }) {
  const t = tone === 'sage' ? 'bg-sage-tint text-sage' : tone === 'clay' ? 'bg-clay-tint text-clay' : 'bg-raised text-soft'
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', t)}>{children}</span>
}

export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  side = false,
  width = 'max-w-xl',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  side?: boolean
  width?: string
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className={cx('fade fixed inset-0 z-40 flex bg-black/55 backdrop-blur-[2px]', side ? 'justify-end' : 'items-center justify-center p-4')} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'flex w-full flex-col border-line bg-panel shadow-2xl',
          width,
          side ? 'slide h-full border-l' : 'rise max-h-[92vh] rounded-3xl border',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div>
            <h2 className="font-serif text-[32px] leading-none">{title}</h2>
            {subtitle && <p className="mt-2 text-sm text-soft">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} size={36}>
            <I.x />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  )
}

const svg = (d: ReactNode, size = 18) =>
  function Icon({ s = size }: { s?: number }) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {d}
      </svg>
    )
  }

export const I = {
  play: svg(<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />),
  pause: svg(<><rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" /></>),
  stop: svg(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />),
  minus: svg(<path d="M5 12h14" />),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  x: svg(<path d="M6 6l12 12M18 6L6 18" />),
  check: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  speaker: svg(<><rect x="6" y="3" width="12" height="18" rx="3" /><circle cx="12" cy="14" r="3" /><circle cx="12" cy="7.5" r=".8" fill="currentColor" /></>),
  volume: svg(<><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" /><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /></>),
  muted: svg(<><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>),
  library: svg(<><path d="M4 18V9M8 18V5M12 18v-7M16 18V7M20 18v-4" /></>),
  mic: svg(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" /></>),
  upload: svg(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" /></>),
  swap: svg(<><path d="M7 4L4 7l3 3M4 7h13" /><path d="M17 20l3-3-3-3M20 17H7" /></>),
  sun: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></>),
  moon: svg(<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />),
  auto: svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor" /></>),
  expand: svg(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />),
  wave: svg(<path d="M3 12h2l2-5 3 10 3-14 3 12 2-3h3" />),
  info: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></>),
  bookmark: svg(<path d="M6 4h12v16l-6-4-6 4z" />),
  arrow: svg(<path d="M5 12h14M13 6l6 6-6 6" />),
  back: svg(<path d="M19 12H5M11 6l-6 6 6 6" />),
  redo: svg(<><path d="M4 12a8 8 0 1 0 2.5-5.8" /><path d="M4 4v5h5" /></>),
  link: svg(<><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>),
  trash: svg(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
}
