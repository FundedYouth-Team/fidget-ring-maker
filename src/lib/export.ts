import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { strToU8, zipSync } from 'fflate'
import { RING_WIDTH } from './ring'

// Both formats lift the rings by half their width so they sit flat on the print bed.
const BED_OFFSET = RING_WIDTH / 2

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function buildStl(geometries: THREE.BufferGeometry[]): Blob {
  const group = new THREE.Group()
  geometries.forEach((g) => group.add(new THREE.Mesh(g)))
  group.position.z = BED_OFFSET
  group.updateMatrixWorld(true)
  const data = new STLExporter().parse(group, { binary: true })
  return new Blob([data], { type: 'model/stl' })
}

/** A zip of one STL per part, numbered inner to outer, all keeping their print-in-place positions. */
export function buildStlZip(geometries: THREE.BufferGeometry[], names: string[]): Blob {
  const files: Record<string, Uint8Array> = {}
  geometries.forEach((g, i) => {
    const slug = names[i].toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const data = new STLExporter().parse(placed(g), { binary: true })
    files[`${i + 1}-${slug}.stl`] = new Uint8Array(data.buffer)
  })
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })
}

function placed(geometry: THREE.BufferGeometry): THREE.Object3D {
  const mesh = new THREE.Mesh(geometry)
  mesh.position.z = BED_OFFSET
  mesh.updateMatrixWorld(true)
  return mesh
}

/**
 * 3MF: a zip holding an XML model. Each ring is its own object, tagged with its
 * colour as a base material so multi-colour slicers can pick it up.
 */
export function build3mf(geometries: THREE.BufferGeometry[], colors: string[], names: string[]): Blob {
  const materials = geometries
    .map((_, i) => `<base name="${names[i]}" displaycolor="${toRgbaHex(colors[i])}" />`)
    .join('')

  const objects = geometries.map((g, i) => meshObject(g, i + 2, i, names[i])).join('\n')
  const items = geometries.map((_, i) => `<item objectid="${i + 2}" />`).join('')

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">Fidget Ring</metadata>
<metadata name="Application">Fidget Maker</metadata>
<resources>
<basematerials id="1">${materials}</basematerials>
${objects}
</resources>
<build>${items}</build>
</model>`

  const parts = geometries.map((g, i) => ({
    id: i + 2,
    name: names[i],
    triangles: g.index!.count / 3,
  }))

  const zip = zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELS),
      '3D/3dmodel.model': strToU8(model),
      'Metadata/model_settings.config': strToU8(bambuSettings(parts)),
      'Metadata/Slic3r_PE_model.config': strToU8(prusaSettings(parts)),
    },
    { level: 6 },
  )
  return new Blob([zip], { type: 'model/3mf' })
}

interface Part {
  id: number
  name: string
  triangles: number
}

/**
 * Per-object slicer settings: every layer is filled with solid concentric loops, so the rings
 * print as solid circles that follow their shape. Bambu Studio and OrcaSlicer read
 * model_settings.config; PrusaSlicer reads Slic3r_PE_model.config.
 */
const BAMBU_SETTINGS = {
  sparse_infill_pattern: 'concentric',
  sparse_infill_density: '100%',
  internal_solid_infill_pattern: 'concentric',
  top_surface_pattern: 'concentric',
  sub_top_surface_pattern: 'concentric',
  bottom_surface_pattern: 'concentric',
}

const PRUSA_SETTINGS = {
  fill_pattern: 'concentric',
  fill_density: '100%',
  top_fill_pattern: 'concentric',
  bottom_fill_pattern: 'concentric',
}

function bambuSettings(parts: Part[]): string {
  const objects = parts.map(
    (p) => `<object id="${p.id}">
<metadata key="name" value="${p.name}"/>
${settingLines(BAMBU_SETTINGS, '')}
<part id="${p.id}" subtype="normal_part">
<metadata key="name" value="${p.name}"/>
</part>
</object>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${objects.join('\n')}\n</config>`
}

function prusaSettings(parts: Part[]): string {
  const objects = parts.map(
    (p) => `<object id="${p.id}" instances_count="1">
<metadata type="object" key="name" value="${p.name}"/>
${settingLines(PRUSA_SETTINGS, ' type="object"')}
<volume firstid="0" lastid="${p.triangles - 1}">
<metadata type="volume" key="name" value="${p.name}"/>
</volume>
</object>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${objects.join('\n')}\n</config>`
}

const settingLines = (settings: Record<string, string>, attrs: string) =>
  Object.entries(settings)
    .map(([key, value]) => `<metadata${attrs} key="${key}" value="${value}"/>`)
    .join('\n')

/**
 * Ring meshes duplicate vertices where their strips meet (for crisp shading).
 * 3MF expects manifold meshes, so weld identical positions back together.
 */
function meshObject(geometry: THREE.BufferGeometry, id: number, materialIndex: number, name: string): string {
  const pos = geometry.attributes.position.array
  const index = geometry.index!.array
  const remap = new Uint32Array(pos.length / 3)
  const seen = new Map<string, number>()
  const vertices: string[] = []

  for (let v = 0; v < remap.length; v++) {
    const x = pos[v * 3]
    const y = pos[v * 3 + 1]
    const z = pos[v * 3 + 2]
    const key = `${x},${y},${z}`
    let welded = seen.get(key)
    if (welded === undefined) {
      welded = vertices.length
      seen.set(key, welded)
      vertices.push(`<vertex x="${round(x)}" y="${round(y)}" z="${round(z + BED_OFFSET)}" />`)
    }
    remap[v] = welded
  }

  const triangles: string[] = []
  for (let t = 0; t < index.length; t += 3) {
    triangles.push(`<triangle v1="${remap[index[t]]}" v2="${remap[index[t + 1]]}" v3="${remap[index[t + 2]]}" />`)
  }

  return `<object id="${id}" name="${name}" type="model" pid="1" pindex="${materialIndex}">
<mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh>
</object>`
}

const round = (n: number) => Math.round(n * 10000) / 10000

const toRgbaHex = (hex: string) => `${hex.toUpperCase()}FF`

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`
