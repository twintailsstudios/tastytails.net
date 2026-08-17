# TastyTails Page-Specific Style Guide: Home Page (`http://localhost:3000/`)

> **Note**: This document is the page-specific design specification for the **Home Page (`/`)**. It captures the exact design language, color palette, typography hierarchy, UI components, interactive states, and layout guidelines currently governing the home landing experience. It serves as Step 1 in building the universal design system for TastyTails.net.

---

## 1. Theme & Design Philosophy

The Home Page embodies a **"Warm Medieval Tavern & Guild Registry"** aesthetic. The visual theme simulates tactile, real-world materials: dark wood frames, parchment paper, brass/iron nails, gold gilding, and ink typography.

### Design Principles for Home Page Language
1. **Material Realism**: Elements use layered textures (wood grain, parchment paper), subtle rotations, drop shadows, and inset highlights to feel physically pinned or placed.
2. **High-Contrast Warmth**: Dark wood (`#3e2723`) frames cream/parchment (`#f3e5ab`) surfaces, highlighted by metallic gold (`#ffc107`) and deep tavern blue (`#283593`).
3. **Tactile Interactivity**: Buttons mimic physical 3D keycaps or wooden tabs that depress downward (`translateY(2px)`) when hovered/clicked.

---

## 2. Color Palette & Functional Mapping

| Token Name | Hex / Value | Usage on Home Page |
| :--- | :--- | :--- |
| `--palette-bg` | `#2c241b` | Main body canvas background (covered by subtle wood texture) |
| `--palette-wood-dark` | `#3e2723` | Top header gradient start, footer background, notice board outer border |
| `--palette-wood-light` | `#5d4037` | Header gradient end, dashed dividers, image container frame, nail accent tones |
| `--palette-parchment` | `#f3e5ab` | Main Notice Board card background, navigation link default color |
| `--palette-parchment-dark` | `#e6d598` | Secondary parchment text, subtitle accents |
| `--palette-gold` | `#ffc107` / `#FFD700` | Header title color, header bottom border (`#FFD700`), nav hover text highlight |
| `--palette-text-dark` | `#3e2723` | Main ink text color for body paragraphs and card headers |
| `--palette-text-light` | `#f5f5f5` | White text on dark wood backgrounds |
| `--palette-accent-blue` | `#283593` | Primary Call-To-Action ("Play the Alpha!", "Login to Enter", "Sign Up!") |
| `--palette-accent-red` | `#8b0000` | Notice board main title ("Under Construction"), logout button hover state |
| `Shadow Blue` | `#1a237e` | Solid 3D box shadow beneath primary blue buttons |
| `Hover Blue` | `#303f9f` | Hover background state for primary blue buttons |

---

## 3. Typography Hierarchy

| Role | Font Family | Size | Weight / Style | Color | Visual Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Site Logo (`h1`)** | `'Cinzel', serif` | ~`2.2rem` (inherits `h1`) | Bold | `#ffc107` | Text shadow: `2px 2px 4px rgba(0,0,0,0.8)`, letter-spacing: `2px` |
| **Nav Links (`<a>`)** | `'Cinzel', serif` | `1.1rem` | Normal | `#f3e5ab` | Uppercase layout optional; flex row with 8px gap for icons |
| **Notice Title (`h2`)** | `'Cinzel', serif` | `3.5rem` | Bold | `#8b0000` | Bottom 2px dashed border (`#5d4037`), centered |
| **Notice Subtitle** | `'Caveat Brush', cursive` | `2.2rem` | Normal / Cursive | `#5d4037` | Hand-written Tavern note feel |
| **Notice Body (`p`)** | `'Lato', sans-serif` | `1.1rem` | Normal (`1.6` line-height) | `#3e2723` | Max width `600px`, centered alignment |
| **CTA Button Text** | `'Cinzel', serif` | `1.2rem` | Bold | `#ffffff` | Uppercase / title case |
| **Modal Header (`h1`)**| `'Cinzel', serif` | `1.8rem` | Bold | `#3e2723` | 2px solid gold bottom border |
| **Modal Subtitle (`p`)**| `'Caveat Brush', cursive` | `1.2rem` | Normal | `#5d4037` | Subtitle beneath modal header |
| **Form Inputs** | `'Lato', sans-serif` | `1.0rem` | Normal / Italic placeholder | `#3e2723` | Dark ink text on transparent background |
| **Footer Text** | `'Lato', sans-serif` | `0.8rem` | Light | `rgba(255,255,255,0.3)` | Centered |

---

## 4. UI Components & Layout Specification

### 4.1 Global Header & Navigation (`layout.ejs`)
* **Header Bar (`<header>`)**:
  * Height: `min-height: 70px`, padding top `30px`.
  * Background: `linear-gradient(to bottom, #3e2723, #5d4037)`.
  * Bottom Border: `4px solid #FFD700`.
  * Drop Shadow: `0 4px 15px rgba(0, 0, 0, 0.5)`.
  * Logo Icon: FontAwesome `fa-dragon` (`<i class="fa-solid fa-dragon"></i>`) preceding "TastyTails".
* **Navigation Bar (`<nav>`)**:
  * Background: `rgba(0, 0, 0, 0.3)` with `backdrop-filter: blur(5px)`.
  * Bottom Separator: `1px solid rgba(255, 215, 0, 0.3)`.
  * Container: Flex layout, max width `1200px`, space-between alignment.
  * Nav Tabs (`Home`, `TileWeaver`, `Character Bank`, `Chat Archives`):
    * Font: `'Cinzel', serif`, size `1.1rem`.
    * Default State: Color `--palette-parchment` (`#f3e5ab`), no underline.
    * Hover State: Color changes to `--palette-gold` (`#ffc107`) with `text-shadow: 0 0 8px #ffc107`, `0.3s` ease transition.
* **Logout / Login Navigation Control Button (`.logout-btn`)**:
  * Background: `transparent`.
  * Border: `1px solid #f3e5ab` (`--palette-parchment`).
  * Text Color: `#f3e5ab` (`--palette-parchment`).
  * Font: `'Cinzel', serif`, padding `5px 15px`, border-radius `4px`.
  * Hover State: Background transitions to `--palette-accent-red` (`#8b0000`), border color to `#8b0000`, text to `white`.

---

### 4.2 Main Page Content: Notice Board (`index.ejs` & `landing.css`)
* **Page Canvas (`<main>`)**:
  * Centered layout (`display: flex; justify-content: center; align-items: center`), padding `40px 20px`.
* **Notice Board Card (`.notice-board`)**:
  * Dimensions: Max width `800px`, full width responsive, padding `40px`.
  * Background: Parchment color `#f3e5ab` layered with transparent paper pattern texture (`cream-paper.png`).
  * Border: `8px solid #3e2723` (`--palette-wood-dark`), border-radius `4px`.
  * Shadowing: Inner shadow `inset 0 0 60px rgba(62, 39, 35, 0.4)` + outer drop shadow `0 20px 50px rgba(0,0,0,0.7)`.
  * Tilt Angle: `transform: rotate(-1deg)` (creates pinned paper effect).
* **Decorative Corner Nails (`.nail`)**:
  * 4 corners (`.tl`, `.tr`, `.bl`, `.br` at 15px offset).
  * Shape: `20px x 20px` circle (`border-radius: 50%`).
  * Fill: `radial-gradient(circle at 30% 30%, #a9a9a9, #444)` (3D metallic pinhead).
  * Shadow: `2px 2px 5px rgba(0, 0, 0, 0.5)`.
* **Notice Board Header (`.notice-title`)**:
  * Tag: `<h2>`. Font `'Cinzel'`, `3.5rem`, color `#8b0000` (`--palette-accent-red`).
  * Divider: `2px dashed #5d4037` (`--palette-wood-light`), inline-block width `80%`, padding bottom `20px`.
* **Notice Board Subtitle (`.notice-subtitle`)**:
  * Font: `'Caveat Brush'`, `2.2rem`, color `#5d4037`.
* **Primary Call-To-Action Button (`.cta-btn`)**:
  * Tag: `<a>` or `<button>`.
  * Layout: `inline-flex`, items centered, gap `10px`.
  * Font: `'Cinzel'`, bold, `1.2rem`.
  * Background: `#283593` (`--palette-accent-blue`), text `white`.
  * Padding: `15px 40px`, border-radius `4px`.
  * 3D Keycap Shadow: `box-shadow: 0 4px 0 #1a237e`.
  * Hover Interaction: `transform: translateY(2px)`, `box-shadow: 0 2px 0 #1a237e`, background `#303f9f`.
* **Under Construction Media Container (`.construction-img-container`)**:
  * Layout: `inline-flex`, centered, margin top `30px`.
  * Counter-Tilt: `transform: rotate(2deg)`.
  * Frame: `4px solid #5d4037` (`--palette-wood-light`), background `rgba(255,255,255,0.2)`, padding `5px`.
  * Shadow: `0px 4px 10px rgba(0,0,0,0.3)`.
  * Image: Min width `600px`, max width `100%`, height auto.
  * Fallback Icon (`.construction-icon`): FontAwesome `fa-hammer`, size `5rem`, color `#5d4037`.

---

### 4.3 Login & Registration Modal Overlay (`.registrationBox` & `.popUpContainer`)
* **Modal Backdrop (`.registrationBox`)**:
  * Position: Fixed full screen (`top:0; left:0; width:100%; height:100%`).
  * Fill: `rgba(0, 0, 0, 0.8)` with `backdrop-filter: blur(8px)`, z-index `2000`.
* **Book Frame (`.popUpContainer`)**:
  * Width: `900px` (max width `95%`), padding `40px`.
  * Background: Parchment `#f3e5ab` with cream paper texture.
  * Border: Heavy dark wood `12px solid #271815`, border-radius `8px`.
  * Layout: 2-column grid (`1fr 1px 1fr`) separated by a vertical 2px wood line (`.divider`).
* **Close Button (`.close button`)**:
  * Position: Absolute `top: -20px; right: -20px;`.
  * Shape: `45px x 45px` circle (`border-radius: 50%`).
  * Color Scheme: Dark wood background `#3e2723`, border `2px solid #5d4037`, icon color `#f3e5ab`.
  * Hover Interaction: Background turns red `#8b0000`, border `#8b0000`, text `white`, `transform: scale(1.1) rotate(90deg)`.
* **Form Inputs (`input`)**:
  * Style: "Signature line" look — background transparent, no top/left/right border, bottom border `2px solid #5d4037`.
  * Font: `'Lato', sans-serif`, `1rem`, dark wood ink text `#3e2723`.
  * Focus State: Background fills with light gold tint `rgba(255, 193, 7, 0.1)`, bottom border turns blue `#283593`.
* **Action Buttons (`.button`)**:
  * Width: `100%`, padding `12px`.
  * Font: `'Cinzel'`, bold, uppercase, `1.1rem`.
  * Background: `#283593` (`--palette-accent-blue`), 3D shadow `0 4px 0 #1a237e`.
  * Hover State: `transform: translateY(2px)`, shadow `0 2px 0 #1a237e`, background `#303f9f`.

---

### 4.4 Global Footer (`<footer>`)
* Background: `#3e2723` (`--palette-wood-dark`).
* Text Style: `rgba(255, 255, 255, 0.3)`, size `0.8rem`, centered.
* Margin: `margin-top: auto` (sticky bottom layout via flexbox body container).

---

## 5. Summary Checklist of Home Page Design Rules

When expanding or evaluating pages against the **Home Page Design Language**, check for:
- [x] **Header `h1` Title**: Gold text (`#ffc107`) with `Cinzel` serif font, dark text shadow, and gold bottom rule on header (`#FFD700`).
- [x] **Navigation Tabs**: Parchment-colored text on dark semi-transparent glass with gold text-glow on hover.
- [x] **Primary Action Buttons**: 3D keycap style with solid blue `#283593`, dark blue bottom shadow `#1a237e`, depressing 2px on hover.
- [x] **Secondary / Control Buttons**: Transparent background with parchment outline, transitioning to dark crimson `#8b0000` on hover.
- [x] **Card Panels**: Parchment background with paper grain texture, surrounded by dark wood frames and corner nail details.
- [x] **Typography Hierarchy**: Clear distinction between `Cinzel` (titles/nav/buttons), `Caveat Brush` (handwritten subtitles/notes), and `Lato` (body ink text/inputs).
