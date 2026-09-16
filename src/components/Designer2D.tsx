import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Eye,
  Maximize,
  Minus,
  MoveVertical,
  Plus,
  Printer as PrinterIcon,
  Ruler,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { colorOf, gapOf, partName, ringOfPart, sizingOf, specsOf, type Design } from '../lib/design'
import {
  GAP,
  MAX_DIAMETER,
  MIN_DIAMETER,
  clampDiameter as clampDiameterTo,
  clampWidth,
  diameterRange,
  edgeRadius,
  formatUsSize,
  gapRange,
  outerDiameter,
  radiusFromEdge,
  surfaceRadius,
  usSizeToDiameter,
  wallRange,
  widthRange,
  type RingSpec,
} from '../lib/ring'
import { loadPrinterId, PRINTERS, printerById, savePrinterId } from '../lib/printers'
import { formatLength, fromUnit, snapMm, STEP, toUnit, type Unit } from '../lib/units'
import { annulus } from './RingIcon'
import type { View2D } from './Toolbar'

interface Designer2DProps {
  design: Design
  unit: Unit
  /** Part chosen in the Layers box (innermost = 0, the fill first when present). */
  selectedLayer: number
  onSelectLayer: (index: number) => void
  onDiameterChange: (diameter: number) => void
  /** New wall thickness for ring `ring` (innermost ring = 0). */
  onWallChange: (ring: number, wall: number) => void
  /** New face-to-face width, shared by every ring. */
  onWidthChange: (width: number) => void
  /** Face on for the diameters, or edge on — the ring lying flat — for its height. */
  view: View2D
  onViewChange: (view: View2D) => void
  /** Turns the usual inner diameter and thickness limits on or off. */
  onLimitedChange: (limited: boolean) => void
  /** Turns fixed ring spacing on or off, or sets the custom spacing between every ring. */
  onSpacingChange: (patch: Pick<Partial<Design>, 'fixedGap' | 'gap'>) => void
  /** Where the sizing panel is rendered — the spot below the Color and Texture boxes. */
  panelSlot: HTMLElement | null
}

const MIN_VIEW = 30 // half-extent of the drawing in mm; grows to fit thicker rings
/** Zoom limits for the drawing's half-extent, in mm — out far enough to see the largest bed. */
const ZOOM_MIN_VIEW = 10
const ZOOM_MAX_VIEW = Math.max(...PRINTERS.map((p) => Math.max(p.bed.x, p.bed.y))) / 2 + 30
const ZOOM_STEP = 1.25
const HANDLE_COLOR = '#3aa5f2'
const BED_COLOR = '#4a4a4a'
const US_SIZES = Array.from({ length: 25 }, (_, i) => 2 + i * 0.5).filter((s) => {
  const d = usSizeToDiameter(s)
  return d >= MIN_DIAMETER && d <= MAX_DIAMETER
})

const round1 = (v: number) => Math.round(v * 10) / 10
/** Short, trailing-zero-free length for tight labels: "2.25 mm", "0.089 in". */
const formatShort = (mm: number, unit: Unit) => `${+toUnit(mm, unit).toFixed(unit === 'mm' ? 2 : 3)} ${unit}`
/** "256 × 256 mm" or "10.08 × 10.08 in". */
const formatBed = (x: number, y: number, unit: Unit) => {
  const n = (mm: number) => +toUnit(mm, unit).toFixed(unit === 'mm' ? 0 : 2)
  return `${n(x)} × ${n(y)} ${unit}`
}

type Handle = 'bore' | 'outer' | 'height'

/** Front-on, to-scale view for sizing the selected layer. Drag its handles to resize. */
export function Designer2D({
  design,
  unit,
  selectedLayer,
  onSelectLayer,
  onDiameterChange,
  onWallChange,
  onWidthChange,
  view: viewMode,
  onViewChange,
  onLimitedChange,
  onSpacingChange,
  panelSlot,
}: Designer2DProps) {
  const sizing = sizingOf(design)
  const gap = gapOf(design)
  const gaps = gapRange(sizing)
  const widths = widthRange(design.limited)
  const setWidth = (v: number) => onWidthChange(clampWidth(snapMm(v, unit), design.limited))
  const sideView = viewMode === 'side'
  const half = design.width / 2
  // Side-view labels need room: the height caption fits beside a band over 5.2 mm, the full bore
  // dimension (size, arrow and US size) inside one over 6.4 mm; below that the bore size shrinks.
  const tallBand = half > 2.6
  const roomyBore = half > 3.2
  const boreFont = Math.min(1.9, design.width * 0.4)
  const [spacingPreview, setSpacingPreview] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(true)
  const [bedOpen, setBedOpen] = useState(true)
  // Fixed spacing has nothing to adjust, so its preview closes with it.
  const setFixedGap = (fixedGap: boolean) => {
    if (fixedGap) setSpacingPreview(false)
    onSpacingChange({ fixedGap })
  }
  const setGap = (v: number) => onSpacingChange({ gap: Math.round(v * 100) / 100 })
  const diameters = diameterRange(design.limited)
  // Snap to the display unit's precision so typed and dragged values read back cleanly.
  const clampDiameter = (d: number) => clampDiameterTo(snapMm(d, unit), design.limited)
  const svgRef = useRef<SVGSVGElement>(null)
  const [angles, setAngles] = useState({ bore: -Math.PI / 4, outer: -Math.PI / 4 })
  const [dragging, setDragging] = useState<Handle | null>(null)
  const specs = specsOf(design)
  const bore = design.innerDiameter / 2
  const outerR = outerDiameter(specs) / 2
  // Where the outermost ring meets its flat faces — inside `outerR`, which is the crown at the mid-plane.
  const faceR = edgeRadius(specs[specs.length - 1].outer, design.width)
  const fitView = Math.max(MIN_VIEW, Math.ceil(outerR + 6))
  // null follows the ring (the default fit); a number is a zoom the user chose.
  const [zoomView, setZoomView] = useState<number | null>(null)
  const view = zoomView ?? fitView
  const zoomTo = (v: number) => setZoomView(Math.min(ZOOM_MAX_VIEW, Math.max(ZOOM_MIN_VIEW, v)))
  // Strokes, dashes and handles are sized for the default view; scale them so they keep their on-screen size.
  const px = view / MIN_VIEW
  const gridStep = view > 90 ? 10 : 1

  const [printerId, setPrinterId] = useState(loadPrinterId)
  useEffect(() => savePrinterId(printerId), [printerId])
  const printer = printerById(printerId)
  const bedView = Math.max(printer.bed.x, printer.bed.y) / 2 + 12

  // Wheel / trackpad pinch zooms the drawing. Non-passive so pinch doesn't zoom the whole page.
  const viewRef = useRef(view)
  viewRef.current = view
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      setZoomView(Math.min(ZOOM_MAX_VIEW, Math.max(ZOOM_MIN_VIEW, v)))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const part = Math.min(selectedLayer, specs.length - 1)
  const ring = ringOfPart(design, part)
  const spec = specs[part]
  const outermost = part === specs.length - 1
  const isInnerRing = ring === 0
  // A ring's wall is measured from where it starts: the bore, or one gap outside the ring within.
  const start = isInnerRing ? bore : spec.inner.radius
  const range = wallRange(ring, sizing)
  const wall = spec.outer.radius - start
  // The outer ring's rounded outside is drawn at its widest; other rings show their face edge.
  const outerHandleR = outermost ? spec.outer.radius : edgeRadius(spec.outer, design.width)

  const setOuterDiameter = (d: number) => onWallChange(ring, snapMm(d, unit) / 2 - start)

  const toMm = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: pt.x, y: pt.y }
  }

  const dragTo = (handle: Handle, e: React.PointerEvent) => {
    const { x, y } = toMm(e)
    // Side on, the ring is mirrored about the axis, so either face sets the height.
    if (handle === 'height') return setWidth(Math.abs(y) * 2)
    const r = Math.hypot(x, y)
    setAngles((a) => ({ ...a, [handle]: Math.atan2(y, x) }))
    if (handle === 'bore') onDiameterChange(clampDiameter(r * 2))
    else setOuterDiameter((outermost ? r : radiusFromEdge(spec.outer.kind, r, design.width)) * 2)
  }

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(handle)
    dragTo(handle, e)
  }

  // Stop dragging if the selection changes mid-drag (e.g. a keyboard shortcut in the Layers box).
  useEffect(() => setDragging(null), [part])

  // Front-on handles ride a circle, so they track an angle; the side view's height handle doesn't.
  const handles: { id: 'bore' | 'outer'; r: number }[] = ring < 0 ? [] : [{ id: 'outer', r: outerHandleR }]
  if (isInnerRing) handles.unshift({ id: 'bore', r: bore })

  const labelAngle = angles.outer
  const labelR = outerHandleR + 3.2

  return (
    <div className="absolute inset-0 bg-stage">
      <div className="relative size-full">
        <svg
          ref={svgRef}
          viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`}
          className="absolute inset-0 size-full touch-none select-none"
          onPointerMove={(e) => dragging && dragTo(dragging, e)}
          onPointerUp={() => setDragging(null)}
          onPointerCancel={() => setDragging(null)}
        >
          <defs>
            {/* 1 mm / 5 mm grid, or 10 mm / 50 mm when zoomed out to the bed */}
            <pattern id="grid-minor" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse" x={0} y={0}>
              <path
                d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
                fill="none"
                stroke="rgb(0 0 0 / 0.06)"
                strokeWidth={0.04 * px}
              />
            </pattern>
            <pattern id="grid-major" width={gridStep * 5} height={gridStep * 5} patternUnits="userSpaceOnUse" x={0} y={0}>
              <rect width={gridStep * 5} height={gridStep * 5} fill="url(#grid-minor)" />
              <path
                d={`M ${gridStep * 5} 0 L 0 0 0 ${gridStep * 5}`}
                fill="none"
                stroke="rgb(0 0 0 / 0.12)"
                strokeWidth={0.06 * px}
              />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3a3a3a" />
            </marker>
            <marker id="arrow-light" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#cfcfcf" />
            </marker>
          </defs>
          <rect x={-view * 4} y={-view * 4} width={view * 8} height={view * 8} fill="url(#grid-major)" />

          {/* print bed: its outline face on, its surface with the ring resting on it side on */}
          <g className="pointer-events-none">
            {sideView ? (
              <line
                x1={-printer.bed.x / 2}
                y1={half}
                x2={printer.bed.x / 2}
                y2={half}
                stroke={BED_COLOR}
                strokeWidth={0.15 * px}
                strokeDasharray={`${1.2 * px} ${0.8 * px}`}
              />
            ) : (
              <rect
                x={-printer.bed.x / 2}
                y={-printer.bed.y / 2}
                width={printer.bed.x}
                height={printer.bed.y}
                rx={2}
                fill="rgb(255 255 255 / 0.18)"
                stroke={BED_COLOR}
                strokeWidth={0.15 * px}
                strokeDasharray={`${1.2 * px} ${0.8 * px}`}
              />
            )}
            <text
              x={-printer.bed.x / 2 + 1.2 * px}
              y={sideView ? half + 2.6 * px : -printer.bed.y / 2 + 2.2 * px}
              fontSize={1.3 * px}
              fill={BED_COLOR}
            >
              {printer.name} · {formatBed(printer.bed.x, printer.bed.y, unit)}
            </text>
          </g>

          {!sideView && (
          <>
          {/* the gaps between rings read as a dark shadow behind the faces */}
          <path d={annulus(outerR, design.filled ? 0 : bore)} fill="#5c5c5c" fillRule="evenodd" />
          {specs.map((s, i) => {
            const last = i === specs.length - 1
            const color = colorOf(design, i)
            return (
              <g key={i} className="cursor-pointer" onPointerDown={() => onSelectLayer(i)}>
                {last && (
                  <path
                    d={annulus(outerR, edgeRadius(s.outer, s.width))}
                    fill={color}
                    fillRule="evenodd"
                    stroke="rgb(0 0 0 / 0.35)"
                    strokeWidth="0.08"
                  />
                )}
                {last && <path d={annulus(outerR, edgeRadius(s.outer, s.width))} fill="rgb(0 0 0 / 0.14)" fillRule="evenodd" />}
                <path
                  d={annulus(edgeRadius(s.outer, s.width), edgeRadius(s.inner, s.width))}
                  fill={color}
                  fillRule="evenodd"
                  stroke="rgb(0 0 0 / 0.35)"
                  strokeWidth="0.08"
                />
              </g>
            )
          })}

          {/* selected layer outline */}
          <path
            d={annulus(outermost ? outerR : edgeRadius(spec.outer, spec.width), edgeRadius(spec.inner, spec.width))}
            fill="none"
            stroke={HANDLE_COLOR}
            strokeWidth="0.22"
            strokeDasharray="0.8 0.5"
            className="pointer-events-none"
          />

          {/* inner diameter dimension */}
          <g className="pointer-events-none">
            <line
              x1={-bore + 0.3}
              y1={0}
              x2={bore - 0.3}
              y2={0}
              stroke="#3a3a3a"
              strokeWidth="0.12"
              markerStart="url(#arrow)"
              markerEnd="url(#arrow)"
            />
            <text x={0} y={-0.9} textAnchor="middle" fontSize="1.9" fontWeight="600" fill="#2b2b2b">
              Ø {formatLength(design.innerDiameter, unit)}
            </text>
            <text x={0} y={2.3} textAnchor="middle" fontSize="1.3" fill="#555">
              US size {formatUsSize(design.innerDiameter)}
            </text>
          </g>

          {/* outer diameter dimension */}
          <g stroke="#6a6a6a" strokeWidth="0.08" className="pointer-events-none">
            <line x1={-outerR} y1={outerR * 0.3} x2={-outerR} y2={outerR + 3.5} strokeDasharray="0.4 0.3" />
            <line x1={outerR} y1={outerR * 0.3} x2={outerR} y2={outerR + 3.5} strokeDasharray="0.4 0.3" />
            <line
              x1={-outerR + 0.2}
              y1={outerR + 2.6}
              x2={outerR - 0.2}
              y2={outerR + 2.6}
              stroke="#3a3a3a"
              strokeWidth="0.1"
              markerStart="url(#arrow)"
              markerEnd="url(#arrow)"
            />
          </g>
          <text x={0} y={outerR + 2.1} textAnchor="middle" fontSize="1.2" fill="#444" className="pointer-events-none">
            outer Ø {formatLength(outerR * 2, unit)} · {formatShort(design.width, unit)} high
          </text>

          {/* drag targets + handles for the selected layer */}
          {handles.map(({ id, r }) => {
            const active = dragging === id
            const hx = Math.cos(angles[id]) * r
            const hy = Math.sin(angles[id]) * r
            // Handles keep their on-screen size when zoomed out, but don't balloon when zoomed in.
            const hs = Math.max(px, 0.5)
            return (
              <g key={id}>
                <circle
                  r={r}
                  fill="none"
                  stroke={active ? HANDLE_COLOR : 'rgb(58 165 242 / 0.001)'}
                  strokeWidth={(active ? 0.18 : 1.2) * hs}
                  className="cursor-grab"
                  onPointerDown={startDrag(id)}
                />
                <g className="cursor-grab" onPointerDown={startDrag(id)}>
                  <circle cx={hx} cy={hy} r={2.2 * hs} fill="transparent" />
                  <circle
                    cx={hx}
                    cy={hy}
                    r={(active ? 1.1 : 0.9) * hs}
                    fill="#fff"
                    stroke={HANDLE_COLOR}
                    strokeWidth={0.35 * hs}
                  />
                </g>
              </g>
            )
          })}
          {ring >= 0 && (
            <g className="pointer-events-none" transform={`translate(${Math.cos(labelAngle) * labelR} ${Math.sin(labelAngle) * labelR})`}>
              <rect x={-5.6} y={-1.25} width={11.2} height={2.5} rx={1.25} fill="rgb(0 0 0 / 0.55)" />
              <text y={0.45} textAnchor="middle" fontSize="1.15" fill="#fff">
                Ø {toUnit(spec.outer.radius * 2, unit).toFixed(unit === 'mm' ? 1 : 3)} · {formatShort(wall, unit)} thick
              </text>
            </g>
          )}
          </>
          )}

          {sideView && (
          <>
          {/* The ring lying flat on the bed, cut through its axis and mirrored about it. The gaps
              read as a dark shadow out to the face edges, so the crown keeps a clean silhouette;
              the bore is darker still — you're looking down it — which keeps the whole ring one
              solid shape however short it gets. */}
          <rect x={-faceR} y={-half} width={faceR * 2} height={design.width} fill="#5c5c5c" />
          {!design.filled && <rect x={-bore} y={-half} width={bore * 2} height={design.width} fill="#3f3f3f" />}
          {specs.map((s, i) => (
            <g
              key={i}
              className="cursor-pointer"
              fill={colorOf(design, i)}
              stroke="rgb(0 0 0 / 0.35)"
              strokeWidth={0.06}
              onPointerDown={() => onSelectLayer(i)}
            >
              <path d={sectionPath(s)} />
              <path d={sectionPath(s)} transform="scale(-1 1)" />
            </g>
          ))}

          {/* selected part, outlined on both halves */}
          <g
            fill="none"
            stroke={HANDLE_COLOR}
            strokeWidth="0.22"
            strokeDasharray="0.8 0.5"
            className="pointer-events-none"
          >
            <path d={sectionPath(spec)} />
            <path d={sectionPath(spec)} transform="scale(-1 1)" />
          </g>

          {/* height dimension, out to the left of the ring */}
          <g className="pointer-events-none">
            <g stroke="#6a6a6a" strokeWidth="0.08" strokeDasharray="0.4 0.3">
              <line x1={-outerR - 5} y1={-half} x2={-faceR - 0.3} y2={-half} />
              <line x1={-outerR - 5} y1={half} x2={-faceR - 0.3} y2={half} />
            </g>
            <line
              x1={-outerR - 4.2}
              y1={-half + 0.2}
              x2={-outerR - 4.2}
              y2={half - 0.2}
              stroke="#3a3a3a"
              strokeWidth="0.12"
              markerStart="url(#arrow)"
              markerEnd="url(#arrow)"
            />
            {/* centred on the band; a short ring drops the caption so nothing crosses the bed line */}
            <text
              x={-outerR - 5.4}
              y={tallBand ? -0.25 : 0.65}
              textAnchor="end"
              fontSize="1.9"
              fontWeight="600"
              fill="#2b2b2b"
            >
              {formatLength(design.width, unit)}
            </text>
            {tallBand && (
              <text x={-outerR - 5.4} y={1.75} textAnchor="end" fontSize="1.2" fill="#555">
                height
              </text>
            )}
          </g>

          {/* Inner diameter, read down the bore. A roomy bore gets the full dimension like the
              front view; a short one just the size, shrunk to fit the band. */}
          {!design.filled && (
            <g className="pointer-events-none">
              {roomyBore ? (
                <>
                  <line
                    x1={-bore + 0.3}
                    y1={0}
                    x2={bore - 0.3}
                    y2={0}
                    stroke="#cfcfcf"
                    strokeWidth="0.12"
                    markerStart="url(#arrow-light)"
                    markerEnd="url(#arrow-light)"
                  />
                  <text x={0} y={-0.9} textAnchor="middle" fontSize="1.9" fontWeight="600" fill="#f0f0f0">
                    Ø {formatLength(design.innerDiameter, unit)}
                  </text>
                  <text x={0} y={2.3} textAnchor="middle" fontSize="1.3" fill="#c8c8c8">
                    US size {formatUsSize(design.innerDiameter)}
                  </text>
                </>
              ) : (
                boreFont >= 0.8 && (
                  <text
                    x={0}
                    y={boreFont * 0.35}
                    textAnchor="middle"
                    fontSize={boreFont}
                    fontWeight="600"
                    fill="#f0f0f0"
                  >
                    Ø {formatLength(design.innerDiameter, unit)}
                  </text>
                )
              )}
            </g>
          )}

          {/* axis of rotation, in the usual dash-dot of a section drawing — kept clear of the bore */}
          <g
            stroke="#6a6a6a"
            strokeWidth="0.09"
            strokeDasharray="1.4 0.4 0.25 0.4"
            className="pointer-events-none"
          >
            <line x1={0} y1={-half - 3} x2={0} y2={-half - 0.4} />
            <line x1={0} y1={half + 0.4} x2={0} y2={half + 3} />
          </g>

          {/* outer diameter, below the ring */}
          <g stroke="#6a6a6a" strokeWidth="0.08" className="pointer-events-none">
            <line x1={-outerR} y1={half} x2={-outerR} y2={half + 5.5} strokeDasharray="0.4 0.3" />
            <line x1={outerR} y1={half} x2={outerR} y2={half + 5.5} strokeDasharray="0.4 0.3" />
            <line
              x1={-outerR + 0.2}
              y1={half + 4.6}
              x2={outerR - 0.2}
              y2={half + 4.6}
              stroke="#3a3a3a"
              strokeWidth="0.1"
              markerStart="url(#arrow)"
              markerEnd="url(#arrow)"
            />
          </g>
          <text x={0} y={half + 4.1} textAnchor="middle" fontSize="1.2" fill="#444" className="pointer-events-none">
            outer Ø {formatLength(outerR * 2, unit)}
          </text>

          {/* a grab bar along each face — dragging either sets the height */}
          {([-1, 1] as const).map((face) => {
            const active = dragging === 'height'
            const hs = Math.max(px, 0.5)
            const hx = (bore + outerR) / 2
            return (
              <g key={face} className="cursor-ns-resize" onPointerDown={startDrag('height')}>
                <rect x={-outerR} y={face * half - 1.1 * hs} width={outerR * 2} height={2.2 * hs} fill="transparent" />
                {active && (
                  <line
                    x1={-outerR}
                    y1={face * half}
                    x2={outerR}
                    y2={face * half}
                    stroke={HANDLE_COLOR}
                    strokeWidth={0.18 * hs}
                  />
                )}
                {[-hx, hx].map((cx) => (
                  <circle
                    key={cx}
                    cx={cx}
                    cy={face * half}
                    r={(active ? 1.1 : 0.9) * hs}
                    fill="#fff"
                    stroke={HANDLE_COLOR}
                    strokeWidth={0.35 * hs}
                  />
                ))}
              </g>
            )
          })}
          </>
          )}
        </svg>
        <p className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs whitespace-nowrap text-white sm:top-5">
          {sideView
            ? 'The ring lying flat — drag either face to set its height'
            : ring < 0
              ? 'Select a ring to size it'
              : isInnerRing
                ? 'Drag the blue handles to set the inner diameter and thickness'
                : `Drag the blue handle to set the ${partName(design, part).toLowerCase()}'s thickness`}
        </p>
      </div>

      {panelSlot &&
        createPortal(
      <>
      <aside
        className={`pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-md bg-panel text-white shadow-lg backdrop-blur-sm ${
          sizeOpen ? '' : 'shrink-0'
        }`}
      >
        <h2 className="flex shrink-0 items-center gap-3 py-2 pr-2 pl-4 text-sm">
          <Ruler size={16} />
          Size
          <Switch
            label="Limit"
            checked={design.limited}
            onChange={onLimitedChange}
            title={
              design.limited
                ? `Inner diameter ${formatShort(MIN_DIAMETER, unit)}–${formatShort(MAX_DIAMETER, unit)}; turn off to remove the limit`
                : 'No limit on the inner diameter or thickness'
            }
            className="ml-1"
          />
          <CollapseButton open={sizeOpen} onToggle={() => setSizeOpen(!sizeOpen)} />
        </h2>
        {sizeOpen && (
        <div className="min-h-0 space-y-4 overflow-y-auto border-t border-white/15 p-4">
        <div className="border-b border-white/15 pb-4">
          <SectionTitle>Ring height</SectionTitle>
          <NumberField
            value={+design.width.toFixed(2)}
            min={widths.min}
            max={widths.max}
            unit={unit}
            onChange={setWidth}
          />
          <input
            type="range"
            min={widths.min}
            max={widths.max}
            step={0.1}
            value={design.width}
            onChange={(e) => setWidth(parseFloat(e.target.value))}
            className="mt-3 w-full"
          />
          <p className="mt-1.5 text-[11px] text-white/60">
            How tall the ring stands lying flat — the band's width, the same on every ring.
          </p>
          {!sideView && (
            <button
              onClick={() => onViewChange('side')}
              className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded bg-black/20 text-xs transition hover:bg-white/15"
            >
              <MoveVertical size={14} />
              Show the side view
            </button>
          )}
        </div>

        <div className="border-b border-white/15 pb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <SectionTitle className="mb-0">Ring spacing</SectionTitle>
            <Switch
              label="Fixed"
              checked={design.fixedGap}
              onChange={setFixedGap}
              title={
                design.fixedGap
                  ? `Every ring sits ${formatShort(GAP, unit)} from the next; turn off to adjust`
                  : `Turn on to use the default ${formatShort(GAP, unit)} spacing`
              }
            />
          </div>
          {design.fixedGap ? (
            <p className="text-[11px] text-white/60">
              {formatShort(GAP, unit)} between every ring, the default clearance for printing in place.
            </p>
          ) : (
            <>
              <NumberField value={gap} min={gaps.min} max={gaps.max} step={0.05} unit={unit} onChange={setGap} />
              <input
                type="range"
                min={gaps.min}
                max={gaps.max}
                step={0.01}
                value={gap}
                onChange={(e) => setGap(parseFloat(e.target.value))}
                className="mt-3 w-full"
              />
              <p className="mt-1.5 text-[11px] text-white/60">Applies between every ring.</p>
              <button
                aria-expanded={spacingPreview}
                onClick={() => setSpacingPreview(!spacingPreview)}
                className={`mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded text-xs transition ${
                  spacingPreview ? 'bg-white text-neutral-700' : 'bg-black/20 hover:bg-white/15'
                }`}
              >
                <Eye size={14} />
                Preview
                {spacingPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {spacingPreview && <SpacingPreview design={design} specs={specs} gap={gap} unit={unit} />}
            </>
          )}
        </div>

        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-3 rounded-full border border-white/80" style={{ background: colorOf(design, part) }} />
          {partName(design, part)}
        </h3>

        {!design.limited && (
          <p className="text-[11px] text-white/60">
            Limit off — sizes outside the usual range may not fit a finger or print well.
          </p>
        )}

        {ring < 0 && (
          <p className="text-xs text-white/70">
            The inner fill always fits the inner ring's socket. Select the inner ring to change the inner diameter.
          </p>
        )}

        {isInnerRing && (
          <div>
            <SectionTitle>Inner diameter</SectionTitle>
            <NumberField
              value={design.innerDiameter}
              min={diameters.min}
              max={diameters.max}
              unit={unit}
              onChange={(v) => onDiameterChange(clampDiameter(v))}
            />
            <input
              type="range"
              min={diameters.min}
              max={diameters.max}
              step={0.1}
              value={design.innerDiameter}
              onChange={(e) => onDiameterChange(clampDiameter(parseFloat(e.target.value)))}
              className="mt-3 w-full"
            />
            <label className="mt-2 flex items-center justify-between gap-2 text-xs text-white/80">
              US ring size
              <select
                value=""
                onChange={(e) => e.target.value && onDiameterChange(clampDiameter(usSizeToDiameter(parseFloat(e.target.value))))}
                className="rounded bg-black/25 px-2 py-1 text-white outline-none"
              >
                <option value="">{formatUsSize(design.innerDiameter)}</option>
                {US_SIZES.map((s) => (
                  <option key={s} value={s} className="text-black">
                    {s} — {formatLength(usSizeToDiameter(s), unit)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {ring >= 0 && (
          <>
            <div>
              <SectionTitle>Thickness</SectionTitle>
              <NumberField
                value={+wall.toFixed(2)}
                min={range.min}
                max={range.max}
                unit={unit}
                onChange={(v) => onWallChange(ring, unit === 'mm' ? v : snapMm(v, unit))}
              />
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={0.1}
                value={wall}
                onChange={(e) => onWallChange(ring, parseFloat(e.target.value))}
                className="mt-3 w-full"
              />
            </div>
            <div>
              <SectionTitle>Outer diameter</SectionTitle>
              <NumberField
                value={round1(spec.outer.radius * 2)}
                min={round1((start + range.min) * 2)}
                max={round1((start + range.max) * 2)}
                unit={unit}
                onChange={setOuterDiameter}
              />
              <p className="mt-1.5 text-[11px] text-white/60">
                {outermost
                  ? 'Measured across the widest point of the rounded outside.'
                  : `Rings outside this one move out with it, keeping ${formatShort(gap, unit)} clearance.`}
              </p>
            </div>
          </>
        )}
        </div>
        )}
      </aside>
      <aside className="pointer-events-auto flex shrink-0 flex-col overflow-hidden rounded-md bg-panel text-white shadow-lg backdrop-blur-sm">
        <h2 className="flex shrink-0 items-center gap-3 py-2 pr-2 pl-4 text-sm">
          <PrinterIcon size={16} />
          Print bed
          <CollapseButton open={bedOpen} onToggle={() => setBedOpen(!bedOpen)} />
        </h2>
        {bedOpen && (
        <div className="space-y-3 border-t border-white/15 p-4">
          <label className="flex items-center justify-between gap-2 text-xs text-white/80">
            Printer
            <select
              value={printer.id}
              onChange={(e) => setPrinterId(e.target.value)}
              className="min-w-0 rounded bg-black/25 px-2 py-1 text-white outline-none"
            >
              {PRINTERS.map((p) => (
                <option key={p.id} value={p.id} className="text-black">
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-white/60">
            Build volume {formatBed(printer.bed.x, printer.bed.y, unit)} × {formatShort(printer.bed.z, unit)} tall.
            Scroll or pinch on the drawing to zoom.
          </p>
          <div className="flex items-center gap-2">
            <StepButton label="Zoom out" onClick={() => zoomTo(view * ZOOM_STEP)}>
              <ZoomOut size={14} />
            </StepButton>
            <StepButton label="Zoom in" onClick={() => zoomTo(view / ZOOM_STEP)}>
              <ZoomIn size={14} />
            </StepButton>
            <button
              onClick={() => setZoomView(null)}
              className="h-8 flex-1 rounded bg-black/20 text-xs transition hover:bg-white/15"
            >
              Fit ring
            </button>
            <button
              onClick={() => zoomTo(bedView)}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded bg-black/20 text-xs transition hover:bg-white/15"
            >
              <Maximize size={12} />
              Fit bed
            </button>
          </div>
        </div>
        )}
      </aside>
      </>,
          panelSlot,
        )}
    </div>
  )
}

/** Chevron at the right of a box's header that shows or hides its body. */
function CollapseButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      title={open ? 'Collapse' : 'Expand'}
      aria-expanded={open}
      onClick={onToggle}
      className="ml-auto grid size-7 place-items-center rounded hover:bg-white/10"
    >
      {open ? <ChevronsUp size={16} /> : <ChevronsDown size={16} />}
    </button>
  )
}

function SectionTitle({ children, className = 'mb-2' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`${className} text-[11px] font-semibold tracking-wider text-white/60 uppercase`}>{children}</h3>
}

export function Switch({
  label,
  checked,
  onChange,
  title,
  className = '',
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  className?: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title={title}
      className={`${className} flex items-center gap-2 rounded-full py-0.5 pr-0.5 pl-2 text-xs text-white/80 transition hover:bg-white/10`}
    >
      {label}
      <span className={`relative h-4 w-7 rounded-full transition ${checked ? 'bg-[#3aa5f2]' : 'bg-black/35'}`}>
        <span
          className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-all ${checked ? 'left-3.5' : 'left-0.5'}`}
        />
      </span>
    </button>
  )
}

/** Outline of a part's cross-section through its axis, in (r, z) mm, drawn with z up. */
function sectionPath(spec: RingSpec) {
  const { width } = spec
  const half = width / 2
  const n = 24
  const pts: string[] = []
  for (let i = 0; i <= n; i++) {
    const z = half - (i / n) * width
    pts.push(`${surfaceRadius(spec.outer, z, width)},${-z}`)
  }
  for (let i = 0; i <= n; i++) {
    const z = -half + (i / n) * width
    pts.push(`${surfaceRadius(spec.inner, z, width)},${-z}`)
  }
  return `M ${pts.join(' L ')} Z`
}

/** Every part cut through the axis, filled with its colour. */
const sectionParts = (design: Design, specs: RingSpec[]) =>
  specs.map((spec, i) => <path key={i} d={sectionPath(spec)} fill={colorOf(design, i)} />)

/**
 * Cut-away of the whole design to scale — the rings seen edge on, so the width reads against the
 * diameter. `children` are drawn over it in the same millimetre coordinates.
 */
function CrossSection({
  design,
  specs,
  className,
  children,
}: {
  design: Design
  specs: RingSpec[]
  className?: string
  children?: React.ReactNode
}) {
  const half = design.width / 2
  const left = (design.filled ? 0 : design.innerDiameter / 2) - 0.6
  const right = specs[specs.length - 1].outer.radius + 0.6
  return (
    <svg
      viewBox={`${left} ${-half - 0.6} ${right - left} ${design.width + 1.2}`}
      className={`${className} rounded-sm bg-[#5c5c5c]`}
    >
      <g stroke="rgb(0 0 0 / 0.35)" strokeWidth={0.05}>
        {sectionParts(design, specs)}
      </g>
      {children}
    </svg>
  )
}

/**
 * Cut-away of every ring to scale, plus a close-up of the first gap at the mid-plane,
 * so the spacing can be judged before committing to it.
 */
function SpacingPreview({ design, specs, gap, unit }: { design: Design; specs: RingSpec[]; gap: number; unit: Unit }) {
  // Close-up window centred on the first gap, wide enough to show a ring either side.
  const gapStart = specs[0].outer.radius
  const zoomW = Math.max(1.6, gap * 5)
  const zoomH = Math.min(zoomW * 0.45, design.width)
  const zoomX = gapStart + gap / 2 - zoomW / 2
  const zoomY = -zoomH / 2
  const px = zoomW / 100 // one hundredth of the close-up's width, for strokes and text

  return (
    <div className="mt-3 space-y-2 rounded bg-black/20 p-2">
      <div className="text-[10px] tracking-wider text-white/60 uppercase">Cross-section</div>
      <CrossSection design={design} specs={specs} className="max-h-40 w-full">
        <rect
          x={zoomX}
          y={zoomY}
          width={zoomW}
          height={zoomH}
          fill="none"
          stroke={HANDLE_COLOR}
          strokeWidth={0.08}
          strokeDasharray="0.25 0.15"
        />
      </CrossSection>
      <div className="text-[10px] tracking-wider text-white/60 uppercase">Close-up</div>
      <svg viewBox={`${zoomX} ${zoomY} ${zoomW} ${zoomH}`} className="w-full rounded-sm bg-[#5c5c5c]">
        <defs>
          <marker id="gap-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={HANDLE_COLOR} />
          </marker>
        </defs>
        <g stroke="rgb(0 0 0 / 0.35)" strokeWidth={px * 0.4}>
          {sectionParts(design, specs)}
        </g>
        <line
          x1={gapStart}
          y1={0}
          x2={gapStart + gap}
          y2={0}
          stroke={HANDLE_COLOR}
          strokeWidth={px * 0.8}
          markerStart="url(#gap-arrow)"
          markerEnd="url(#gap-arrow)"
        />
        <g transform={`translate(${gapStart + gap / 2} ${-zoomH * 0.22})`}>
          <rect x={-px * 13} y={-px * 3.6} width={px * 26} height={px * 6} rx={px * 3} fill="rgb(0 0 0 / 0.6)" />
          <text y={px * 1.3} textAnchor="middle" fontSize={px * 4} fill="#fff">
            {formatShort(gap, unit)}
          </text>
        </g>
      </svg>
      <p className="text-[11px] text-white/60">
        Tighter spacing wobbles less but can fuse when printed; wider spacing spins freely but rattles.
      </p>
    </div>
  )
}

/**
 * Stepper + number box. `value`, `min`, `max`, `step` and `onChange` are in mm; the box shows `unit`.
 * Typing keeps a draft so partial values like "1" aren't clamped mid-entry.
 */
function NumberField({
  value,
  min,
  max,
  step: stepMm,
  unit,
  onChange,
}: {
  value: number
  min: number
  max: number
  /** Stepper increment in mm; defaults to the unit's usual step. */
  step?: number
  unit: Unit
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const step = stepMm ?? fromUnit(STEP[unit], unit)
  const shown = unit === 'mm' ? value : +toUnit(value, unit).toFixed(3)
  return (
    <div className="flex items-center gap-2">
      <StepButton label="Decrease" onClick={() => onChange(clamp(value - step))}>
        <Minus size={14} />
      </StepButton>
      <label className="flex flex-1 items-baseline justify-center gap-1 rounded bg-black/20 px-2 py-1.5">
        <input
          type="number"
          min={+toUnit(min, unit).toFixed(3)}
          max={+toUnit(max, unit).toFixed(3)}
          step={STEP[unit]}
          value={draft ?? shown}
          onChange={(e) => {
            setDraft(e.target.value)
            const v = fromUnit(parseFloat(e.target.value), unit)
            if (!Number.isNaN(v) && v >= min && v <= max) onChange(v)
          }}
          onBlur={() => {
            const v = fromUnit(parseFloat(draft ?? ''), unit)
            if (draft !== null && !Number.isNaN(v)) onChange(clamp(v))
            setDraft(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-16 bg-transparent text-right text-lg font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-sm text-white/70">{unit}</span>
      </label>
      <StepButton label="Increase" onClick={() => onChange(clamp(value + step))}>
        <Plus size={14} />
      </StepButton>
    </div>
  )
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded bg-black/20 transition hover:bg-white/15"
    >
      {children}
    </button>
  )
}
