import { useEffect } from 'react'
import { Download, FolderOpen, Sparkles, Play, X } from 'lucide-react'

const VIDEO_ID = 'v1HEfOLGfEw'
const STORAGE_KEY = 'fidget-ring-maker:welcome'

/** 'new' — never visited; 'seen' — visited before; 'off' — asked not to see the welcome popup on startup. */
export type WelcomeState = 'new' | 'seen' | 'off'

export function loadWelcome(): WelcomeState {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'seen' || value === 'off' ? value : 'new'
  } catch {
    return 'new'
  }
}

export function saveWelcome(state: WelcomeState) {
  try {
    localStorage.setItem(STORAGE_KEY, state)
  } catch {
    // storage unavailable; the popup will just show again next visit
  }
}

const POINTS = [
  { Icon: Play, text: 'Watch the video to learn how to use the tool.' },
  { Icon: FolderOpen, text: 'Save your design locally and open it again later.' },
  { Icon: Download, text: 'Export an STL or 3MF for 3D printing.' },
  { Icon: Sparkles, text: 'Add custom outer designs with textures.' },
]

interface HelpDialogProps {
  /** Show the "don't show again" option (returning visitors, or opened from the ? button). */
  showOptOut: boolean
  optedOut: boolean
  onOptOutChange: (off: boolean) => void
  onClose: () => void
}

export function HelpDialog({ showOptOut, optedOut, onOptOutChange, onClose }: HelpDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 select-text" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-md bg-neutral-700 p-4 text-white shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="help-title" className="text-base font-semibold">
            Welcome to Fidget Maker
          </h2>
          <button onClick={onClose} title="Close" className="rounded p-1 text-white/70 transition hover:bg-white/15 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="aspect-video w-full overflow-hidden rounded bg-black">
          <iframe
            className="size-full"
            src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0`}
            title="How to use Fidget Maker"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        <ul className="mt-3 space-y-1.5">
          {POINTS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 text-sm text-white/85">
              <Icon size={15} className="shrink-0 text-[#3aa5f2]" />
              {text}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between gap-3">
          {showOptOut ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
              <input type="checkbox" checked={optedOut} onChange={(e) => onOptOutChange(e.target.checked)} />
              Don't show this on startup
            </label>
          ) : (
            <span />
          )}
          <button onClick={onClose} className="rounded bg-[#3aa5f2] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#2b93de]">
            Get started
          </button>
        </div>
      </div>
    </div>
  )
}
