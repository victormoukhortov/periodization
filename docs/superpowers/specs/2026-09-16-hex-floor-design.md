# Hex Floor — bathroom floor layout planner

## Purpose

A fourth single-file app in this repo, `hex.html`, for designing the black-and-white pattern of a
bathroom floor laid in hex mosaic. The floor is already partly laid: the field is white hex tile and
a dotted black border (one black, one white, one black) is grouted in and fixed. The app renders the
real floor plan on that hex grid, marks the fixed border so it cannot be changed, and lets the user
toggle any other tile black or white, then save layouts to `localStorage`, browse them by preview,
reopen, edit and re-save.

## Constraints

Same as the other three apps (CLAUDE.md "Hard constraints"): one file, no framework, ES5-flavoured
JS, pure engine, `localStorage` with an in-memory fallback, relative URLs only, own manifest, added to
`index.html`, `sw.js` and the CI workflow. Tested by `test-hex.mjs` in the same headless style.

## The grid

Pointy-top hexagons in horizontal rows. Cell `(c, r)`: column `c`, row `r`; odd rows are shifted half
a cell east. Centre in units of one hex width: `x = c + (r odd ? 0.5 : 0)`, `y = r * 0.866`.
North is row decreasing, east is column increasing. Keys are the string `"c,r"`.

The border pattern, everywhere on the floor, is:

- a **row-line**: blacks in one row at every other column (`c, c+2, …`), one white between;
- a **column-line**: blacks in one column at every other row (`r, r+2, …`), which is a straight
  vertical line because rows two apart have no offset.

## The floor, as read from the four photos

Origin `(0, 0)` is the north-west corner dot of the main border. All counts below are dots, corners
included, and each was counted from at least two photos.

| Segment | Cells | Dots |
| --- | --- | --- |
| Main north row (bay end) | `(0..58 step 2, 0)` | 30 |
| Main east column (vanity wall) | `(58, 0..68 step 2)` | 35 |
| Main west column | `(0, 0..68 step 2)` | 35 |
| South-east step | `(40..58 step 2, 68)` | 10 |
| Door neck, east side | `(40, 68..82 step 2)` | 8 |
| Door threshold | `(10..40 step 2, 82)` | 16 |
| Door neck, west side | `(10, 68..82 step 2)` | 8 |
| South-west step | `(0..10 step 2, 68)` | 6 |
| Shower north row | `(-41..-9 step 2, 8)` | 17 |
| Shower south row | `(-41..-9 step 2, 42)` | 17 |
| Shower west column | `(-41, 8..42 step 2)` | 18 |
| West column, shower through passage | `(-9, 8..68 step 2)` | 31 (18 shower + 13 more) |
| Passage south row | `(-41..-9 step 2, 68)` | 17 |
| Toilet room north row | `(-27..-9 step 2, 78)` | 10 |
| Toilet room south row | `(-27..-9 step 2, 110)` | 10 |
| Toilet room east column | `(-9, 78..110 step 2)` | 17 |
| Toilet room west column | `(-27, 78..110 step 2)` | 17 |

Consistency checks that hold: north row 29 intervals = 9 + 15 + 5 across the south side; east and
west columns both 35; shower rows both 17 and columns both 18; toilet rows both 10 and columns 17.

What is inferred rather than counted, and stated as such in the app's Plan tab:

- The west column continues behind the shower's south wall from row 44 to row 60 (dots at rows
  62–68 and 8–42 are visible; the run between is hidden by the wall).
- The passage south row west of the toilet room door (beyond column −33) and the toilet room
  rectangle's exact east-west position (±1 column).
- Every white margin between a border and a wall, and the bay window's shape. These only decide
  which cells exist to be painted; they do not move a single black dot.

Floor extent (cells that exist), built from rectangles: main room `(-3..61, -2..70)` plus the
strip `(-8..-4, 7..70)`; shower `(-42..-9, 7..43)`; passage `(-42..-9, 48..70)` and the gap east of
the niche wall `(-9..-4, 44..47)`; door neck `(8..42, 71..84)`; toilet room `(-30..-7, 71..113)`;
bay `rows -14..-3`, spanning `(2+k .. 56-k)` at row `-3-k`.

## Architecture

Sections as in the other apps:

- `PROGRAM` — `FLOOR`: the rectangles above and `SEGMENTS`, the table above as data. `fixedSet()`
  and `floorSet()` are derived from them once at load.
- `ENGINE` — pure hex maths (`hexCenter`, `hexAt` nearest-centre hit test, `hexPath` vertices),
  the layout reducers (`toggleCell`, `paintCell`, `undo`), counts, `serialize`/`deserialize`
  (a layout is `{id, name, created, updated, cells:["c,r", …]}` holding only user-black cells).
- `STORAGE` — key `hex-floor-v1`: `{layouts:[…], draft:{id, name, cells, past}}`. The draft is the
  open design, saved on every change so a reload keeps unsaved work.
- `STATE` — `state`, plus view state: `tab` (design / layouts / plan), `view` transform
  `{scale, tx, ty}`, `brush` (tap-to-toggle or drag-to-paint), `paint` colour, `confirm`.
- `VIEWS` — HTML strings per tab. Design tab holds the `<canvas>` and toolbar.
- `RENDER` — `render()` rebuilds `#app`; `paintFloor()` draws the whole floor to an offscreen canvas
  at the current scale; `blit()` copies it with the pan offset. Toggling a cell repaints one hex.
  Preview thumbnails are drawn into per-card canvases after render.
- `ACTIONS` — delegated `click` on `data-a`; pointer events on the canvas: tap toggles, one-finger
  drag pans (or paints in brush mode), two fingers pinch-zoom, wheel zooms.
- `PWA` — as the others: manifest link served, blob manifest from `file://`, service worker only
  when hosted.

## Screens

- **Design**: toolbar (Undo, Brush/Tap, paint colour, Fit, counts of black and white, Save, Save as)
  over a full-height canvas. Walls are dark, floor white, fixed dots black with a faint ring so they
  read as locked, user tiles plain black.
- **Layouts**: a card per saved layout with a preview, name, tile counts and updated date; Open,
  Duplicate, Rename, Delete. New layout starts from the fixed border only.
- **Plan**: the segment table with counts, the dimensions, what was inferred, and how to read the
  grid against the photos.

## Testing

`test-hex.mjs`: segment counts match the table; every fixed cell is on the floor and on an even
row; row-lines step 2 in column and column-lines step 2 in row; `hexAt(hexCenter(c,r)) == (c,r)`;
toggle / paint / undo rules including that fixed and off-floor cells never change; counts;
serialization round trip drops off-floor cells; storage save/save-as/rename/delete and the blocked
storage fallback; every tab renders without throwing.
