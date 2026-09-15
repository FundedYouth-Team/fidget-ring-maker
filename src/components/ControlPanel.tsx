import { useEffect, useRef, useState } from 'react'
import { ChevronsDown, ChevronsUp, Paintbrush, Ruler } from 'lucide-react'
import {
  GRADIENTS,
  MAX_GRADIENT_ANGLE,
  PALETTE,
  colorOf,
  finishOf,
  partName,
  specsOf,
  type ColorFinish,
  type Design,
} from '../lib/design'
import { TEXTURE_DEPTHS, TEXTURES, textureDepthMm, type Texture } from '../lib/ring'
import { formatLength, type Unit } from '../lib/units'
import { Switch } from './Designer2D'

const COLOR_COUNTS = [
  { count: 1, label: 'Single' },
  { count: 2, label: 'Dual' },
  { count: 3, label: 'Tri' },
] as const

interface ControlPanelProps {
  design: Design
  onChange: (patch: Partial<Design>) => void
  unit: Unit
  mode: '2d' | '3d'
  onModeChange: (mode: '2d' | '3d') => void
  /** Ring whose colour the swatches edit, chosen in the Layers box (innermost = 0). */
  selectedLayer: number
}

export function ControlPanel({ design, onChange, unit, mode, onModeChange, selectedLayer }: ControlPanelProps) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 640px)').matches)
  const finish = finishOf(design, selectedLayer)
  // Which of the selected part's colours the swatches edit: 0 is its main (exported) colour.
  const [slot, setSlot] = useState(0)
  useEffect(() => setSlot(0), [selectedLayer])
  const activeSlot = design.advancedColor ? Math.min(slot, finish.count - 1) : 0
  const activeColor = activeSlot === 0 ? colorOf(design, selectedLayer) : finish.extras[activeSlot - 1]
  const outerSpec = specsOf(design).at(-1)!
  const depths = TEXTURE_DEPTHS.map((d) => ({ ...d, actual: textureDepthMm(outerSpec, d.id) }))
  const depthCapped = depths.some((d) => d.actual < d.depth - 1e-6)

  // Collapse in 2D so the sizing panel below has room; reopen on wide screens back in 3D.
  const firstMode = useRef(true)
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false
      return
    }
    setOpen(mode === '3d' && window.matchMedia('(min-width: 640px)').matches)
  }, [mode])

  const setFinish = (patch: Partial<ColorFinish>) => {
    const finishes = design.colors.map((_, i) => finishOf(design, i))
    finishes[selectedLayer] = { ...finish, ...patch }
    onChange({ finishes })
  }

  const setColor = (color: string) => {
    if (activeSlot > 0) {
      const extras: ColorFinish['extras'] = [...finish.extras]
      extras[activeSlot - 1] = color
      setFinish({ extras })
      return
    }
    const colors = [...design.colors]
    colors[selectedLayer] = color
    onChange({ colors })
  }

  return (
    <div className="pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-md bg-panel text-white shadow-lg backdrop-blur-sm">
      <button
        className="flex w-full shrink-0 items-center gap-3 px-4 py-3 text-sm hover:bg-white/5"
        onClick={() => setOpen(!open)}
      >
        <Paintbrush size={16} />
        <span className="flex-1 text-left">Design</span>
        {open ? <ChevronsUp size={16} /> : <ChevronsDown size={16} />}
      </button>

      {open && (
        <div className="min-h-0 space-y-5 overflow-y-auto border-t border-white/15 px-4 pt-4 pb-5">
          <Section
            title={`Color · ${partName(design, selectedLayer)}`}
            action={
              <Switch
                label="Advanced"
                checked={design.advancedColor}
                onChange={(advancedColor) => onChange({ advancedColor })}
                title={
                  design.advancedColor
                    ? 'Turn off to show every part in a single color'
                    : 'Show dual or tri-color gradients in the viewer'
                }
              />
            }
          >
            {design.advancedColor && (
              <div className="mb-3 space-y-2.5">
                <Segmented
                  options={COLOR_COUNTS.map((c) => ({ id: c.count, label: c.label }))}
                  value={finish.count}
                  onChange={(count) => setFinish({ count })}
                />
                {finish.count > 1 && (
                  <>
                    <div className="flex gap-1.5">
                      {[colorOf(design, selectedLayer), ...finish.extras.slice(0, finish.count - 1)].map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setSlot(i)}
                          className={`flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-[11px] transition ${
                            activeSlot === i ? 'bg-white/25 ring-1 ring-white/70' : 'bg-black/15 hover:bg-white/10'
                          }`}
                        >
                          <span className="size-3.5 shrink-0 rounded-full border border-white/90" style={{ background: c }} />
                          Color {i + 1}
                        </button>
                      ))}
                    </div>
                    <div>
                      <div className="mb-1.5 text-[11px] text-white/80">Gradient mode</div>
                      <Segmented
                        options={GRADIENTS}
                        value={finish.gradient}
                        onChange={(gradient) => setFinish({ gradient })}
                      />
                    </div>
                    {finish.gradient === 'linear' && (
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-white/80">
                          Gradient angle
                          <span className="font-mono text-white/60">{Math.round(finish.angle)}°</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={MAX_GRADIENT_ANGLE}
                          step={1}
                          value={finish.angle}
                          onChange={(e) => setFinish({ angle: parseFloat(e.target.value) })}
                          className="mt-1.5 w-full"
                        />
                        <div className="flex justify-between text-[10px] text-white/60">
                          <button className="hover:text-white" onClick={() => setFinish({ angle: 0 })}>
                            Around ring
                          </button>
                          <button className="hover:text-white" onClick={() => setFinish({ angle: MAX_GRADIENT_ANGLE })}>
                            Face to face
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <p className="text-[11px] text-white/60">
                  For display only — the 3MF exports each part in its Color 1.
                </p>
              </div>
            )}
            <div className="grid grid-cols-6 gap-2.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={() => setColor(c)}
                  className={`aspect-square rounded-full border-2 transition hover:scale-110 ${
                    activeColor.toUpperCase() === c ? 'border-white ring-2 ring-white/60 ring-offset-2 ring-offset-neutral-500' : 'border-white/90'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-white/80">
              <span
                className="relative size-6 overflow-hidden rounded-full border-2 border-white/90"
                style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
              >
                <input
                  type="color"
                  value={activeColor}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </span>
              Custom color
              <span className="ml-auto font-mono text-white/60">{activeColor.toUpperCase()}</span>
            </label>
          </Section>

          <Section title="Inner diameter">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="text-lg leading-tight font-semibold">{formatLength(design.innerDiameter, unit)}</div>
              </div>
              <button
                onClick={() => onModeChange(mode === '2d' ? '3d' : '2d')}
                className={`flex items-center gap-1.5 rounded px-3 py-2 text-xs transition ${
                  mode === '2d' ? 'bg-white text-neutral-700' : 'bg-black/20 hover:bg-white/15'
                }`}
              >
                <Ruler size={14} />
                {mode === '2d' ? 'Back to 3D' : 'Size in 2D'}
              </button>
            </div>
          </Section>

          <Section title="Outer texture">
            <div className="grid grid-cols-3 gap-2">
              {TEXTURES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onChange({ texture: t.id })}
                  className={`flex flex-col items-center gap-1 rounded p-1.5 text-[11px] transition ${
                    design.texture === t.id ? 'bg-white/25 ring-1 ring-white/70' : 'bg-black/15 hover:bg-white/10'
                  }`}
                >
                  <TextureSwatch texture={t.id} />
                  {t.label}
                </button>
              ))}
            </div>
            {design.texture !== 'smooth' && (
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] text-white/80">Texture depth</div>
                <div className="grid grid-cols-3 gap-1 rounded bg-black/20 p-1">
                  {depths.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => onChange({ textureDepth: d.id })}
                      className={`flex flex-col items-center rounded px-1 py-1.5 text-xs leading-tight transition ${
                        design.textureDepth === d.id ? 'bg-white text-neutral-700' : 'hover:bg-white/15'
                      }`}
                    >
                      {d.label}
                      <span className="text-[10px] tabular-nums opacity-70">
                        {formatLength(d.actual, unit, unit === 'mm' ? 2 : 3)}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-white/60">
                  {depthCapped
                    ? 'Limited by the outer ring’s thickness — make it thicker in 2D sizing to cut deeper.'
                    : 'Deeper textures are easier to feel on a print.'}
                </p>
              </div>
            )}
            <p className="mt-2 text-[11px] text-white/60">Inner rings are always smooth so they spin freely.</p>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wider text-white/60 uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string; title?: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-1 rounded bg-black/20 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={`rounded px-1 py-1 text-xs transition ${value === o.id ? 'bg-white text-neutral-700' : 'hover:bg-white/15'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function TextureSwatch({ texture }: { texture: Texture }) {
  const stroke = 'rgb(255 255 255 / 0.85)'
  return (
    <svg viewBox="0 0 40 24" className="h-6 w-10 rounded-sm bg-black/25">
      {texture === 'smooth' && <rect x="0" y="9" width="40" height="6" fill="rgb(255 255 255 / 0.2)" />}
      {texture === 'knurled' &&
        Array.from({ length: 9 }, (_, i) => (
          <g key={i} stroke={stroke} strokeWidth="1">
            <line x1={i * 6 - 12} y1="0" x2={i * 6 + 12} y2="24" />
            <line x1={i * 6 + 12} y1="0" x2={i * 6 - 12} y2="24" />
          </g>
        ))}
      {texture === 'ribbed' &&
        Array.from({ length: 10 }, (_, i) => (
          <line key={i} x1={i * 4 + 2} y1="0" x2={i * 4 + 2} y2="24" stroke={stroke} strokeWidth="1.5" />
        ))}
      {texture === 'grooved' &&
        [4, 12, 20].map((y) => <line key={y} x1="0" y1={y} x2="40" y2={y} stroke={stroke} strokeWidth="1.5" />)}
      {texture === 'wave' &&
        Array.from({ length: 7 }, (_, i) => (
          <line key={i} x1={i * 7 - 6} y1="24" x2={i * 7 + 4} y2="0" stroke={stroke} strokeWidth="2" />
        ))}
      {texture === 'hammered' &&
        [
          [6, 6], [16, 5], [27, 7], [36, 5], [10, 15], [21, 14], [32, 16], [4, 21], [15, 22], [26, 21], [37, 20],
        ].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={3} fill="none" stroke={stroke} strokeWidth="1" />)}
      {texture === 'knurl-inset' &&
        [0, 1, 2, 3, 4, 5].flatMap((r) =>
          [0, 1, 2, 3, 4].map((c) => {
            const cx = c * 10 + (r & 1) * 5
            const cy = r * 5
            return (
              <polygon
                key={`${r}-${c}`}
                points={`${cx},${cy - 4} ${cx + 4},${cy} ${cx},${cy + 4} ${cx - 4},${cy}`}
                fill="rgb(255 255 255 / 0.3)"
                stroke={stroke}
                strokeWidth="0.75"
              />
            )
          }),
        )}
      {texture === 'spiral-flutes' &&
        Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={i * 4 - 8} y1="24" x2={i * 4 + 2} y2="0" stroke={stroke} strokeWidth="1.25" />
        ))}
      {texture === 'dimples' &&
        [0, 1, 2, 3].flatMap((r) =>
          [0, 1, 2, 3, 4, 5].map((c) => (
            <circle key={`${r}-${c}`} cx={c * 7 + (r & 1) * 3.5} cy={r * 6 + 3} r={2.2} fill="rgb(255 255 255 / 0.35)" stroke={stroke} strokeWidth="0.75" />
          )),
        )}
      {texture === 'dragon-scale' &&
        [0, 1, 2, 3, 4, 5, 6].flatMap((r) =>
          [0, 1, 2, 3, 4, 5].map((c) => {
            const cx = c * 8 + (r & 1) * 4
            const cy = r * 4
            return (
              <path key={`${r}-${c}`} d={`M${cx - 5},${cy} A5 5 0 0 0 ${cx + 5},${cy}`} fill="none" stroke={stroke} strokeWidth="1" />
            )
          }),
        )}
      {texture === 'honeycomb' &&
        [0, 1, 2, 3, 4].flatMap((r) =>
          [0, 1, 2, 3, 4, 5, 6].map((c) => {
            const s = 4
            const cx = c * s * Math.sqrt(3) + (r & 1) * s * (Math.sqrt(3) / 2)
            const cy = r * s * 1.5
            const points = Array.from({ length: 6 }, (_, k) => {
              const a = (Math.PI / 3) * k + Math.PI / 6
              return `${cx + s * Math.cos(a)},${cy + s * Math.sin(a)}`
            }).join(' ')
            return <polygon key={`${r}-${c}`} points={points} fill="none" stroke={stroke} strokeWidth="1" />
          }),
        )}
      {texture === 'triangles' && (
        <g stroke={stroke} strokeWidth="1">
          {[3, 11.66, 20.32].map((y) => (
            <line key={y} x1="0" y1={y} x2="40" y2={y} />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <g key={i}>
              <line x1={i * 10 - 20} y1="24" x2={i * 10 - 6.14} y2="0" />
              <line x1={i * 10 - 20} y1="0" x2={i * 10 - 6.14} y2="24" />
            </g>
          ))}
        </g>
      )}
      {texture === 'squares' && (
        <g stroke={stroke} strokeWidth="1">
          {[2, 8, 14, 20].map((y) => (
            <line key={y} x1="0" y1={y} x2="40" y2={y} />
          ))}
          {[2, 8, 14, 20, 26, 32, 38].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="24" />
          ))}
        </g>
      )}
      {texture === 'rectangles' && (
        <g stroke={stroke} strokeWidth="1">
          {[0, 1, 2, 3].map((r) => (
            <g key={r}>
              <line x1="0" y1={r * 6 + 3} x2="40" y2={r * 6 + 3} />
              {[0, 1, 2, 3, 4].map((c) => {
                const x = c * 10 + (r & 1) * 5
                return <line key={c} x1={x} y1={r * 6 - 3} x2={x} y2={r * 6 + 3} />
              })}
            </g>
          ))}
        </g>
      )}
      {texture === 'herringbone' && (
        <g stroke={stroke} strokeWidth="1">
          {[0, 1, 2, 3, 4].map((c) => (
            <g key={c}>
              <line x1={c * 8} y1="0" x2={c * 8} y2="24" />
              {Array.from({ length: 8 }, (_, i) => {
                const y = i * 4 - 4
                return c & 1 ? (
                  <line key={i} x1={c * 8} y1={y} x2={c * 8 + 8} y2={y + 8} />
                ) : (
                  <line key={i} x1={c * 8} y1={y + 8} x2={c * 8 + 8} y2={y} />
                )
              })}
            </g>
          ))}
        </g>
      )}
      {texture === 'chevron' &&
        [-2, 4, 10, 16, 22].map((y) => (
          <polyline
            key={y}
            points={Array.from({ length: 9 }, (_, i) => `${i * 5},${y + (i & 1) * 5}`).join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
          />
        ))}
    </svg>
  )
}
