import { colorOf, specsOf, type Design } from '../lib/design'
import { edgeRadius, outerDiameter } from '../lib/ring'

/** Flat front-view thumbnail of the current design. */
export function RingIcon({ design, className }: { design: Design; className?: string }) {
  const specs = specsOf(design)
  const scale = 1 / (outerDiameter(specs) / 2)
  return (
    <svg viewBox="-1.05 -1.05 2.1 2.1" className={className}>
      {specs
        .map((spec, i) => (
          <path
            key={i}
            fillRule="evenodd"
            fill={colorOf(design, i)}
            stroke="rgb(0 0 0 / 0.35)"
            strokeWidth={0.03}
            d={annulus(
              (i === specs.length - 1 ? spec.outer.radius : edgeRadius(spec.outer, spec.width)) * scale,
              edgeRadius(spec.inner, spec.width) * scale,
            )}
          />
        ))
        .reverse()}
    </svg>
  )
}

/** Ring outline; an inner radius of 0 gives a solid disc. */
export function annulus(outer: number, inner: number) {
  const circle = (r: number) => `M ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 Z`
  return inner > 0 ? `${circle(outer)} ${circle(inner)}` : circle(outer)
}
