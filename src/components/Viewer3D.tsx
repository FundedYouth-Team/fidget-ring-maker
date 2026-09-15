import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { colorOf, type Design } from '../lib/design'

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

export function Viewer3D({ design, geometries, viewRequest, resetNonce, active, seeThrough }: Viewer3DProps) {
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
          {/* Keyed so the material rebuilds its shader when transparency switches. */}
          <meshStandardMaterial
            key={seeThrough ? 'see-through' : 'solid'}
            color={colorOf(design, index)}
            roughness={0.5}
            metalness={0}
            transparent={seeThrough}
            opacity={seeThrough ? 0.4 : 1}
            depthWrite={!seeThrough}
            side={seeThrough ? THREE.DoubleSide : THREE.FrontSide}
          />
        </mesh>
        {index > 0 && renderRing(index - 1)}
      </group>
    )
  }

  return <>{count > 0 && renderRing(count - 1)}</>
}
