import {
  clampDiameter,
  clampGap,
  clampWall,
  computeRingSpecs,
  GAP,
  INNER_RING_WALL,
  RING_WALL,
  TEXTURE_DEPTHS,
  TEXTURES,
  type Texture,
  type TextureDepth,
} from './ring'

export const PALETTE = [
  '#FFFFFF', '#FDE74C', '#D4ED6B', '#00C04B', '#006B3F', '#005A7A',
  '#00D9A0', '#6ADCF2', '#3AA5F2', '#2350D9', '#3B2D7A', '#9B3BEB',
  '#F52AF0', '#D0A8D8', '#FF4F6A', '#FF1020', '#6E3B12', '#FF8036',
  '#FCE4D4', '#CDBB96', '#A96B32', '#7A7A7A', '#B0B0B0', '#1A1A1A',
]

export interface Design {
  innerDiameter: number
  /** One colour per part, innermost first; the inner fill, when present, is index 0. */
  colors: string[]
  /** A solid core fills the centre instead of leaving a finger hole. */
  filled: boolean
  texture: Texture
  /** How deep the outer texture cuts in — deeper is easier to feel on a print. */
  textureDepth: TextureDepth
  /** Wall thickness of each ring at its widest, innermost first (the fill has none). */
  walls: number[]
  /** Keeps the inner diameter and thicknesses within the usual range; off allows any size the geometry supports. */
  limited: boolean
  /** Every ring sits the default clearance from the next; off uses `gap` instead. */
  fixedGap: boolean
  /** Custom clearance between every pair of rings, in mm — kept while spacing is fixed so it comes back. */
  gap: number
}

export const MIN_RINGS = 2
export const MAX_RINGS = 5

export const DEFAULT_DESIGN: Design = {
  innerDiameter: 18,
  colors: ['#FF8036', '#2350D9'],
  filled: false,
  texture: 'smooth',
  textureDepth: 'medium',
  walls: [INNER_RING_WALL, RING_WALL],
  limited: true,
  fixedGap: true,
  gap: GAP,
}

export const ringCountOf = (design: Design) => design.colors.length - (design.filled ? 1 : 0)

/** Clearance between rings in use: the default while fixed, otherwise the custom spacing. */
export const gapOf = (design: Design) => (design.fixedGap ? GAP : design.gap)

export const specsOf = (design: Design) =>
  computeRingSpecs(design.walls, design.innerDiameter, design.filled, design.limited, gapOf(design))

/** Ring index (innermost = 0) of part `index`, or -1 for the inner fill. */
export const ringOfPart = (design: Design, index: number) => index - (design.filled ? 1 : 0)

/**
 * Re-clamps the inner diameter and every wall, e.g. after the bore, fill or ring order changes what
 * the inner ring allows, or the size limit is turned back on.
 */
export const withValidWalls = (design: Design): Design => {
  const innerDiameter = clampDiameter(design.innerDiameter, design.limited)
  return {
    ...design,
    innerDiameter,
    walls: design.walls.map((w, i) => clampWall(w, i, innerDiameter, design.filled, design.limited)),
    gap: clampGap(design.gap, innerDiameter, design.filled, design.limited),
  }
}

/** Colour for part `index` (innermost = 0). */
export const colorOf = (design: Design, index: number) =>
  design.colors[Math.min(index, design.colors.length - 1)]

/** "Inner fill", "Inner ring", or "Outer ring N" — every ring around the inner one, numbered from 1 inside out. */
export function partName(design: Design, index: number): string {
  const ring = ringOfPart(design, index)
  if (ring < 0) return 'Inner fill'
  return ring === 0 ? 'Inner ring' : `Outer ring ${ring}`
}

export type LayerKind = 'outer' | 'inner' | 'fill'

/** Index (innermost = 0) of the outer ring, inner ring or fill. */
export const layerIndex = (design: Design, kind: LayerKind) =>
  kind === 'outer' ? design.colors.length - 1 : kind === 'inner' && design.filled ? 1 : 0

/** Layers as shown in the Layers box: outermost first. */
export function layersOf(design: Design) {
  const canRemoveRing = ringCountOf(design) > MIN_RINGS
  return design.colors
    .map((color, index) => {
      const kind = (['fill', 'outer', 'inner'] as const).find(
        (k) => (k !== 'fill' || design.filled) && layerIndex(design, k) === index,
      )
      return {
        index,
        color,
        kind,
        name: partName(design, index),
        deletable: kind === 'fill' || (kind !== undefined && canRemoveRing),
      }
    })
    .reverse()
}

export const canAddLayer = (design: Design, kind: LayerKind) =>
  kind === 'fill' ? !design.filled : ringCountOf(design) < MAX_RINGS

export function removeLayer(design: Design, kind: LayerKind): Design {
  if (kind === 'fill' ? !design.filled : ringCountOf(design) <= MIN_RINGS) return design
  const removed = layerIndex(design, kind)
  return withValidWalls({
    ...design,
    colors: design.colors.filter((_, i) => i !== removed),
    filled: design.filled && kind !== 'fill',
    walls: kind === 'fill' ? design.walls : design.walls.filter((_, i) => i !== ringOfPart(design, removed)),
  })
}

// Existing rings keep their thickness as layers come and go; new ones get the default.
export function addLayer(design: Design, kind: LayerKind): Design {
  if (!canAddLayer(design, kind)) return design
  const next = { ...design, filled: design.filled || kind === 'fill', colors: [...design.colors], walls: [...design.walls] }
  const at = kind === 'outer' ? design.colors.length : layerIndex(next, kind)
  next.colors.splice(at, 0, PALETTE.find((c) => !design.colors.includes(c)) ?? PALETTE[0])
  if (kind === 'outer') next.walls.push(RING_WALL)
  if (kind === 'inner') next.walls.unshift(INNER_RING_WALL)
  return withValidWalls(next)
}

const STORAGE_KEY = 'fidget-ring-maker:design'

/** Checks a stored design, returning null if it isn't a usable one. */
function parseDesign(parsed: unknown): Design | null {
  try {
    if (typeof parsed !== 'object' || parsed === null) return null
    const stored = parsed as Partial<Design> & { ringCount?: number }
    const design: Design = {
      innerDiameter: stored.innerDiameter ?? DEFAULT_DESIGN.innerDiameter,
      colors: stored.colors ?? DEFAULT_DESIGN.colors,
      filled: stored.filled ?? DEFAULT_DESIGN.filled,
      texture: stored.texture ?? DEFAULT_DESIGN.texture,
      // Designs from before texture depth used the light depth.
      textureDepth: TEXTURE_DEPTHS.some((d) => d.id === stored.textureDepth)
        ? (stored.textureDepth as TextureDepth)
        : 'light',
      walls: stored.walls ?? [],
      // Designs from before the size limit toggle were always limited.
      limited: stored.limited !== false,
      // Designs from before adjustable spacing always used the default clearance.
      fixedGap: stored.fixedGap !== false,
      gap: typeof stored.gap === 'number' && Number.isFinite(stored.gap) ? stored.gap : GAP,
    }
    const { ringCount } = stored
    if (!Array.isArray(design.colors) || !design.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))) return null
    // Older saves kept [inner, middle, outer] alongside a ring count, even with 2 rings.
    if (ringCount === 2 && design.colors.length === 3) design.colors = [design.colors[0], design.colors[2]]
    const rings = ringCountOf(design)
    if (rings < MIN_RINGS || rings > MAX_RINGS) return null
    if (typeof design.innerDiameter !== 'number' || !Number.isFinite(design.innerDiameter)) return null
    if (!TEXTURES.some((t) => t.id === design.texture)) design.texture = DEFAULT_DESIGN.texture
    design.filled = design.filled === true
    // Designs from before adjustable thickness used the default walls.
    const walls = Array.isArray(design.walls) ? design.walls : []
    design.walls = Array.from({ length: ringCountOf(design) }, (_, i) =>
      typeof walls[i] === 'number' && Number.isFinite(walls[i]) ? walls[i] : i === 0 ? INNER_RING_WALL : RING_WALL,
    )
    return withValidWalls(design)
  } catch {
    return null
  }
}

export function loadDesign(): Design {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return parseDesign(JSON.parse(raw)) ?? DEFAULT_DESIGN
  } catch {
    // storage unavailable or corrupt — fall back to defaults
  }
  return DEFAULT_DESIGN
}

/** "Fidget Maker" project file — a general format, not specific to rings. */
export const PROJECT_EXTENSION = '.fm.json'
const PROJECT_FORMAT = 'fidget-maker'
/** Format tag written by earlier saves; still accepted when opening. */
const LEGACY_PROJECT_FORMATS = ['fidget-ring-maker']

export function serializeProject(design: Design): string {
  return JSON.stringify({ format: PROJECT_FORMAT, version: 1, design }, null, 2)
}

/** Reads a project file's contents, returning null if it isn't a valid project. */
export function parseProject(raw: string): Design | null {
  try {
    const parsed = JSON.parse(raw)
    const format = parsed?.format
    const known = format === PROJECT_FORMAT || LEGACY_PROJECT_FORMATS.includes(format)
    return known ? parseDesign(parsed.design) : null
  } catch {
    return null
  }
}

export function saveDesign(design: Design) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(design))
  } catch {
    // ignore
  }
}
