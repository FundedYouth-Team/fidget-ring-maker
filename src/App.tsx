import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { Designer2D } from './components/Designer2D'
import { ExportCard, type ExportFormat } from './components/ExportCard'
import { LayersCard } from './components/LayersCard'
import { Toolbar } from './components/Toolbar'
import { Viewer3D, type ViewName, type ViewRequest } from './components/Viewer3D'
import {
  addLayer,
  colorOf,
  DEFAULT_DESIGN,
  gapOf,
  layerIndex,
  loadDesign,
  parseProject,
  partName,
  PROJECT_EXTENSION,
  removeLayer,
  ringCountOf,
  saveDesign,
  serializeProject,
  withValidWalls,
  type Design,
  type LayerKind,
} from './lib/design'
import { build3mf, buildStl, buildStlZip, downloadBlob } from './lib/export'
import { buildRingGeometries, computeRingSpecs, stlByteSize } from './lib/ring'
import { loadUnit, saveUnit, type Unit } from './lib/units'

export default function App() {
  const [design, setDesign] = useState<Design>(loadDesign)
  const [unit, setUnit] = useState<Unit>(loadUnit)
  useEffect(() => saveUnit(unit), [unit])
  const [selectedLayer, setSelectedLayer] = useState(() => loadDesign().colors.length - 1)
  const [mode, setMode] = useState<'2d' | '3d'>('3d')
  const [viewRequest, setViewRequest] = useState<ViewRequest>({ view: 'home', nonce: 0 })
  const [resetNonce, setResetNonce] = useState(0)
  const [sizingSlot, setSizingSlot] = useState<HTMLDivElement | null>(null)

  useEffect(() => saveDesign(design), [design])

  // Textured meshes take a moment to build; defer so 2D dragging stays smooth.
  const deferred = useDeferredValue(design)
  const { innerDiameter, texture, filled, walls, limited } = deferred
  const gap = gapOf(deferred)
  const ringCount = ringCountOf(deferred)
  const geometries = useMemo(
    () => buildRingGeometries(computeRingSpecs(walls, innerDiameter, filled, limited, gap), texture),
    [walls, innerDiameter, filled, limited, gap, texture],
  )
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])

  const update = useCallback((patch: Partial<Design>) => setDesign((d) => ({ ...d, ...patch })), [])
  const setDiameter = (diameter: number) => setDesign((d) => withValidWalls({ ...d, innerDiameter: diameter }))
  const setWall = (ring: number, wall: number) =>
    setDesign((d) => withValidWalls({ ...d, walls: d.walls.map((w, i) => (i === ring ? wall : w)) }))
  const setLimited = (limited: boolean) => setDesign((d) => withValidWalls({ ...d, limited }))
  const setSpacing = (patch: Pick<Partial<Design>, 'fixedGap' | 'gap'>) =>
    setDesign((d) => withValidWalls({ ...d, ...patch }))

  // Keep the same part selected as layers come and go; if it was deleted, select its neighbour.
  const removePart = (kind: LayerKind) => {
    const next = removeLayer(design, kind)
    if (next === design) return
    const removed = layerIndex(design, kind)
    setDesign(next)
    setSelectedLayer((s) => (s > removed ? s - 1 : Math.min(s, next.colors.length - 1)))
  }
  const addPart = (kind: LayerKind) => {
    const next = addLayer(design, kind)
    if (next === design) return
    setDesign(next)
    setSelectedLayer(layerIndex(next, kind))
  }
  // Switching the inner ring between standard and fill keeps the same part selected.
  const setFilled = (filled: boolean) => {
    const next = filled ? addLayer(design, 'fill') : removeLayer(design, 'fill')
    if (next === design) return
    setDesign(next)
    setSelectedLayer((s) => (filled ? s + 1 : Math.max(s - 1, 0)))
  }

  const replaceDesign = (next: Design) => {
    setDesign(next)
    setSelectedLayer(next.colors.length - 1)
    setResetNonce((n) => n + 1)
    showView('home')
  }

  const newProject = () => {
    if (!window.confirm('Start a new project? Your current design will be replaced.')) return
    replaceDesign(DEFAULT_DESIGN)
  }

  const fileInput = useRef<HTMLInputElement>(null)
  const openProject = async (file: File) => {
    const opened = parseProject(await file.text())
    if (!opened) {
      window.alert(`"${file.name}" isn't a Fidget Maker project (${PROJECT_EXTENSION}).`)
      return
    }
    replaceDesign(opened)
  }

  const saveProject = () => {
    const blob = new Blob([serializeProject(design)], { type: 'application/json' })
    downloadBlob(blob, `fidget-ring-${ringCountOf(design)}x-${design.innerDiameter.toFixed(1)}mm${PROJECT_EXTENSION}`)
  }

  const exportModel = (format: ExportFormat) => {
    const names = geometries.map((_, i) => partName(deferred, i))
    const blob =
      format === 'stl'
        ? buildStl(geometries)
        : format === 'stl-zip'
          ? buildStlZip(geometries, names)
          : build3mf(
              geometries,
              geometries.map((_, i) => colorOf(deferred, i)),
              names,
            )
    const name = `fidget-ring-${ringCount}x${filled ? '-filled' : ''}-${innerDiameter.toFixed(1)}mm-${texture}`
    downloadBlob(blob, `${name}${format === 'stl-zip' ? '-stl.zip' : `.${format}`}`)
  }

  const showView = (view: ViewName) => setViewRequest((r) => ({ view, nonce: r.nonce + 1 }))

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-stage select-none">
      <div className={mode === '3d' ? 'absolute inset-0' : 'hidden'}>
        <Viewer3D
          design={design}
          geometries={geometries}
          viewRequest={viewRequest}
          resetNonce={resetNonce}
          active={mode === '3d'}
        />
      </div>
      {mode === '2d' && (
        <Designer2D
          design={design}
          unit={unit}
          selectedLayer={selectedLayer}
          onSelectLayer={setSelectedLayer}
          onDiameterChange={setDiameter}
          onWallChange={setWall}
          onLimitedChange={setLimited}
          onSpacingChange={setSpacing}
          panelSlot={sizingSlot}
        />
      )}

      <div className="absolute top-4 left-4 flex flex-col items-start gap-3">
        <ExportCard
          design={design}
          stlByteSize={stlByteSize(geometries)}
          onExport={exportModel}
          onNew={newProject}
          onOpen={() => fileInput.current?.click()}
          onSave={saveProject}
        />
        <input
          ref={fileInput}
          type="file"
          accept={`${PROJECT_EXTENSION},.json,application/json`}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // allow reopening the same file
            if (file) openProject(file)
          }}
        />
        <LayersCard
          design={design}
          selected={selectedLayer}
          onSelect={setSelectedLayer}
          onRemove={removePart}
          onAdd={addPart}
          onSetFilled={setFilled}
        />
      </div>
      {/* Design box, with the 2D sizing panel below it; the two share the height and scroll. */}
      <div className="pointer-events-none absolute top-4 right-4 bottom-20 flex w-[min(300px,calc(100%-2rem))] flex-col gap-3">
        <ControlPanel
          design={design}
          onChange={update}
          unit={unit}
          mode={mode}
          onModeChange={setMode}
          selectedLayer={selectedLayer}
        />
        <div ref={setSizingSlot} className="flex min-h-0 flex-col gap-3" />
      </div>
      <Toolbar
        mode={mode}
        onModeChange={setMode}
        unit={unit}
        onUnitChange={setUnit}
        onReset={() => {
          setResetNonce((n) => n + 1)
          showView('home')
        }}
        onView={showView}
      />
      {mode === '3d' && (
        <p className="pointer-events-none absolute bottom-20 left-1/2 hidden -translate-x-1/2 text-xs whitespace-nowrap text-neutral-500 sm:block">
          Drag the outer ring to rotate · drag an inner ring to spin it any direction
        </p>
      )}
    </div>
  )
}
