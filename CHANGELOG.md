# Changelog

All notable changes to Fidget Maker are recorded here, newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Welcome popup** — shown when someone opens the site: a short how-to YouTube video and four quick
  points (watch the video, save and open designs, export for 3D printing, add outer designs). On
  later visits it offers "Don't show this on startup", which is remembered. A **?** button to the
  right of Save opens it again at any time.
- **App setup** — client-side React, Vite, Tailwind CSS and three.js app, run with `pnpm dev`.
- **3D viewer** — light-gray stage modeled on the reference viewer, with panels for export and design.
  Drag the outer ring to orbit; the design is saved in the browser between visits.
- **Ring geometry** — measured from the reference STLs in `_stl/`: 10 mm wide, 0.2 mm clearance
  between rings, and a rounded outer ring (13 mm radius, 1 mm crown). The faces where rings meet
  are spheres centred on the ring, so inner rings can turn any direction without colliding.
- **Layers box** — below the download card, lists the rings from outer to inner, starting with two.
  Select a layer to recolor it with the Design panel's 24 swatches or a custom color. The + next to
  "Layers" adds a new outer ring straight away (up to 5 rings). Rings around the inner ring are
  named "Outer ring 1", "Outer ring 2" and so on, counting from the inside out; the names carry
  into the Design and Size panels and the exported 3MF objects and STL files. The outermost or
  inner ring can be deleted while there are more than two rings; rings between them can't. The
  inner diameter stays the same as rings come and go.
- **New project** — a "New" button on the download card starts over from the default two-ring
  design after asking to confirm, and resets the view.
- **Open and Save** — buttons next to "New". Save downloads the design (rings, colors, inner fill,
  inner diameter and texture) as a `.fm.json` Fidget Maker project file; Open loads one back, replacing the
  current design and resetting the view. Files that aren't valid projects are rejected with a message.
  Files saved under the earlier "Fidget Ring Maker" name still open.
- **Inner fill** — a solid core filling the centre instead of a finger hole, with its own color.
  The inner ring's bore becomes a curved socket that still opens at the inner diameter, so the core
  is locked in with 0.2 mm clearance and spins like the other rings. Switch it on or off with the
  Standard / Fill toggle on the inner ring's row in the Layers box (it's no longer in the + menu);
  it can also be deleted from its own row. It exports as its own "Inner fill" object in the 3MF, and shows in the 2D view.
- **2D sizing mode** — to-scale front view for sizing the selected layer. The inner ring's inner
  diameter (12–30 mm) is set by dragging a handle, or with a slider, number box or US ring size menu.
  Shows the US size and outer diameter, with the selected layer outlined in the drawing. The
  drawing zooms out to fit larger rings. The "Size" panel sits below the Design box, which collapses
  on entering 2D so the sizing options are in view (and reopens back in 3D on wide screens); when
  both are open they share the height and scroll.
- **Ring thickness** — every ring has its own thickness (1.2–6 mm; defaults 3.8 mm inner, 2 mm
  others). In 2D mode, select a layer in the Layers box or click it in the drawing, then drag its
  outer handle or type a thickness or outer diameter. Rings outside it move out to keep 0.2 mm
  clearance. Only the inner ring has an inner-diameter handle. Rings keep their thickness as layers
  are added or deleted, thickness is saved in project files, and older projects open with the
  default thicknesses. On small bores (or with an inner fill) the inner ring can't go as thin, so
  its faces don't disappear.
- **Size limit toggle** — a "Limit" switch next to the Size title in 2D mode, on by default. Turning
  it off lifts the usual limits so the inner diameter can go from 4 to 200 mm and ring thickness from
  0.4 to 50 mm (just what the geometry needs to stay valid). Turning it back on brings the design
  back within 12–30 mm and 1.2–6 mm. The setting is saved with the design and in project files;
  older projects open with the limit on.
- **Ring spacing** — a "Ring spacing" setting at the top of the Size panel in 2D mode, above the
  selected layer. "Fixed" is on by default and keeps 0.2 mm between rings. Turn it off to set the
  spacing between every ring at once (0.1–1 mm, or 0.05–3 mm with the size limit off; with an inner
  fill the maximum depends on the bore). A Preview button opens a to-scale cross-section of the rings
  with a close-up of the gap; turning Fixed back on hides it. The 2D drawing, 3D view and downloads
  all use the spacing. It's saved with the design and in project files, and older projects open
  with fixed spacing.
- **Print bed box** — below the Size panel in 2D mode. Pick a printer (Bambu A1 mini 180 × 180 mm,
  Bambu A1 / P1S / X1C 256 × 256 mm, or Sovol SV06 Plus 300 × 300 mm) to draw its bed as a dashed
  outline around the ring, to scale. The 2D drawing now zooms: scroll or pinch on it, or use the
  zoom buttons, "Fit ring" and "Fit bed". The grid switches to 10 mm squares when zoomed out, and
  the chosen printer is remembered between visits.
- **Outer textures** — smooth, knurled, knurl inset, ribbed, spiral flutes, grooved, wave, hammered,
  dimples, dragon scale, honeycomb, triangles, squares, rectangles (brick), herringbone and chevron on
  the outer ring's outside, each with its own swatch in the picker. Inner rings are always smooth.
- **Texture depth** — Light, Medium or Deep, below the texture picker once a texture is chosen,
  each showing how deep it cuts. Light is the original 0.35 mm; Medium (the default for new designs)
  cuts 0.7 mm and Deep 1.05 mm, so the pattern is easy to feel on a print. Deeper grooves are also cut
  wider so a 0.4 mm nozzle can form them. The cut never takes more than 55% of the outer ring's
  thickness; when that limits a depth, the shown number drops and a note suggests a thicker ring.
  Saved with the design and in project files; older projects open at Light.
- **Spinning** — drag an inner ring to spin it in the direction you pull, with momentum.
- **Toolbar** — reset, 3D/2D switch, and front/back/top/bottom/left/right views.
- **Advanced color** — an "Advanced" switch next to the Color title in the Design panel, off by
  default. Turned on, each layer can be Single, Dual or Tri-color; Dual and Tri pick a second and
  third color and a gradient mode — Linear or Radial (from the inside out) — shown in the 3D view and
  the Layers box. Linear has a gradient angle slider: 0° blends around the ring to the far side and
  back, 90° fades from one flat face to the other, and angles between run diagonally across the band;
  "Around ring" and "Face to face" set either end in one click. Designs saved with the earlier Around
  or Across modes open at 0° or 90°. It's for display only: the 3MF still exports each
  part in its first color. Turning it off shows single colors again but keeps the gradients for next
  time. Saved with the design and in project files; older projects open with it off.
- **See-through view** — a switch on the toolbar that makes the rings semi-transparent in 3D, keeping
  their colors, so the texture depth and the rings inside can be seen. Each ring is outlined with
  dark lines around the rims of its faces, like a CAD program's x-ray view; lines behind a ring show
  fainter through it.
- **mm / inch toggle** — at the right end of the toolbar. Switches every measurement shown in the
  Design panel and 2D sizing mode (labels, number boxes, ring size menu) between millimetres and
  inches, and is remembered between visits. Designs, project files and exports stay in millimetres.
- **STL download** — binary STL lying flat on the bed to print in place. The STL button asks whether
  to download one object (all rings in one file) or separate objects: a zip with one STL per part
  (numbered inner to outer, e.g. `1-inner-ring.stl`), each kept in its print-in-place position.
- **3MF download** — each ring as its own named object carrying its color, for multi-color
  printing. About 5–6× smaller than the STL.
- **Concentric print settings in the 3MF** — each ring is set to 100% concentric infill with
  concentric top, bottom and solid layers, so it prints solid. Bambu Studio and OrcaSlicer pick
  this up per object, and PrusaSlicer reads its own copy of the settings.
- **README** — overview, run and build commands, a step-by-step guide to using the app, the full
  feature list, how the design becomes geometry and exports, the project layout, and geometry notes.
- **Favicon** — three rings, blue outside, white in the middle and orange inside, matching the 2D
  sizing view.

### Changed

- **Design panel inner diameter** — no longer shows the US ring size under it; the diameter itself
  follows the mm / inch toggle. The US size is still shown in 2D sizing mode.
- **App name** — renamed from "Fidget Ring Maker" to "Fidget Maker" in the browser tab title, the
  README and the application name recorded in downloaded 3MF files.

### Fixed

- In browsers with WebGL turned off (such as Brave with graphics acceleration off), the 3D view was
  blank with no explanation. It now shows a short message saying how to turn it on; the 2D view and
  downloads still work.
- 3MF export named the outer ring "Middle ring" in 2-ring mode.
