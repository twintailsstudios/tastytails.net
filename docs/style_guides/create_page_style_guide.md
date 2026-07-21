# TastyTails Page-Specific Style Guide: Character Creator (`http://localhost:3000/create`)

> **Note**: This document is the page-specific design specification for the **Character Creator (`/create`)**. It captures the exact design language, multi-tab ledger architecture, form controls, star ratings, the node-graph **Anatomy Forge**, and the **Preview Mirror** rendering column. It serves as Step 3 in building the universal design system for TastyTails.net.

---

## 1. Theme & Design Philosophy

The Character Creator represents the **"Guild Ledger & Magical Mirror of Transformation"**. It balances an organized multi-page parchment record book (the Ledger) on the left with a dark, magical scrying glass (the Preview Mirror) on the right.

### Design Principles for Character Creator Language
1. **The Guild Ledger**: Form controls are arranged inside a heavy dark wood binder (`10px solid #3e2723`) with parchment pages (`#f3e5ab`) and tabbed dividers (`Cinzel` buttons with gold active underlines).
2. **Magical Selects & Inputs**: Native dropdowns are replaced by custom animated select lists where hovering options causes a gold paw print icon (`\f1b0`) to slide out alongside crimson red text.
3. **Anatomy Forge Graph Engine**: The Vore tab hosts a visual node-graph canvas where body parts and pathways are mapped as parchment cards (`.af-node`) connected by Bezier ink lines (`path.af-connector`) and wax seal controls (`.af-node-edit-btn`).
4. **Scrying Mirror Preview**: The sprite renderer is housed inside an arch-topped metallic lens with a dark dragon-scale frame (`black-scales.png`), flanked by dark wood action controls.

---

## 2. Color Palette & Functional Mapping

| Token / Color Name | Hex / Value | Usage on Character Creator Page |
| :--- | :--- | :--- |
| `--bg-color` | `#2c241b` | Main body canvas background (wood pattern) |
| `--wood-dark` | `#3e2723` | Ledger outer frame, inactive tab background, preview button base |
| `--wood-light` | `#5d4037` | Tab bar background, collapsible border, mirror outer frame border |
| `--parchment` | `#f3e5ab` | Active tab background, Ledger parchment background, custom select menu |
| `--parchment-dark` | `#e6d598` | Inactive tab text, palette label text, reset button border |
| `--gold` | `#ffc107` | Active tab bottom shadow (`0 -4px 0 #ffc107 inset`), star rating fill, hover paw print icon |
| `--text-dark` | `#3e2723` | Main ink text for labels, inputs, and dropdown options |
| `--accent-red` | `#8b0000` | Collapsible hover text, wax seal node edit buttons, reset button hover state |
| `--accent-blue` | `#283593` | Form input focus border, finish button background, active sub-collapsible text |
| `--node-entrance` | `#6b8c42` | Green top stripe on entrance nodes & green socket (`IN`) |
| `--node-path` | `#d4a356` | Gold top stripe on path nodes |
| `--node-dest` | `#a84a4a` | Crimson top stripe on destination nodes & red socket (`OUT`) |
| `--node-exit` | `#7a6e63` | Grey top stripe on exit nodes |

---

## 3. Typography Hierarchy

| Role | Font Family | Size | Weight / Style | Color | Visual Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Main Tabs** | `'Cinzel', serif` | `1.1rem` | Bold | `#e6d598` / `#3e2723` | Rounded top corners (`8px 8px 0 0`) |
| **Section Headings (`h2`)**| `'Cinzel', serif` | `1.5rem` | Bold | `#3e2723` | 2px dashed wood border bottom |
| **Collapsible Headers** | `'Cinzel', serif` | `1.2rem` | Bold | `#3e2723` | Flex space-between with chevron icon |
| **Form Labels** | `'Caveat Brush', cursive`| `1.2rem` | Normal | `#5d4037` | Handwritten label text |
| **Dropdown Options** | `'Lato', sans-serif` | `0.95rem` | Normal | `#3e2723` | Hover shifts padding left with gold paw icon |
| **Inputs / Textareas** | `'Lato', sans-serif` | `1.0rem` | Normal | `#3e2723` | Dark ink on transparent / paper fill |
| **Star Rating Item** | `'Caveat Brush', cursive`| `1.1rem` | Normal | `#3e2723` | Star rating list items |
| **Anatomy Node Label** | `'Cinzel', serif` | `0.9rem` | Bold | `#2c241b` | Center text inside node card |
| **Anatomy Inspector Header**| `'Cinzel', serif` | `1.2rem` | Bold | `#2c241b` | Centered title in paper drawer |
| **Mirror Control Labels** | `'Cinzel', serif` | `0.9rem` | Bold | `#f3e5ab` | Dashed border bottom |
| **Mirror Control Buttons** | `'Cinzel', serif` | `0.9rem` | Bold | `#ffc107` | Dark wood background with light border |

---

## 4. Sub-Tab & Component Specifications

### 4.1 Primary Tab Navigation (`#primaryButtons`)
* **Bar Container**: Background `#5d4037` (`--wood-light`), bottom border `4px solid #3e2723` (`--wood-dark`).
* **Tabs**:
  1. **Style**: Icon `<i class="fa-solid fa-shirt"></i>`
  2. **About**: Icon `<i class="fa-solid fa-feather-pointed"></i>`
  3. **Kinks**: Icon `<i class="fa-solid fa-heart"></i>`
  4. **Vore**: Icon `<i class="fa-solid fa-utensils"></i>`
* **Tab Interaction**: Inactive tabs have background `#3e2723` and `0.7` opacity. Active tab (`.active-tab`) transitions to parchment `#f3e5ab`, opacity `1.0`, dark wood text `#3e2723`, and an inset gold top underline (`box-shadow: 0 -4px 0 #ffc107 inset`).

---

### 4.2 Tab 1: Style Specifications (`#genderPullout`)
* **Collapsibles (`.collapsible`)**: Accordion headers for *Base Shape*, *Head*, *Body*, and *Tail*. Font `'Cinzel'` `1.2rem` bold. On hover/active: text turns red `#8b0000`.
* **Selection Container (`.selectionContainer`)**: Row container with background `rgba(255, 255, 255, 0.4)`, radius `4px`.
* **Custom Dropdown Select (`.custom-select-wrapper`)**:
  * Native `<select>` elements hidden (`display: none`).
  * Custom Trigger (`.custom-select__trigger`): Transparent background, bottom border `2px solid #5d4037`, animated chevron arrow.
  * Custom Options Menu (`.custom-options`): Parchment `#f3e5ab` card with `cream-paper.png` texture, border `2px solid #3e2723`, drop shadow `0 5px 15px rgba(0,0,0,0.3)`.
  * Hover Effect (`.custom-option:hover`): Text turns red `#8b0000`, padding shifts to `25px`, and a gold FontAwesome paw print (`\f1b0`) scales into view.
* **Color Pickers (`.pickr` / `.pcr-button`)**: Circular `2rem x 2rem` button, border `2px solid #3e2723`, shadow `0 2px 5px rgba(0,0,0,0.3)`.

---

### 4.3 Tab 2: About Specifications (`#aboutPullout`)
* **Section Title**: `"Personal Details"` (`h2` in `'Cinzel'`, `2px dashed #3e2723` bottom border).
* **Text Fields**: First Name, Last Name, Nick Name, Species Name. Signature line inputs (transparent background, bottom border `2px solid #5d4037`). Focus state: bottom border `#283593` (blue), background `rgba(255, 255, 255, 0.4)`.
* **Pronouns**: Radio flex row for She/Her and He/Him (`font-family: 'Lato'`).
* **Textarea Boxes**: In-Character (`#icDescrip`) and Out-Of-Character (`#oocDescrip`) textareas inside collapsible containers.

---

### 4.4 Tab 3: Kinks Specifications (`#kinksPullout`)
* **Title & Subtitle**: `"Preferences"` in `'Cinzel'`, followed by `"Rate your interest from 1 to 5 stars."` in italic text.
* **Grid Layout (`#kinksInput ul`)**: CSS Grid `repeat(auto-fill, minmax(280px, 1fr))`, gap `15px`.
* **Kink Items (`<li>`)**: Background `rgba(255, 255, 255, 0.2)`, border `1px solid rgba(62, 39, 35, 0.1)`, radius `4px`, font `'Caveat Brush', cursive` `1.1rem` in dark ink `#3e2723`.
* **Star Rating Component (`.rating`)**: Reversed flex row using SVG star mask images. Default state: `rgba(62, 39, 35, 0.3)`. Hover/Selected state: Fill color turns metallic gold `#ffc107`.

---

### 4.5 Tab 4: Vore / Anatomy Forge Specifications (`#vorePullout` & `partials/anatomy_forge.ejs`)
* **Wrapper Container (`.af-wrapper`)**:
  * Dimensions: Full flex layout, min-height `600px`.
  * Background: Parchment `--bg-parchment` (`#f4e4bc`) with subtle radial vignette and SVG fractal noise texture overlay. Font `'Lora', serif`. Border `4px solid #4a3c31`.
* **Toolbox Sidebar (`.af-sidebar`)**: Width `200px`, background `#4a3c31` (`--wood-dark`), right border `4px solid #2c241b`.
* **Node Category Buttons (`.af-node-btn`)**:
  * Entrance: Green stripe (`#6b8c42`)
  * Path: Gold stripe (`#d4a356`)
  * Destination: Red stripe (`#a84a4a`)
  * Exit: Grey stripe (`#7a6e63`)
* **Node Canvas & Connections (`.af-canvas-container` / `#af-world`)**:
  * Bezier Curve Layer (`#af-connections-layer`): Dark ink paths (`stroke: #2c241b`, `stroke-width: 3`) with white crossing halos (`stroke-width: 8px`). Hovering connection line turns it accent red `#a84a4a` (`stroke-width: 5`).
  * Nodes (`.af-node`): Rounded parchment cards (`border-radius: 12px`), `2px solid #2c241b` border, 3D ink shadow `3px 3px 0 rgba(44, 36, 27, 0.2)`, top color category stripe (`6px solid`).
  * Wax Seal Edit Button (`.af-node-edit-btn`): Red circular button (`#a84a4a`), scales `1.15x` and rotates `10deg` on hover.
  * Connection Sockets (`.af-socket`): Green `#6b8c42` input (`IN`) at top, Red `#a84a4a` output (`OUT`) at bottom.
* **Inspector Drawer (`.af-inspector`)**: Width `300px`, paper background `#fdf6e3` with noise texture, slides out from right (`transform: translateX(100%)` to `translateX(0)`).

---

### 4.6 Right Column: Preview Mirror Specifications (`#previewContainer`)
* **Mirror Container**:
  * Sticky positioning (`position: sticky; top: 20px`).
  * Outer Frame: Heavy wood frame `12px solid #5d4037` (`--wood-light`), `20px` top radius, background `#1a1a1a` layered with `black-scales.png` texture pattern.
  * Inner Lens Frame (`#previewAndButtons`): Arch-top window shape (`border-radius: 100px 100px 10px 10px`), metallic rim `4px solid #888`, background `#333`, inset shadow `inset 0 0 20px rgba(0,0,0,0.8)`. Contains Phaser canvas.
* **Control Panels (`.preview-controls`)**:
  * View Rotation Buttons (`#rotateLeft`, `#rotateRight`): Dark wood background `#3e2723`, border `2px solid #5d4037`, gold text `#ffc107`, font `'Cinzel'`.
  * Action Buttons (`#randomizer`, `#resetMainDefaults`):
    * Randomize (`fa-dice`): Gold text `#ffc107` on dark wood background.
    * Reset (`fa-trash-can-arrow-up`): Transparent background, `1px solid #e6d598` outline. On hover: background turns red `#8b0000` with white text.
  * Base Palette Pickers: Color swatch pickers for Primary, Secondary, and Accent colors.

---

## 5. Discrepancies Observed on Character Creator vs. Previous Pages

1. **Tab Button Active Indicator**:
   * *Home / Character Bank Nav*: Hover text turns gold (`#ffc107`) with gold text glow.
   * *Character Creator Tabs*: Active tab uses an **inset gold top border** (`box-shadow: 0 -4px 0 #ffc107 inset`) and transitions background to parchment (`#f3e5ab`).
2. **Form Dropdown Customization**:
   * *Character Creator*: Features a custom dropdown implementation where option hover reveals a sliding gold paw icon (`\f1b0`) and red text. (Neither Home nor Character Bank have custom dropdowns).
3. **Anatomy Forge Typography & Colors**:
   * *Anatomy Forge*: Introduces `'Lora', serif` font for body text and inspector fields, along with specialized node category tokens (`--node-entrance`, `--node-path`, `--node-dest`, `--node-exit`).
4. **Scrying Mirror Frame Aesthetics**:
   * *Preview Mirror*: Introduces a dark scale texture pattern (`black-scales.png`), an arch-topped metallic lens window (`border-radius: 100px 100px 10px 10px`), and sticky right-column positioning.
