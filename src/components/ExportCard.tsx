import { useState } from 'react'
import { CircleHelp, Download, FileArchive, FilePlus, FolderOpen, Save, X } from 'lucide-react'
import { PROJECT_EXTENSION, type Design } from '../lib/design'
import { RingIcon } from './RingIcon'

export type ExportFormat = 'stl' | 'stl-zip' | '3mf'

interface ExportCardProps {
  design: Design
  stlByteSize: number
  onExport: (format: ExportFormat) => void
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onHelp: () => void
}

const FORMATS: { id: 'stl' | '3mf'; label: string; hint: string }[] = [
  { id: 'stl', label: 'STL', hint: 'One object or a zip of separate objects, works with every slicer' },
  { id: '3mf', label: '3MF', hint: 'Each ring as its own coloured object — best for multi-colour printing' },
]

const STL_CHOICES: { id: ExportFormat; label: string; hint: string; Icon: typeof Download }[] = [
  { id: 'stl', label: 'One object', hint: 'Every part in a single .stl file', Icon: Download },
  { id: 'stl-zip', label: 'Separate objects', hint: 'A .zip with one .stl per part', Icon: FileArchive },
]

const buttonClass =
  'flex items-center gap-1 rounded px-2 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/15 hover:text-white'

export function ExportCard({ design, stlByteSize, onExport, onNew, onOpen, onSave, onHelp }: ExportCardProps) {
  const [askingStl, setAskingStl] = useState(false)

  return (
    <div className="rounded-md bg-panel p-2.5 text-white shadow-lg backdrop-blur-sm">
      <div className="flex items-center overflow-hidden rounded bg-panel-strong">
        <span className="grid size-14 shrink-0 place-items-center bg-[#7f8c86]">
          <RingIcon design={design} className="size-9 drop-shadow" />
        </span>
        <span className="hidden px-3 sm:block">
          <span className="block text-sm font-semibold">Fidget Ring</span>
          <span className="block text-xs text-white/70">STL {formatBytes(stlByteSize)}</span>
        </span>
        <span className="flex gap-1 border-l border-white/10 px-2">
          {FORMATS.map((f) => {
            const active = f.id === 'stl' && askingStl
            return (
              <button
                key={f.id}
                aria-expanded={f.id === 'stl' ? askingStl : undefined}
                onClick={() => (f.id === 'stl' ? setAskingStl(!askingStl) : onExport(f.id))}
                title={`Download ${f.label} — ${f.hint}`}
                className={active ? `${buttonClass} bg-white text-neutral-700 hover:bg-white hover:text-neutral-700` : buttonClass}
              >
                {active ? <X size={14} /> : <Download size={14} />}
                {f.label}
              </button>
            )
          })}
        </span>
        <span className="flex gap-1 border-l border-white/10 px-2">
          {[
            { label: 'New', Icon: FilePlus, onClick: onNew, title: 'New project — start again from the default design' },
            { label: 'Open', Icon: FolderOpen, onClick: onOpen, title: `Open a project (${PROJECT_EXTENSION})` },
            { label: 'Save', Icon: Save, onClick: onSave, title: `Save this project (${PROJECT_EXTENSION})` },
          ].map(({ label, Icon, onClick, title }) => (
            <button key={label} onClick={onClick} title={title} className={buttonClass}>
              <Icon size={14} />
              {label}
            </button>
          ))}
          <button onClick={onHelp} title="Info and help" aria-label="Info and help" className={buttonClass}>
            <CircleHelp size={14} />
          </button>
        </span>
      </div>

      {askingStl && (
        <div className="mt-2 space-y-1">
          <p className="px-1 pb-1 text-[11px] font-semibold tracking-wider text-white/60 uppercase">Download STL as…</p>
          {STL_CHOICES.map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              onClick={() => {
                onExport(id)
                setAskingStl(false)
              }}
              className="flex w-full items-center gap-2.5 rounded bg-black/15 px-2.5 py-2 text-left transition hover:bg-white/15"
            >
              <Icon size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{label}</span>
                <span className="block text-[11px] text-white/65">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}
