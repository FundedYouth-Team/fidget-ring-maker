import { useState } from 'react'
import { ChevronsDown, ChevronsUp, Layers, Plus, Trash2 } from 'lucide-react'
import { MAX_RINGS, MIN_RINGS, canAddLayer, layersOf, ringCountOf, type Design, type LayerKind } from '../lib/design'

interface LayersCardProps {
  design: Design
  selected: number
  onSelect: (index: number) => void
  onRemove: (kind: LayerKind) => void
  onAdd: (kind: LayerKind) => void
  onSetFilled: (filled: boolean) => void
}

export function LayersCard({ design, selected, onSelect, onRemove, onAdd, onSetFilled }: LayersCardProps) {
  const [open, setOpen] = useState(true)
  const canAdd = canAddLayer(design, 'outer')

  return (
    <div className="w-60 overflow-hidden rounded-md bg-panel text-white shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-2 px-4 py-2 text-sm">
        <Layers size={16} />
        <span>Layers</span>
        <button
          title={canAdd ? 'Add an outer ring' : `Up to ${MAX_RINGS} rings`}
          disabled={!canAdd}
          onClick={() => {
            onAdd('outer')
            setOpen(true)
          }}
          className="grid size-7 place-items-center rounded bg-black/20 transition enabled:hover:bg-white/15 disabled:opacity-45"
        >
          <Plus size={14} />
        </button>
        <button
          title={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpen(!open)}
          className="ml-auto grid size-7 place-items-center rounded hover:bg-white/10"
        >
          {open ? <ChevronsUp size={16} /> : <ChevronsDown size={16} />}
        </button>
      </div>

      {open && (
        <div className="space-y-1 border-t border-white/15 p-2">
          {layersOf(design).map((layer) => (
            <div
              key={layer.index}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(layer.index)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(layer.index)}
              className={`flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 text-sm transition ${
                selected === layer.index ? 'bg-white/25 ring-1 ring-white/70' : 'bg-black/15 hover:bg-white/10'
              }`}
            >
              <LayerSwatch fill={layer.kind === 'fill'} color={layer.color} />
              <span className="min-w-0 flex-1">
                <span className="block">{layer.name}</span>
                {layer.kind === 'inner' && (
                  <span
                    role="radiogroup"
                    aria-label="Inner ring style"
                    className="mt-1 inline-flex rounded bg-black/25 p-0.5 text-[11px]"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {([false, true] as const).map((filled) => (
                      <button
                        key={String(filled)}
                        role="radio"
                        aria-checked={design.filled === filled}
                        title={filled ? 'A solid spinning core fills the centre' : 'An open finger hole'}
                        onClick={() => onSetFilled(filled)}
                        className={`rounded px-2 py-0.5 transition ${
                          design.filled === filled ? 'bg-white text-neutral-700' : 'text-white/75 hover:bg-white/15'
                        }`}
                      >
                        {filled ? 'Fill' : 'Standard'}
                      </button>
                    ))}
                  </span>
                )}
              </span>
              {layer.kind && layer.deletable && (
                <button
                  title={`Delete ${layer.name.toLowerCase()}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(layer.kind!)
                  }}
                  className="rounded p-1 text-white/70 transition hover:bg-white/15 hover:text-white"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {ringCountOf(design) <= MIN_RINGS && (
            <p className="px-1 pt-1 text-[11px] text-white/60">A fidget ring needs at least {MIN_RINGS} rings.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Hollow circle for a ring, solid disc for the fill. */
function LayerSwatch({ fill, color }: { fill: boolean; color: string }) {
  return (
    <span
      className="size-4 shrink-0 rounded-full border-white/90"
      style={fill ? { background: color, borderWidth: 2 } : { border: `4px solid ${color}`, boxShadow: '0 0 0 1px rgb(255 255 255 / 0.9)' }}
    />
  )
}
