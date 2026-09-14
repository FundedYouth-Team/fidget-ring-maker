/** Display units. Designs are always stored and exported in millimetres; this only changes what's shown. */
export type Unit = 'mm' | 'in'

export const MM_PER_INCH = 25.4
const STORAGE_KEY = 'fidget-ring-maker:unit'

export const toUnit = (mm: number, unit: Unit) => (unit === 'in' ? mm / MM_PER_INCH : mm)
export const fromUnit = (value: number, unit: Unit) => (unit === 'in' ? value * MM_PER_INCH : value)

/** Decimal places and input step that suit each unit (0.1 mm ≈ 0.004 in). */
export const DECIMALS: Record<Unit, number> = { mm: 1, in: 3 }
export const STEP: Record<Unit, number> = { mm: 0.1, in: 0.005 }

/** Rounds a length in mm to the display precision of `unit`, returning mm. */
export const snapMm = (mm: number, unit: Unit) => {
  const f = 10 ** DECIMALS[unit]
  return fromUnit(Math.round(toUnit(mm, unit) * f) / f, unit)
}

/** "19.1 mm" or "0.752 in". `decimals` overrides the unit's default precision. */
export const formatLength = (mm: number, unit: Unit, decimals = DECIMALS[unit]) =>
  `${toUnit(mm, unit).toFixed(decimals)} ${unit}`

export function loadUnit(): Unit {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'in' ? 'in' : 'mm'
  } catch {
    return 'mm'
  }
}

export function saveUnit(unit: Unit) {
  try {
    localStorage.setItem(STORAGE_KEY, unit)
  } catch {
    // storage unavailable; the choice just won't persist
  }
}
