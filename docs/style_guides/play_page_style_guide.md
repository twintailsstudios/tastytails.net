# TastyTails Page-Specific Style Guide: Main Game Interface (`http://localhost:3000/play/`)

> **Note**: This document is the page-specific design specification for the **Main Game Interface (`/play/`)**. It captures the exact design language, HUD components, floating drawers, context menus, radial wheels, chat writing desk, sub-tab panels, and hidden header controls governing the active gameplay experience. It serves as Step 4 in building the universal design system for TastyTails.net.

---

## 1. Theme & Design Philosophy

The Play Page transitions the application into **"Full-Screen RPG Immersion"**. Native browser chrome and top navigation bars are hidden by default (`body.play-mode` hides `header`, `nav`, `footer`).

### Design Principles for Play Page Language
1. **Full-Screen Canvas Split**: The screen is dynamically split into a game view (`#phaserApp`) on the left and a parchment journal panel (`#sidePanel`) on the right, separated by a draggable wood splitter handle (`.resize-handler`).
2. **Hidden Header Drawer**: The global top navigation is hidden during gameplay to maximize screen real estate, accessible on demand via a fixed top-right toggle button (`#navToggle`).
3. **Tactile In-Game HUDs**: Overlays use heavy dark wood frames, parchment paper grain textures, leather trim (`--leather`, `#2a1b15`), and iron hardware (`--iron`, `#222`).
4. **Multi-Mode Context Interactions**: Right-clicking or pressing spacebar spawns custom parchment dropdown menus or radial sigil wheels (`.radial-ring`).

---

## 2. Color Palette & Functional Mapping

| Token / Color Name | Hex / Value | Usage on Play Page |
| :--- | :--- | :--- |
| `--bg-color` | `#2c241b` | Base canvas background |
| `--wood-dark` | `#3e2723` | Top nav bar background, side panel header, HUD borders, modal frames |
| `--wood-light` | `#5d4037` | Side panel tab buttons, drawer borders, resize splitter hover state |
| `--wood-accent` | `#795548` | Active splitter highlight, item slot borders |
| `--leather` | `#2a1b15` | Vertical clothing tower tabs, drop button background |
| `--parchment` | `#f3e5ab` | Side panel paper background, context menu fill, satchel drawer interior |
| `--parchment-light` | `#faf3e0` | Paper notes, chat message cards |
| `--parchment-dark` | `#e6d598` | Tab text default state |
| `--gold` | `#ffc107` | Active tab border, radial menu ring, intent focus glow |
| `--iron` | `#222` | Intent HUD spine plate background |
| `Health Red` | `#ff4c4c` | Health bar fill & icon |
| `Stamina Gold` | `#ffd700` | Stamina bar fill & icon |
| `Mana Blue` | `#4169e1` | Mana bar fill & icon |
| `Intent Friendly` | `#4caf50` | Green smiling face sigil glow |
| `Intent Grabbing` | `#ffc107` | Gold fist sigil glow |
| `Intent Hostile` | `#f44336` | Red crosshairs sigil glow |

---

## 3. Typography Hierarchy

| Role | Font Family | Size | Weight / Style | Color | Visual Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Journal Tabs (`.menuTabs`)**| `'Cinzel', serif` | `0.85rem` | Bold | `#e6d598` / `#3e2723` | Flex column with FontAwesome icons |
| **Note Headings (`h3`)** | `'Cinzel', serif` | `1.3rem` | Bold | `#8b0000` | 2px dashed wood border bottom |
| **Handwritten Notes (`.paper-note`)**| `'Caveat Brush', cursive`| `1.2rem` | Normal | `#5d4037` | Rotated `-0.5deg` with center pinhead |
| **HUD Stat Text** | `'Lato', sans-serif` | `0.75rem` | Bold | `#ffffff` | Centered on status bar fill |
| **Chat Message Log** | `'Crimson Pro', serif` | `1.0rem` | Normal | `#3e2723` | Parchment scroll feel |
| **Writing Desk Area (`#textarea`)**| `'Crimson Pro', serif` | `1.15rem` | Normal | `#3e2723` | Contenteditable parchment pad |
| **Context Menu Items**| `'Cinzel', serif` | `0.95rem` | Normal | `#3e2723` | Slide 5px right on hover |
| **Radial Menu Items** | `'Cinzel', serif` | `0.65rem` | Bold | `#e5d8b8` | Positioned around circular ring |
| **Debug Stats** | `'Cinzel', serif` | `0.8rem` | Bold | `#3e2723` | Debug stats readout |

---

## 4. Component & UI Specifications

### 4.1 Hidden Header Navigation Drawer (`#navToggle` & `nav`)
* **Toggle Button (`#navToggle`)**:
  * Position: Fixed top-right (`top: 10px; right: 10px; z-index: 10000`).
  * Appearance: Circular `40px x 40px` dark wood button (`#3e2723`), `2px solid #5d4037` border, gold icon (`#ffc107`).
  * Icon: Toggles between FontAwesome `fa-bars` (closed) and `fa-xmark` (open).
  * Hover: Scales `1.1x`, background turns `#5d4037`.
* **Top Navigation Bar (`body.play-mode.nav-visible nav`)**:
  * Display: Fixed overlay across top (`top: 0; left: 0; width: 100%; z-index: 9999`).
  * Styling: Dark semi-transparent background `rgba(44, 36, 27, 0.95)` with `backdrop-filter: blur(5px)` and a `4px solid #3e2723` bottom border.
  * Links (`Home`, `TileWeaver`, `Character Bank`, `Chat Archives`, `Logout`): Fully functional nav controls allowing players to leave play mode.

---

### 4.2 Left Column: Phaser Canvas & On-Screen HUD Overlays (`#phaserApp`)

1. **Player Stats HUD (`#stats-hud`)**:
   * Position: Top-left overlay on canvas.
   * Bars: Health (Red `#ff4c4c`), Stamina (Gold `#ffd700`), Mana (Blue `#4169e1`).
   * Bar Styling: Translucent dark background, filled bar layer, centered text value (e.g. `100 / 100`).

2. **Intent "Iron Spine" Widget (`#intent-hud` & `gameOverlay.ejs`)**:
   * Position: Left screen edge overlay (`top: 50vh; left: 0px`).
   * Plate (`.intent-plate`): Dark iron plate (`--iron`, `#222`) with top and bottom metallic rivets.
   * Intent Sigils:
     * **Friendly** (`#intent-friendly`): Green face smile icon (`<i class="fa-regular fa-face-smile"></i>`). Active glow: `rgba(76, 175, 80, 0.6)`.
     * **Grabbing** (`#intent-grabbing`): Gold fist icon (`<i class="fa-solid fa-hand-fist"></i>`). Active glow: `rgba(255, 193, 7, 0.6)`.
     * **Hostile** (`#intent-hostile`): Red crosshairs icon (`<i class="fa-solid fa-crosshairs"></i>`). Active glow: `rgba(244, 67, 54, 0.6)`.
   * Hotkey Overrides: Shift triggers temporary *Grabbing*, Ctrl triggers temporary *Hostile*, Spacebar triggers radial menu.

3. **Dashboard Cluster & "Pockets" Satchel Inventory (`#dashboard-cluster`)**:
   * Position: Anchored bottom-right over canvas (`bottom: 0; right: 0`).
   * **Active Hands HUD (`.hands-hud`)**: Sits on top of the inventory drawer. Contains Left and Right hand item slots (`60px x 60px`) with gold labels and a `Drop` button.
   * **Satchel Drawer (`#satchel-drawer`)**: Parchment sliding drawer that expands smoothly (`max-height: 220px; transition: all 0.4s`). Divided into fluid horizontal pocket columns (*Small Pockets*, *Main Satchel*, etc.). Items display size pips and capacity gauge bars.
   * **Clothing Tower Sidecar (`.clothing-tower`)**: Vertical stack of leather tab handles (`.tower-tab`, `54px x 50px`) on the right side of the satchel drawer. Hovering a tab displays a gold-bordered tooltip (`tower-tab::after`).

---

### 4.3 Right Column: The Journal & Writing Desk (`#sidePanel`)

The right panel is divided into two vertical sections via a resizer handle (`#vertical-resize-handler`):

#### A. Top Half: Journal Tab System (`#menu` & `partials/menu.ejs`)
Nav tabs (`.menuTabs`) use `'Cinzel'` font with FontAwesome icons. Active tab turns parchment `#f3e5ab` with a gold top border line.

1. **Look Tab (`#lookDisplay`)**:
   * Contains the `"Inspection"` paper note (`.paper-note` in `'Caveat Brush'` font, rotated `-0.5deg` with pinhead). Instructions on right-clicking objects.
2. **Apparel Tab (`#apparelDisplay`)**:
   * Contains the **Paper Doll Component** (`.paper-doll-wrapper`). Features a dark stage background (`--doll-bg`, `#1a1512`) with radial glow, surrounded by an equipment grid (`#equipment-grid`) for armor, weapons, and accessories.
3. **Spells Tab (`#spellsDisplay`)**:
   * Contains the **Spellbook Table** (`#spellsTable`). Rows highlight and scale `1.02x` on hover. Displays spell icon cell, name, and description.
4. **Map Tab (`#mapDisplay`)**:
   * Contains the **World Map** paper note with a large map icon (`fa-map-location-dot`).
5. **Vore Tab (`#voreDisplay`)**:
   * Features the **Gestalt Status** header and an **"Open Forge"** button (`#openAnatomyForgeBtn`) which opens the full Anatomy Forge modal. Lists active organ destinations and contents roster.
6. **Options Tab (`#optionsDisplay`)**:
   * Contains toggle switches for **Debug Mode (Hitboxes)** and **Interactive Tutorial Checklist**.
   * Includes the **Interactive Controls Refresher** box.
   * Includes **Debug Statistics** (Coordinates, Latency/RTT, Server Distance, Bandwidth, FPS/Entities) and a live canvas graph renderer (`#debug-graph`).

#### B. Bottom Half: Chat & Writing Desk (`#chat` & `partials/chat.ejs`)
* **Tab Scope**: Switches between `Local` and `Global` chat channels (`Local` is first and selected by default).
* **Message Log (`#messages`)**: Scrollable Parchment scroll display (`font-family: 'Crimson Pro'`). Supports a floating `"New Messages"` jump button.
* **Formatting Toolbar**: Dark wood control bar featuring text styling buttons (Bold, Italic, Underline, Strike, Subscript, Superscript).
* **Magical Spoiler Select (`#spoilers`)**: Dropdown to categorize message spoilers (*No Spoiler*, *General*, *Watersports*, *Scat/Disposal*, *Gore*).
* **Spoiler Preferences Modal**: Settings gear dropdown (`[data-dropdown]`) containing default hiding checkboxes for sensitive themes.
* **Writing Desk Pad (`#textarea`)**: `contenteditable="true"` parchment text area with character counter (`0/10000`). Triggers a modal dialog (`#char-limit-modal`) if character count exceeds 10,000 runes.

---

### 4.4 Menus, Radial Wheels & Tooltips

1. **Right-Click Context Menu (`#contextMenu` & `contextMenu.css`)**:
   * Position: Absolute overlay (`z-index: 20000`). Parchment card fill with `2px solid #3e2723` frame and 3D shadow.
   * Items (`#contextMenu li`): Font `'Cinzel'`, `0.95rem`. Hover state: background turns light wood (`#5d4037`), text turns gold (`#ffc107`), shifts left `20px`.
   * Nested Submenus (`.subMenu`): Slide out to the right (`animation: slideRight`) with an invisible mouse bridge to prevent accidental closure.
2. **Radial Sigil Menu (`#contextMenu.radial`)**:
   * Triggered by holding Spacebar.
   * Outer Ring (`.radial-ring`): `220px x 220px` circle with a `3px solid #ffc107` gold border.
   * Center Badge (`.radial-center`): Parchment circle with dark wood label.
   * Sigil Nodes (`.radial-item`): 4 circular action nodes (`pos-up`, `pos-right`, `pos-down`, `pos-left`). Hovering scales node `1.18x` with a gold glow (`box-shadow: 0 0 10px #ffc107`).
3. **Hover Tooltips (`.context-tooltip`)**:
   * Floating tooltip box (`background: rgba(18, 12, 8, 0.95)`), gold title text, light blue action hints.

---

## 5. Key Discrepancies Observed on Play Page vs. Previous Pages

1. **Hidden Navigation Chrome**:
   * *Other Pages*: Always display the top `<header>` and `<nav>` bars.
   * *Play Page*: Hides top header/nav by default (`body.play-mode`), revealing them on demand via `#navToggle`.
2. **Side Panel Resizing Splitter**:
   * *Play Page*: Uses dual resizer handles — horizontal (`.resize-handler`) between game canvas and journal panel, and vertical (`.resize-handler-v`) between upper menu tabs and lower chat window.
3. **Rich Canvas & HUD Overlays**:
   * Introduces HUD bars (Health/Stamina/Mana), Iron Spine Intent widget, dynamic Satchel Drawer, radial sigil wheel, and live Phaser canvas renderer.
