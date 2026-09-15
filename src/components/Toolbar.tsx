import { Eye, RefreshCw } from 'lucide-react'
import type { Unit } from '../lib/units'
import type { ViewName } from './Viewer3D'

interface ToolbarProps {
  mode: '2d' | '3d'
  onModeChange: (mode: '2d' | '3d') => void
  unit: Unit
  onUnitChange: (unit: Unit) => void
  onReset: () => void
  onView: (view: ViewName) => void
  /** Rings drawn semi-transparent in 3D, so texture depth and inner rings show through. */
  seeThrough: boolean
  onSeeThroughChange: (on: boolean) => void
}

const CUBE_FACES: { view: ViewName; label: string; points: string }[] = [
  { view: 'front', label: 'Front', points: '3,7 13,7 13,17 3,17' },
  { view: 'back', label: 'Back', points: '7,3 17,3 17,13 7,13' },
  { view: 'top', label: 'Top', points: '3,7 7,3 17,3 13,7' },
  { view: 'bottom', label: 'Bottom', points: '3,17 7,13 17,13 13,17' },
  { view: 'left', label: 'Left', points: '3,7 7,3 7,13 3,17' },
  { view: 'right', label: 'Right', points: '13,7 17,3 17,13 13,17' },
]

export function Toolbar({
  mode,
  onModeChange,
  unit,
  onUnitChange,
  onReset,
  onView,
  seeThrough,
  onSeeThroughChange,
}: ToolbarProps) {
  const in3d = mode === '3d'
  return (
    <div className="absolute bottom-5 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full bg-panel px-3 py-1.5 text-white shadow-lg backdrop-blur-sm">
      <ToolButton label="Reset view" onClick={onReset} disabled={!in3d}>
        <RefreshCw size={18} />
      </ToolButton>
      <Divider />
      <Segmented options={['3d', '2d'] as const} value={mode} onChange={onModeChange} uppercase />
      <Divider />
      {CUBE_FACES.map((f) => (
        <ToolButton key={f.view} label={`${f.label} view`} onClick={() => onView(f.view)} disabled={!in3d}>
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.2">
            <polygon points={f.points} fill="currentColor" fillOpacity="0.55" stroke="none" />
            <rect x="3" y="7" width="10" height="10" />
            <polyline points="3,7 7,3 17,3 17,13 13,17" />
            <line x1="13" y1="7" x2="17" y2="3" />
            <polyline points="7,3 7,13 3,17" strokeOpacity="0.45" />
            <line x1="7" y1="13" x2="17" y2="13" strokeOpacity="0.45" />
          </svg>
        </ToolButton>
      ))}
      <Divider />
      <button
        role="switch"
        aria-checked={seeThrough}
        title="See-through view: make the rings transparent to see texture depth"
        onClick={() => onSeeThroughChange(!seeThrough)}
        disabled={!in3d}
        className="mx-1 flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold transition hover:bg-white/15 disabled:pointer-events-none disabled:opacity-35"
      >
        <Eye size={16} />
        <span className="whitespace-nowrap">See-through</span>
        <span
          className={`relative h-4 w-7 rounded-full transition ${seeThrough ? 'bg-white' : 'bg-black/30'}`}
        >
          <span
            className={`absolute top-0.5 size-3 rounded-full transition-all ${
              seeThrough ? 'left-3.5 bg-neutral-700' : 'left-0.5 bg-white/80'
            }`}
          />
        </span>
      </button>
      <Divider />
      <Segmented options={['mm', 'in'] as const} value={unit} onChange={onUnitChange} title="Units" />
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  uppercase,
  title,
}: {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  uppercase?: boolean
  title?: string
}) {
  return (
    <div title={title} className="mx-1 flex shrink-0 rounded-full bg-black/20 p-0.5 text-xs font-semibold">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`rounded-full px-2.5 py-1 transition ${uppercase ? 'uppercase' : ''} ${
            value === o ? 'bg-white text-neutral-700' : 'text-white/80 hover:text-white'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 shrink-0 place-items-center rounded-full transition hover:bg-white/15 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}

const Divider = () => <span className="mx-1 h-6 w-px shrink-0 bg-white/30" />
