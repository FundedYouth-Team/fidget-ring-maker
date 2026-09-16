import * as THREE from 'three'

/*
 * Ring geometry, measured from the reference `_stl/Fidget+Ring.stl`:
 *  - every ring is 8.5mm wide by default (the reference is 10mm), and the whole design shares one width
 *  - 0.3mm clearance between rings by default (the reference is 0.2mm)
 *  - the surfaces where rings meet are spheres centred on the ring, so an
 *    inner ring can tumble in any direction without colliding with its host
 *  - the outer ring's outside is an arc crowning a tenth of the width (a 13mm
 *    radius, 1mm crown, at a 10mm width)
 *  - an optional inner fill is a solid core with a spherical outside, held by a
 *    spherical bore whose opening on each face stays at the inner diameter
 * Rings are built around the Z axis, with z in [-width / 2, width / 2].
 */

/** Default ring width, face to face. */
export const RING_WIDTH = 8.5
export const MIN_WIDTH = 4
export const MAX_WIDTH = 20
/** Default clearance between rings, used while ring spacing is fixed. */
export const GAP = 0.3
const MIN_GAP = 0.1
const MAX_GAP = 1
/** Default wall thickness at the mid-plane: bore → sphere for the inner ring, sphere → sphere for the rest. */
export const INNER_RING_WALL = 2.5
export const RING_WALL = 1.45
/** The original defaults, for opening designs saved before a setting could be changed. */
export const LEGACY_RING_WIDTH = 10
export const LEGACY_GAP = 0.2
export const LEGACY_INNER_RING_WALL = 3.8
export const LEGACY_RING_WALL = 2
export const MAX_WALL = 6
const MIN_WALL = 1.2
/** Thinnest the inner ring's flat face may get where it meets the bore. */
const MIN_FACE = 0.8
/** How far the outer ring's rounded outside crowns past its face edges, as a share of the width. */
const CROWN_SHARE = 0.1
/** Radius of the arc that crowns `crown` over a width — 13 at a 10mm width. */
const roundRadius = (width: number) => {
  const crown = width * CROWN_SHARE
  return ((width / 2) ** 2 + crown * crown) / (2 * crown)
}

export const MIN_DIAMETER = 12
export const MAX_DIAMETER = 30

/*
 * With the size limit turned off, only what the geometry itself needs: walls a
 * nozzle-width thick, a sliver of face on the inner ring, and a bore wide enough
 * that an inner fill still reaches the faces.
 */
const FREE_MIN_DIAMETER = 4
const FREE_MAX_DIAMETER = 200
const FREE_MIN_WALL = 0.4
const FREE_MAX_WALL = 50
const FREE_MIN_FACE = 0.2
const FREE_MIN_GAP = 0.05
const FREE_MAX_GAP = 3
const FREE_MIN_WIDTH = 1
const FREE_MAX_WIDTH = 100

export const diameterRange = (limited: boolean) =>
  limited ? { min: MIN_DIAMETER, max: MAX_DIAMETER } : { min: FREE_MIN_DIAMETER, max: FREE_MAX_DIAMETER }

export const clampDiameter = (diameter: number, limited: boolean) => {
  const { min, max } = diameterRange(limited)
  return Math.min(max, Math.max(min, diameter))
}

export const widthRange = (limited: boolean) =>
  limited ? { min: MIN_WIDTH, max: MAX_WIDTH } : { min: FREE_MIN_WIDTH, max: FREE_MAX_WIDTH }

export const clampWidth = (width: number, limited: boolean) => {
  const { min, max } = widthRange(limited)
  return Math.min(max, Math.max(min, Math.round(width * 1000) / 1000))
}

/** The whole-design measurements every ring's shape is derived from. */
export interface Sizing {
  innerDiameter: number
  filled: boolean
  limited: boolean
  /** Clearance between rings, in mm. */
  gap: number
  /** Ring width from face to face, in mm. */
  width: number
}

export type SurfaceKind = 'cylinder' | 'sphere' | 'rounded'

/** `radius` is the radius at the mid-plane (z = 0). */
export interface Surface {
  kind: SurfaceKind
  radius: number
}

export interface RingSpec {
  inner: Surface
  outer: Surface
  /** Face-to-face width the surfaces were laid out for. */
  width: number
}

export function surfaceRadius(s: Surface, z: number, width: number): number {
  switch (s.kind) {
    case 'cylinder':
      return s.radius
    case 'sphere':
      return Math.sqrt(s.radius * s.radius - z * z)
    case 'rounded': {
      const round = roundRadius(width)
      return s.radius + Math.sqrt(round * round - z * z) - round
    }
  }
}

export const edgeRadius = (s: Surface, width: number) => surfaceRadius(s, width / 2, width)

/**
 * Thickness limits for ring `ring` (innermost = 0). The inner ring's outer sphere
 * curves in towards the faces, so a thin wall on a small bore would leave no flat
 * face at all — and with a fill, the socket also thins the wall at the mid-plane.
 * A wider ring bulges its sphere further, so it needs a thicker wall still.
 * `limited` false lifts the usual limits down to what the geometry needs.
 */
export function wallRange(ring: number, { innerDiameter, filled, limited, width }: Sizing) {
  const minWall = limited ? MIN_WALL : FREE_MIN_WALL
  const maxWall = limited ? MAX_WALL : FREE_MAX_WALL
  if (ring > 0) return { min: minWall, max: maxWall }
  const half = width / 2
  const bore = innerDiameter / 2
  let min = Math.max(minWall, Math.hypot(bore + (limited ? MIN_FACE : FREE_MIN_FACE), half) - bore)
  if (filled) min = Math.max(min, Math.hypot(bore, half) + minWall - bore)
  min = Math.ceil(min * 10) / 10
  return { min, max: Math.max(min, maxWall) }
}

export const clampWall = (wall: number, ring: number, sizing: Sizing) => {
  const { min, max } = wallRange(ring, sizing)
  return Math.min(max, Math.max(min, Math.round(wall * 1000) / 1000))
}

/**
 * Clearance limits between rings. With a fill, the gap also comes off the core's
 * sphere, so it can't grow so wide that the core's faces shrink below 1 mm radius.
 */
export function gapRange({ innerDiameter, filled, limited, width }: Sizing) {
  const min = limited ? MIN_GAP : FREE_MIN_GAP
  let max = limited ? MAX_GAP : FREE_MAX_GAP
  const half = width / 2
  if (filled) max = Math.min(max, Math.floor((Math.hypot(innerDiameter / 2, half) - Math.hypot(1, half)) * 100) / 100)
  return { min, max: Math.max(min, max) }
}

export const clampGap = (gap: number, sizing: Sizing) => {
  const { min, max } = gapRange(sizing)
  return Math.min(max, Math.max(min, Math.round(gap * 1000) / 1000))
}

/**
 * Specs ordered innermost → outermost, with the inner fill (if any) first.
 * A fill has an inner radius of 0. `walls` holds each ring's thickness at the
 * mid-plane, innermost first; each ring starts one `gap` outside the last.
 */
export function computeRingSpecs(walls: number[], sizing: Sizing): RingSpec[] {
  const { innerDiameter, filled, width } = sizing
  const bore = innerDiameter / 2
  const socket = Math.hypot(bore, width / 2) // sphere meeting the faces at the bore
  const clearance = clampGap(sizing.gap, sizing)
  const specs: RingSpec[] = []
  if (filled) {
    specs.push({ inner: { kind: 'cylinder', radius: 0 }, outer: { kind: 'sphere', radius: socket - clearance }, width })
  }
  let sphere = 0
  walls.forEach((w, i) => {
    const wall = clampWall(w, i, sizing)
    const start = i === 0 ? bore : sphere + clearance
    const inner: Surface =
      i > 0 ? { kind: 'sphere', radius: start } : filled ? { kind: 'sphere', radius: socket } : { kind: 'cylinder', radius: bore }
    sphere = start + wall
    specs.push({ inner, outer: { kind: i === walls.length - 1 ? 'rounded' : 'sphere', radius: sphere }, width })
  })
  return specs
}

/** Radius at the mid-plane of the surface whose face-edge radius is `edge` — inverse of `edgeRadius`. */
export function radiusFromEdge(kind: SurfaceKind, edge: number, width: number): number {
  const half = width / 2
  switch (kind) {
    case 'cylinder':
      return edge
    case 'sphere':
      return Math.hypot(edge, half)
    case 'rounded': {
      const round = roundRadius(width)
      return edge + round - Math.sqrt(round * round - half * half)
    }
  }
}

export const outerDiameter = (specs: RingSpec[]) => specs[specs.length - 1].outer.radius * 2

// ---------------------------------------------------------------------------
// Outer textures

export type Texture =
  | 'smooth'
  | 'knurled'
  | 'knurl-inset'
  | 'ribbed'
  | 'spiral-flutes'
  | 'grooved'
  | 'wave'
  | 'hammered'
  | 'dimples'
  | 'dragon-scale'
  | 'honeycomb'
  | 'triangles'
  | 'squares'
  | 'rectangles'
  | 'herringbone'
  | 'chevron'

export const TEXTURES: { id: Texture; label: string }[] = [
  { id: 'smooth', label: 'Smooth' },
  { id: 'knurled', label: 'Knurled' },
  { id: 'knurl-inset', label: 'Knurl Inset' },
  { id: 'ribbed', label: 'Ribbed' },
  { id: 'spiral-flutes', label: 'Spiral Flutes' },
  { id: 'grooved', label: 'Grooved' },
  { id: 'wave', label: 'Wave' },
  { id: 'hammered', label: 'Hammered' },
  { id: 'dimples', label: 'Dimples' },
  { id: 'dragon-scale', label: 'Dragon Scale' },
  { id: 'honeycomb', label: 'Honeycomb' },
  { id: 'triangles', label: 'Triangles' },
  { id: 'squares', label: 'Squares' },
  { id: 'rectangles', label: 'Rectangles' },
  { id: 'herringbone', label: 'Herringbone' },
  { id: 'chevron', label: 'Chevron' },
]

export type TextureDepth = 'light' | 'medium' | 'deep'

/** How far the outer texture cuts in, in mm. Light is the original depth. */
export const TEXTURE_DEPTHS: { id: TextureDepth; label: string; depth: number }[] = [
  { id: 'light', label: 'Light', depth: 0.35 },
  { id: 'medium', label: 'Medium', depth: 0.7 },
  { id: 'deep', label: 'Deep', depth: 1.05 },
]

const DEPTH = 0.35
/** Deepest cut as a share of the outer ring's wall, so a thin ring keeps enough material. */
const MAX_DEPTH_SHARE = 0.55

/** Depth (mm) the texture actually cuts into `spec`: the chosen depth, capped by the wall. */
export const textureDepthMm = (spec: RingSpec, textureDepth: TextureDepth) =>
  Math.min(
    TEXTURE_DEPTHS.find((d) => d.id === textureDepth)?.depth ?? DEPTH,
    (spec.outer.radius - spec.inner.radius) * MAX_DEPTH_SHARE,
  )
const TAU = Math.PI * 2
const frac = (x: number) => x - Math.floor(x)
const tri = (x: number) => 1 - Math.abs(2 * frac(x) - 1) // 0 at integers, 1 at halves
const hash = (i: number, j: number) => frac(Math.sin(i * 127.1 + j * 311.7) * 43758.5453)
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** Distance from x to the nearest integer. */
const dint = (x: number) => Math.abs(x - Math.round(x))
/** 1 at the centre of a groove of half-width `hw` (mm), 0 outside it. */
const groove = (d: number, hw: number) => smoothstep(hw, hw * 0.35, d)
const HEX_ROW = Math.sqrt(3) / 2

/**
 * Distances (in cell units) from (x, y) to the two nearest points of a triangular
 * lattice with unit spacing, rows offset by half a cell. x wraps every whole cell.
 */
function hexNearest(x: number, y: number): [number, number] {
  let d1 = Infinity
  let d2 = Infinity
  const k = Math.round(y / HEX_ROW)
  for (let row = k - 1; row <= k + 1; row++) {
    const offset = (row & 1) * 0.5
    const c = Math.round(x - offset)
    for (let col = c - 1; col <= c + 1; col++) {
      const d = Math.hypot(x - col - offset, y - row * HEX_ROW)
      if (d < d1) [d1, d2] = [d, d1]
      else if (d < d2) d2 = d
    }
  }
  return [d1, d2]
}

/** Radial offset (≤ 0, mm) cut into the outer surface, at most `depth` deep. */
function displacement(texture: Texture, theta: number, z: number, radius: number, depth: number): number {
  const circumference = TAU * radius
  const u = theta / TAU // 0..1 around the ring
  // Deeper grooves also get wider, so they stay wider than a nozzle all the way down.
  const widen = Math.sqrt(Math.max(1, depth / DEPTH))
  const cut = (d: number, hw: number) => groove(d, hw * widen)
  switch (texture) {
    case 'smooth':
      return 0
    case 'knurled': {
      const n = Math.round(circumference / 1.2)
      const a = u * n + z / (circumference / n)
      const b = u * n - z / (circumference / n)
      return -depth * (1 - Math.min(tri(a), tri(b)))
    }
    case 'knurl-inset': {
      // Knurled turned inside out: diamond pockets instead of diamond peaks.
      const n = Math.round(circumference / 1.6)
      const a = u * n + z / (circumference / n)
      const b = u * n - z / (circumference / n)
      return -depth * Math.min(tri(a), tri(b))
    }
    case 'ribbed': {
      const n = Math.round(circumference / 1.5)
      return -depth * (0.5 + 0.5 * Math.cos(TAU * u * n)) ** 3
    }
    case 'spiral-flutes': {
      const n = Math.round(circumference / 2)
      const a = u * n + (z / (circumference / n)) * 0.6
      return -depth * (0.5 + 0.5 * Math.cos(TAU * a)) ** 3
    }
    case 'dimples': {
      const n = Math.round(circumference / 2.2)
      const [d] = hexNearest(u * n, z / (circumference / n))
      const v = 1 - (d / 0.42) ** 2
      return v > 0 ? -depth * Math.sqrt(v) : 0
    }
    case 'dragon-scale': {
      // Overlapping scales, each row tucked under the one above it; a scale rises to its rim.
      const n = Math.round(circumference / 3)
      const x = u * n
      const y = z / (circumference / n)
      const R = 0.62
      const rowH = 0.5
      for (let row = Math.ceil((y + R) / rowH); row >= Math.floor((y - R) / rowH); row--) {
        const offset = (row & 1) * 0.5
        const c = Math.round(x - offset)
        let d = Infinity
        for (let col = c - 1; col <= c + 1; col++) d = Math.min(d, Math.hypot(x - col - offset, y - row * rowH))
        if (d < R) return -depth * (1 - d / R)
      }
      return -depth
    }
    case 'honeycomb': {
      const n = Math.round(circumference / 2.6)
      const cell = circumference / n
      const [d1, d2] = hexNearest(u * n, z / cell)
      return -depth * cut(((d2 * d2 - d1 * d1) / 2) * cell, 0.25)
    }
    case 'triangles': {
      const n = Math.round(circumference / 3)
      const cell = circumference / n
      const x = u * n
      const y = z / cell
      const d = Math.min(dint(y / HEX_ROW), dint(x - y / Math.sqrt(3)), dint(x + y / Math.sqrt(3))) * HEX_ROW * cell
      return -depth * cut(d, 0.25)
    }
    case 'squares': {
      const n = Math.round(circumference / 2.5)
      const cell = circumference / n
      return -depth * cut(Math.min(dint(u * n), dint(z / cell)) * cell, 0.25)
    }
    case 'rectangles': {
      // Bricks: rows half as tall as they are wide, every other row shifted half a brick.
      const n = Math.round(circumference / 3.2)
      const w = circumference / n
      const h = w / 2
      const y = z / h
      const x = u * n + (Math.floor(y) & 1) * 0.5
      return -depth * cut(Math.min(dint(x) * w, dint(y) * h), 0.22)
    }
    case 'herringbone': {
      // Columns of 45° slats, alternating direction; an even column count keeps the seam hidden.
      const n = 2 * Math.round(circumference / 5)
      const w = circumference / n
      const x = u * n
      const col = Math.floor(x)
      const sign = col & 1 ? 1 : -1
      const pitch = 1.2
      const slat = dint((z + sign * (x - col) * w) / pitch) * pitch * Math.SQRT1_2
      return -depth * cut(Math.min(slat, dint(x) * w), 0.2)
    }
    case 'chevron': {
      const n = Math.round(circumference / 4)
      const w = circumference / n
      const pitch = 2
      const d = dint((z + tri(u * n) * (w / 2)) / pitch) * pitch * Math.SQRT1_2
      return -depth * cut(d, 0.4)
    }
    case 'grooved':
      return -depth * (0.5 + 0.5 * Math.cos((TAU * z) / 2)) ** 6
    case 'wave': {
      const n = Math.round(circumference / 3.5)
      return -depth * (0.5 + 0.5 * Math.sin(TAU * (u * n) + (TAU * z) / 6))
    }
    case 'hammered': {
      const n = Math.max(8, Math.round(circumference / 1.8))
      const cellW = circumference / n
      const rowH = cellW * 0.866
      const cu = u * n
      const k = Math.round(z / rowH)
      let best = 0
      for (let row = k - 1; row <= k + 1; row++) {
        const offset = (row & 1) * 0.5
        const c = Math.round(cu - offset)
        for (let col = c - 1; col <= c + 1; col++) {
          const id = ((col % n) + n) % n
          const h1 = hash(id, row)
          const h2 = hash(row, id + 17)
          const du = (cu - (col + offset + (h1 - 0.5) * 0.35)) * cellW
          const dz = z - (row * rowH + (h2 - 0.5) * 0.35 * rowH)
          const rad = cellW * (0.5 + 0.2 * h2)
          const v = 1 - (du * du + dz * dz) / (rad * rad)
          if (v > 0) best = Math.max(best, v * (0.6 + 0.4 * h1))
        }
      }
      return -depth * best
    }
  }
}

// ---------------------------------------------------------------------------
// Mesh generation

type Profile = (t: number) => { r: number; z: number }

/**
 * Revolve a closed profile loop around Z. The loop runs outer surface
 * (top → bottom), bottom face, inner surface (bottom → top), top face — each
 * as its own vertex strip so corners stay crisp while curves shade smoothly.
 */
export function buildRingGeometry(
  spec: RingSpec,
  texture: Texture = 'smooth',
  textureDepth: TextureDepth = 'light',
): THREE.BufferGeometry {
  const width = spec.width
  const half = width / 2
  const textured = texture !== 'smooth'
  const segs = textured ? 720 : 192
  const positions: number[] = []
  const indices: number[] = []

  const addStrip = (rows: number, profile: Profile, displace?: (theta: number, z: number) => number) => {
    const base = positions.length / 3
    for (let i = 0; i < rows; i++) {
      const { r, z } = profile(i / (rows - 1))
      for (let j = 0; j < segs; j++) {
        const theta = (j / segs) * TAU
        const rr = r + (displace ? displace(theta, z) : 0)
        positions.push(rr * Math.cos(theta), rr * Math.sin(theta), z)
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const a = base + i * segs + j
        const b = base + i * segs + ((j + 1) % segs)
        indices.push(a, a + segs, b, b, a + segs, b + segs)
      }
    }
  }

  /** Flat disc for a solid part's face, fanned from a centre vertex. */
  const addCap = (z: number, r: number, facingUp: boolean) => {
    const center = positions.length / 3
    positions.push(0, 0, z)
    for (let j = 0; j < segs; j++) {
      const theta = (j / segs) * TAU
      positions.push(r * Math.cos(theta), r * Math.sin(theta), z)
    }
    for (let j = 0; j < segs; j++) {
      const a = center + 1 + j
      const b = center + 1 + ((j + 1) % segs)
      if (facingUp) indices.push(center, a, b)
      else indices.push(a, center, b)
    }
  }

  const solid = spec.inner.radius === 0
  const innerEdge = edgeRadius(spec.inner, width)
  const outerEdge = edgeRadius(spec.outer, width)
  const midRadius = spec.outer.radius
  const depth = textureDepthMm(spec, textureDepth)
  // Taper the cut to nothing at the faces, over a band a narrow ring can still spare.
  const fade = Math.min(Math.max(0.6, depth), half * 0.4)
  // Keep the rows-per-mm the default width gives, so texture stays as crisp at any width.
  const texturedRows = Math.min(241, Math.max(41, Math.round(width * 9) + 1))

  addStrip(
    textured ? texturedRows : 41,
    (t) => {
      const z = half - t * width
      return { r: surfaceRadius(spec.outer, z, width), z }
    },
    textured
      ? (theta, z) => displacement(texture, theta, z, midRadius, depth) * smoothstep(half, half - fade, Math.abs(z))
      : undefined,
  )
  if (solid) {
    addCap(-half, outerEdge, false)
    addCap(half, outerEdge, true)
  } else {
    addStrip(2, (t) => ({ r: outerEdge + (innerEdge - outerEdge) * t, z: -half }))
    addStrip(spec.inner.kind === 'cylinder' ? 2 : 41, (t) => {
      const z = -half + t * width
      return { r: surfaceRadius(spec.inner, z, width), z }
    })
    addStrip(2, (t) => ({ r: innerEdge + (outerEdge - innerEdge) * t, z: half }))
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export function buildRingGeometries(
  specs: RingSpec[],
  texture: Texture,
  textureDepth: TextureDepth = 'light',
): THREE.BufferGeometry[] {
  return specs.map((spec, i) => buildRingGeometry(spec, i === specs.length - 1 ? texture : 'smooth', textureDepth))
}

export const triangleCount = (geometries: THREE.BufferGeometry[]) =>
  geometries.reduce((sum, g) => sum + (g.index ? g.index.count / 3 : 0), 0)

/** Binary STL: 80 byte header + 4 byte count + 50 bytes per triangle. */
export const stlByteSize = (geometries: THREE.BufferGeometry[]) => 84 + 50 * triangleCount(geometries)

// ---------------------------------------------------------------------------
// Sizing helpers

const US_BASE = 11.63
const US_STEP = 0.8128

export const usSizeToDiameter = (size: number) => US_BASE + US_STEP * size

export function formatUsSize(diameter: number): string {
  const size = Math.round(((diameter - US_BASE) / US_STEP) * 4) / 4
  if (size < 0) return '—'
  const whole = Math.floor(size)
  const part = ['', '¼', '½', '¾'][Math.round((size - whole) * 4)]
  return `${whole}${part}`
}
