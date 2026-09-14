/** Printers whose build plate can be outlined in 2D sizing mode. Sizes are the build volume in mm. */
export interface Printer {
  id: string
  name: string
  bed: { x: number; y: number; z: number }
}

export const PRINTERS: Printer[] = [
  { id: 'bambu-a1-mini', name: 'Bambu A1 mini', bed: { x: 180, y: 180, z: 180 } },
  { id: 'bambu-256', name: 'Bambu A1 / P1S / X1C', bed: { x: 256, y: 256, z: 256 } },
  { id: 'sovol-sv06-plus', name: 'Sovol SV06 Plus', bed: { x: 300, y: 300, z: 340 } },
]

const STORAGE_KEY = 'fidget-ring-maker:printer'

export const printerById = (id: string) => PRINTERS.find((p) => p.id === id) ?? PRINTERS[0]

export function loadPrinterId(): string {
  try {
    return printerById(localStorage.getItem(STORAGE_KEY) ?? '').id
  } catch {
    return PRINTERS[0].id
  }
}

export function savePrinterId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // storage unavailable; the choice just won't persist
  }
}
