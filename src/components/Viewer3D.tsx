import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { displayColorsOf, finishOf, GRADIENTS, type Design } from '../lib/design'
import { RING_WIDTH } from '../lib/ring'

export type ViewName = 'home' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right'

export interface ViewRequest {
  view: ViewName
  nonce: number
}

const HOME_DIRECTION = new THREE.Vector3(-0.62, 0.32, 0.72).normalize()
const VIEW_DIRECTIONS: Record<ViewName, THREE.Vector3> = {
  home: HOME_DIRECTION,
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  // tiny z offset keeps OrbitControls away from the pole singularity
  top: new THREE.Vector3(0, 1, 0.001).normalize(),
  bottom: new THREE.Vector3(0, -1, 0.001).normalize(),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
}

const MAX_OMEGA = 40 // rad/s
const SPIN_DAMPING = 0.45 // 1/s — how quickly free spin decays

interface Viewer3DProps {
  design: Design
  geometries: THREE.BufferGeometry[]
  viewRequest: ViewRequest
  resetNonce: number
  active: boolean
  /** Draw the rings semi-transparent, keeping their colours. */
  seeThrough: boolean
}

/** three.js needs WebGL 2; some browsers (e.g. Brave with graphics acceleration off) turn it off entirely. */
function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // free the probe context
    return gl !== null
  } catch {
    return false
  }
}

function WebGLUnavailable() {
  return (
    <div className="grid h-full place-items-center p-4">
      <div className="max-w-sm rounded-md bg-panel p-4 text-sm text-white shadow-lg backdrop-blur-sm">
        <p className="font-semibold">3D view unavailable</p>
        <p className="mt-1 text-white/80">
          This browser has WebGL turned off. Turn on graphics acceleration in the browser settings and relaunch it, or
          try another browser. The 2D view and downloads still work.
        </p>
      </div>
    </div>
  )
}

/** Catches the renderer failing to start even though the WebGL 2 check passed. */
class CanvasErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <WebGLUnavailable /> : this.props.children
  }
}

export function Viewer3D(props: Viewer3DProps) {
  const [supported] = useState(hasWebGL2)
  if (!supported) return <WebGLUnavailable />
  return (
    <CanvasErrorBoundary>
      <Scene {...props} />
    </CanvasErrorBoundary>
  )
}

function Scene({ design, geometries, viewRequest, resetNonce, active, seeThrough }: Viewer3DProps) {
  return (
    <Canvas
      camera={{ position: HOME_DIRECTION.clone().multiplyScalar(110).toArray(), fov: 35, near: 1, far: 2000 }}
      dpr={[1, 2]}
      frameloop={active ? 'always' : 'never'}
    >
      <color attach="background" args={['#d9d9d9']} />
      <Environment />
      <ambientLight intensity={0.25} />
      <directionalLight position={[-30, 50, 60]} intensity={1.1} />
      <directionalLight position={[40, -20, -40]} intensity={0.35} />
      <RingAssembly
        key={geometries.length}
        design={design}
        geometries={geometries}
        resetNonce={resetNonce}
        seeThrough={seeThrough}
      />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={40} maxDistance={300} />
      <CameraRig request={viewRequest} />
    </Canvas>
  )
}

function Environment() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.55
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

/** Animates the camera to a preset direction whenever a new request arrives. */
function CameraRig({ request }: { request: ViewRequest }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; fromDist: number; toDist: number; t: number } | null>(
    null,
  )

  useEffect(() => {
    if (request.nonce === 0) return
    const dist = camera.position.length()
    anim.current = {
      from: camera.position.clone().normalize(),
      to: VIEW_DIRECTIONS[request.view].clone(),
      fromDist: dist,
      toDist: request.view === 'home' ? 110 : dist,
      t: 0,
    }
  }, [request, camera])

  useFrame((_, dt) => {
    const a = anim.current
    if (!a) return
    a.t = Math.min(1, a.t + dt / 0.55)
    const e = 1 - (1 - a.t) ** 3
    const q = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(a.from, a.to), e)
    camera.position.copy(a.from).applyQuaternion(q).multiplyScalar(a.fromDist + (a.toDist - a.fromDist) * e)
    camera.lookAt(0, 0, 0)
    controls?.target.set(0, 0, 0)
    controls?.update()
    if (a.t >= 1) anim.current = null
  })

  return null
}

interface RingAssemblyProps {
  design: Design
  geometries: THREE.BufferGeometry[]
  resetNonce: number
  seeThrough: boolean
}

/**
 * Rings are nested groups: each inner ring is a child of the ring around it,
 * so it rides along with its host while keeping its own free rotation.
 * The outer ring is the root; dragging it orbits the camera instead.
 */
function RingAssembly({ design, geometries, resetNonce, seeThrough }: RingAssemblyProps) {
  const { camera, gl } = useThree()
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const count = geometries.length
  const groups = useRef<(THREE.Group | null)[]>([])
  const omegas = useMemo(() => Array.from({ length: count }, () => new THREE.Vector3()), [count])
  const drag = useRef<{
    index: number
    plane: THREE.Plane
    last: THREE.Vector3
    lastTime: number
    velocity: THREE.Vector3
  } | null>(null)

  useEffect(() => {
    if (resetNonce === 0) return
    groups.current.forEach((g) => g?.quaternion.identity())
    omegas.forEach((w) => w.set(0, 0, 0))
  }, [resetNonce, omegas])

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()

    const onMove = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(d.plane, hit)) return
      const group = groups.current[d.index]
      if (!group?.parent) return

      // Rotation that carries the grab point along the pointer: (p × Δ) / |p|²
      const delta = hit.clone().sub(d.last)
      const rot = new THREE.Vector3().crossVectors(d.last, delta).divideScalar(Math.max(d.last.lengthSq(), 1))
      rot.applyQuaternion(group.parent.getWorldQuaternion(new THREE.Quaternion()).invert())
      const angle = rot.length()
      if (angle > 1e-6) {
        group.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(rot.clone().divideScalar(angle), angle))
      }

      const now = performance.now()
      const dt = Math.max((now - d.lastTime) / 1000, 1 / 240)
      d.velocity.lerp(rot.divideScalar(dt), 0.5)
      d.last.copy(hit)
      d.lastTime = now
    }

    const onUp = () => {
      const d = drag.current
      if (!d) return
      if (performance.now() - d.lastTime > 80) d.velocity.set(0, 0, 0) // held still before release
      omegas[d.index].copy(d.velocity).clampLength(0, MAX_OMEGA)
      drag.current = null
      if (controls) controls.enabled = true
      document.body.style.cursor = ''
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [camera, gl, controls, omegas])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)
    const q = new THREE.Quaternion()
    for (let i = 0; i < count; i++) {
      const w = omegas[i]
      const group = groups.current[i]
      if (!group || drag.current?.index === i || w.lengthSq() < 1e-6) continue
      const speed = w.length()
      q.setFromAxisAngle(w.clone().divideScalar(speed), speed * dt)
      group.quaternion.premultiply(q).normalize()
      w.multiplyScalar(Math.exp(-SPIN_DAMPING * dt))
    }
  })

  const onPointerDown = (index: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (controls) controls.enabled = false
    const normal = camera.getWorldDirection(new THREE.Vector3())
    drag.current = {
      index,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, e.point),
      last: e.point.clone(),
      lastTime: performance.now(),
      velocity: new THREE.Vector3(),
    }
    omegas[index].set(0, 0, 0)
    document.body.style.cursor = 'grabbing'
  }

  const renderRing = (index: number): React.ReactNode => {
    const draggable = index < count - 1
    return (
      <group key={index} ref={(el) => void (groups.current[index] = el)}>
        <mesh
          geometry={geometries[index]}
          onPointerDown={draggable ? onPointerDown(index) : undefined}
          onPointerOver={
            draggable
              ? (e) => {
                  e.stopPropagation()
                  if (!drag.current) document.body.style.cursor = 'grab'
                }
              : undefined
          }
          onPointerOut={draggable ? () => void (!drag.current && (document.body.style.cursor = '')) : undefined}
        >
          <RingMaterial design={design} index={index} geometry={geometries[index]} seeThrough={seeThrough} />
        </mesh>
        {seeThrough && (
          <RingEdges geometry={geometries[index]} color={displayColorsOf(design, index)[0]} width={design.width} />
        )}
        {index > 0 && renderRing(index - 1)}
      </group>
    )
  }

  return <>{count > 0 && renderRing(count - 1)}</>
}

/**
 * Line segments around a part's rims — where its flat faces meet the inner and outer surfaces.
 * Every vertex on a face plane (z = ±half width) lies on one of those circles, so they're grouped by
 * face and radius and joined in angle order. Texture never reaches the faces, so the rims stay clean
 * (crease detection would outline every texture facet instead).
 */
function rimLines(geometry: THREE.BufferGeometry, width: number): THREE.BufferGeometry {
  const half = width / 2
  const pos = geometry.attributes.position
  const loops = new Map<string, { angle: number; x: number; y: number; z: number }[]>()
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i)
    if (Math.abs(Math.abs(z) - half) > 1e-4) continue
    const x = pos.getX(i)
    const y = pos.getY(i)
    const r = Math.hypot(x, y)
    if (r < 1e-3) continue // cap centre
    const key = `${Math.sign(z)}:${r.toFixed(3)}`
    let loop = loops.get(key)
    if (!loop) loops.set(key, (loop = []))
    loop.push({ angle: Math.atan2(y, x), x, y, z })
  }
  const out: number[] = []
  for (const loop of loops.values()) {
    loop.sort((a, b) => a.angle - b.angle)
    const points = loop.filter((p, i) => i === 0 || p.angle - loop[i - 1].angle > 1e-6) // strips share rim rows
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      out.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  const lines = new THREE.BufferGeometry()
  lines.setAttribute('position', new THREE.Float32BufferAttribute(out, 3))
  return lines
}

/**
 * CAD-style outline for the see-through view. Drawn opaque, so the translucent rings blend over the
 * lines behind them and those read fainter.
 */
function RingEdges({ geometry, color, width }: { geometry: THREE.BufferGeometry; color: string; width: number }) {
  const edges = useMemo(() => rimLines(geometry, width), [geometry, width])
  useEffect(() => () => edges.dispose(), [edges])
  const lineColor = useMemo(() => new THREE.Color(color).lerp(new THREE.Color('#000000'), 0.65), [color])
  return (
    <lineSegments geometry={edges} raycast={() => null}>
      <lineBasicMaterial color={lineColor} />
    </lineSegments>
  )
}

// Blends up to three colours in object space. Linear runs along the band at an angle: 0° goes around
// the Z axis out to the far side and back (so there's no seam), 90° across z from face to face.
// Radial runs out from the bore.
const GRADIENT_FRAGMENT = /* glsl */ `
vec3 gradientColor = diffuse;
if ( uCount > 1 ) {
  float t;
  if ( uMode == 0 ) {
    float around = 1.0 - abs( atan( vObjPos.y, vObjPos.x ) / 3.14159265359 );
    float across = vObjPos.z / uWidth + 0.5;
    float c = cos( uAngle );
    float s = sin( uAngle );
    t = ( around * c + across * s ) / ( c + s );
  } else {
    t = ( length( vObjPos.xy ) - uRadii.x ) / max( uRadii.y - uRadii.x, 1e-3 );
  }
  float s = clamp( t, 0.0, 1.0 ) * float( uCount - 1 );
  int i = min( int( floor( s ) ), uCount - 2 );
  gradientColor = mix( uColors[ i ], uColors[ i + 1 ], s - float( i ) );
}
vec4 diffuseColor = vec4( gradientColor, opacity );
`

interface RingMaterialProps {
  design: Design
  index: number
  geometry: THREE.BufferGeometry
  seeThrough: boolean
}

/** Standard material that shows the part's advanced-colour gradient, if any. Display only. */
function RingMaterial({ design, index, geometry, seeThrough }: RingMaterialProps) {
  const colors = displayColorsOf(design, index)
  const uniforms = useMemo(
    () => ({
      uColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      uCount: { value: 1 },
      uMode: { value: 0 },
      uAngle: { value: 0 },
      uRadii: { value: new THREE.Vector2(0, 1) },
      uWidth: { value: RING_WIDTH },
    }),
    [],
  )

  // Innermost and outermost distance from the axis, for the radial blend.
  const radii = useMemo(() => {
    const pos = geometry.attributes.position
    let min = Infinity
    let max = 0
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i))
      min = Math.min(min, r)
      max = Math.max(max, r)
    }
    return new THREE.Vector2(min, max)
  }, [geometry])

  // Uniforms are shared with the compiled shader, so updating them needs no rebuild.
  uniforms.uColors.value.forEach((c, i) => c.set(colors[Math.min(i, colors.length - 1)]))
  uniforms.uCount.value = colors.length
  const finish = finishOf(design, index)
  uniforms.uMode.value = GRADIENTS.findIndex((g) => g.id === finish.gradient)
  uniforms.uAngle.value = THREE.MathUtils.degToRad(finish.angle)
  uniforms.uRadii.value.copy(radii)
  uniforms.uWidth.value = design.width

  const onBeforeCompile = useCallback(
    (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = `varying vec3 vObjPos;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvObjPos = position;',
      )
      shader.fragmentShader = `uniform vec3 uColors[ 3 ];\nuniform int uCount;\nuniform int uMode;\nuniform float uAngle;\nuniform vec2 uRadii;\nuniform float uWidth;\nvarying vec3 vObjPos;\n${shader.fragmentShader}`.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        GRADIENT_FRAGMENT,
      )
    },
    [uniforms],
  )

  return (
    // Keyed so the material rebuilds its shader when transparency switches.
    <meshStandardMaterial
      key={seeThrough ? 'see-through' : 'solid'}
      color={colors[0]}
      roughness={0.5}
      metalness={0}
      transparent={seeThrough}
      opacity={seeThrough ? 0.4 : 1}
      depthWrite={!seeThrough}
      side={seeThrough ? THREE.DoubleSide : THREE.FrontSide}
      onBeforeCompile={onBeforeCompile}
    />
  )
}
