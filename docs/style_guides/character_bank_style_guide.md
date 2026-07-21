# TastyTails Page-Specific Style Guide: Character Bank (`http://localhost:3000/character-bank`)

> **Note**: This document is the page-specific design specification for the **Character Bank (`/character-bank`)**. It captures the exact design language, color palette, typography hierarchy, UI components, card system, contextual menus, modal dialogs, and interactive states currently governing the character selection and management experience. It serves as Step 2 in building the universal design system for TastyTails.net.

---

## 1. Theme & Design Philosophy

The Character Bank page expands upon the **"Warm Medieval Tavern & Guild Registry"** aesthetic by introducing a tactile **"Guild Dossier & Wanted Poster / Registry Card"** layout.

### Design Principles for Character Bank Language
1. **Dossier Cards**: Each character is displayed as a pinned parchment dossier sheet (`.char-card`), complete with an iron pin head (`.card-pin`), handwritten character details, a color-coded head avatar frame, and dual action keycaps.
2. **Handwritten Personalities**: Character names, full titles, stats (pronouns), and bios explicitly use `'Caveat Brush', cursive` to simulate ink signatures and hand-drawn tavern records.
3. **Parchment vs. Slate Contrast**: Cards float on a dark wood background using deep 3D drop shadows (`10px 10px 20px rgba(0,0,0,0.6)`), lifting and tilting subtly (`rotateX(2deg) translateY(-10px)`) on hover.
4. **Permanent Action Protection**: Destructive operations (character deletion) use an immersive medieval confirmation dialog box (`.modal-box`) with a forced disclaimers check.

---

## 2. Color Palette & Functional Mapping

| Token / Color Name | Hex / Value | Usage on Character Bank Page |
| :--- | :--- | :--- |
| `--palette-bg` | `#2c241b` | Main body canvas background (covered by subtle wood texture) |
| `--palette-wood-dark` | `#3e2723` | Header/footer background, avatar border frame, card gear menu icon, modal outer border |
| `--palette-wood-light` | `#5d4037` | Species badge background, Edit button background, bio preview quote color |
| `--palette-parchment` | `#f3e5ab` | Character card background, context menu background, modal card background |
| `--palette-parchment-dark` | `#e6d598` | Page subtitle text, context menu hover background |
| `--palette-gold` | `#ffc107` / `#FFD700` | Header title color, header bottom border, "Register New" hover border & icon color |
| `--palette-text-dark` | `#3e2723` | Main nickname text ink, stat text color, modal body text |
| `Fullname Ink` | `#6d4c41` | Lighter brown ink used specifically for character full names |
| `--palette-accent-blue` | `#283593` | Primary action button ("Play") |
| `Shadow Blue` | `#1a237e` | Solid 3D box shadow beneath Play button |
| `Shadow Wood` | `#3e2723` | Solid 3D box shadow beneath Edit button |
| `--palette-accent-red` | `#8b0000` | Delete action menu option hover, modal warning header, "Yes, Delete" button |

---

## 3. Typography Hierarchy

| Role | Font Family | Size | Weight / Style | Color | Visual Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Title (`h2`)** | `'Cinzel', serif` | `3.0rem` | Bold | `#f3e5ab` (`--palette-parchment`) | Text shadow: `0 2px 10px rgba(0,0,0,0.8)`, centered |
| **Page Subtitle (`p`)**| `'Lato', sans-serif` | `1.0rem` | Italic | `#e6d598` (`--palette-parchment-dark`) | Centered beneath page title |
| **Card Nickname (`h3`)**| `'Caveat Brush', cursive`| `2.4rem` | Normal | `#3e2723` | Handwritten signature feel, clamped to 2 lines max |
| **Card Full Name** | `'Caveat Brush', cursive`| `1.2rem` | Normal | `#6d4c41` | Secondary handwritten ink title |
| **Species Badge** | `'Lato', sans-serif` | `0.8rem` | Bold / Uppercase | `#f3e5ab` | `1px` letter-spacing, pill badge container |
| **Stats (Pronouns)**| `'Caveat Brush', cursive`| `1.3rem` | Normal | `#3e2723` | Accompanied by small `fa-venus-mars` icon |
| **Bio Preview** | `'Caveat Brush', cursive`| `1.2rem` | Normal / Italic | `#5d4037` | Wrapped in quotes `"..."`, clamped to 4 lines |
| **Card Action Buttons**| `'Cinzel', serif` | `0.9rem` | Bold / Uppercase | `#ffffff` / `#f3e5ab` | Flex center with icon gap `5px` |
| **Add Card Text** | `'Cinzel', serif` | `1.5rem` | Bold | `#f3e5ab` | Transitions to gold (`#ffc107`) on hover |
| **Modal Title (`h2`)** | `'Cinzel', serif` | `1.6rem` | Bold | `#8b0000` | 2px solid dark ink bottom border |

---

## 4. UI Components & Layout Specification

### 4.1 Page Header (`.page-title`)
* **Container**: Centered, `margin-bottom: 40px`.
* **Main Heading (`<h2>`)**:
  * Content: `"Character Registry"`.
  * Font: `'Cinzel', serif`, `3.0rem`, color `--palette-parchment` (`#f3e5ab`).
  * Drop Shadow: `0 2px 10px rgba(0, 0, 0, 0.8)`.
* **Subtitle Paragraph (`<p>`)**:
  * Content: `"Select your persona to enter the world..."`.
  * Font: `'Lato', sans-serif`, `1.0rem`, italic, color `--palette-parchment-dark` (`#e6d598`).

---

### 4.2 Character Grid Layout (`.character-grid` / `#bankUl`)
* **Grid Specifications**:
  * Display: CSS Grid with `repeat(auto-fill, minmax(300px, 1fr))`.
  * Gap: `30px` between cards.
  * Padding: `0 40px` to prevent touching screen edges.
  * Max Width: `1600px`, aligned center (`margin: 0 auto`).
  * Perspective: `perspective: 1000px` (enables 3D card tilt on hover).

---

### 4.3 Character Dossier Card Component (`.char-card`)
* **Card Container**:
  * Dimensions: Fixed height `600px`, flex column layout.
  * Background: `--palette-parchment` (`#f3e5ab`) with `cream-paper.png` paper texture.
  * Border: `1px solid #d7c496`, radius `8px`.
  * Shadows: Outer 3D drop shadow `10px 10px 20px rgba(0, 0, 0, 0.6)` + inner parchment vignette `inset 0 0 40px rgba(160, 82, 45, 0.2)`.
  * Hover Interaction: `transform: translateY(-10px) rotateX(2deg)`, shadow expands to `0 20px 30px rgba(0, 0, 0, 0.5)`.
* **Header Section (`.card-header`)**:
  * Height: `160px`, centered flex layout, padding `25px 15px 15px 15px`.
  * Bottom Rule: `2px dashed rgba(62, 39, 35, 0.3)`.
  * Decorative Pin (`.card-pin`): `15px x 15px` pinhead centered at `top: 10px; left: 50%`, `radial-gradient(circle at 30% 30%, #a9a9a9, #555)` fill, drop shadow `1px 2px 3px rgba(0,0,0,0.5)`.
  * Settings Gear Icon (`.card-options-btn`): Absolute position `top: 10px; right: 10px`, color `#3e2723`, opacity `0.5`, hover opacity `1.0`.
  * Dropdown Options Menu (`.context-menu`):
    * Position: Absolute `top: 40px; right: 10px; width: 140px; z-index: 100`.
    * Styling: Parchment background with paper texture, border `2px solid #3e2723`, radius `4px`, shadow `0 4px 12px rgba(0,0,0,0.4)`.
    * Menu Items (`<li><a href="#">`): Font `'Cinzel'`, `0.9rem` bold, color `#3e2723`. Hover: background `#e6d598`, text color `#8b0000` (crimson red).
* **Body Section (`.card-body`)**:
  * Flex-1 column layout, centered alignment, space-between distribution.
  * **Species Badge (`.species-badge`)**: Background `#5d4037` (`--palette-wood-light`), text color `#f3e5ab`, padding `4px 12px`, radius `20px` (pill shape), font `'Lato'` `0.8rem` bold uppercase, shadow `0 2px 5px rgba(0,0,0,0.2)`.
  * **Avatar Placeholder (`.avatar-placeholder`)**: `90px x 90px` circle (`border-radius: 50%`), border `4px solid #3e2723` (`--palette-wood-dark`). Dynamic background color derived from character head data (fallback `#ddd`). Center paw icon (`fa-paw`) `2.5rem` size with `rgba(0,0,0,0.2)` fill.
  * **Stats Row (`.stats`)**: Font `'Caveat Brush'`, `1.3rem`, color `#3e2723`. Displays pronouns alongside FontAwesome `fa-venus-mars` icon.
  * **Bio Preview (`.description-preview`)**: Font `'Caveat Brush'`, `1.2rem`, color `#5d4037`, height `6.24rem` (clamped to 4 lines max with ellipsis).
* **Footer Section (`.card-footer`)**:
  * Height: `70px`, background `rgba(0, 0, 0, 0.05)`, padding `15px`, flex gap `10px`.
  * **Play Action Button (`.btn-play`)**:
    * Font: `'Cinzel'`, bold, uppercase, `0.9rem`.
    * Background: `#283593` (`--palette-accent-blue`), text `white`, radius `4px`.
    * 3D Keycap Shadow: `0 4px 0 #1a237e`.
    * Hover State: `transform: translateY(2px)`, shadow `0 2px 0 #1a237e`, background `#303f9f`.
  * **Edit Action Button (`.btn-edit`)**:
    * Font: `'Cinzel'`, bold, uppercase, `0.9rem`.
    * Background: `#5d4037` (`--palette-wood-light`), text `#f3e5ab` (`--palette-parchment`), radius `4px`.
    * 3D Keycap Shadow: `0 4px 0 #3e2723`.
    * Hover State: `transform: translateY(2px)`, shadow `0 2px 0 #3e2723`.

---

### 4.4 "Register New" Add Card (`.add-card`)
* **Card Container**:
  * Height: `600px` (matches dossier cards).
  * Background: `rgba(255, 255, 255, 0.05)`.
  * Border: `3px dashed #f3e5ab` (`--palette-parchment`), radius `8px`.
  * Layout: Flex column, centered content.
* **Plus Icon (`.add-icon`)**:
  * FontAwesome `fa-circle-plus`, size `4rem`, color `#f3e5ab`.
  * Hover: Color transitions to `--palette-gold` (`#ffc107`).
* **Text (`.add-text`)**:
  * Font: `'Cinzel', serif`, size `1.5rem`, color `#f3e5ab`. Text: `"Register New"`.
* **Card Hover Interaction**:
  * Background fills to `rgba(255, 255, 255, 0.1)`, border color turns gold (`#ffc107`), card scales up `1.02x`.

---

### 4.5 Delete Confirmation Modal Dialog (`#deleteModal` / `.modal-box`)
* **Backdrop Overlay (`.modal-overlay`)**:
  * Fixed overlay (`top:0; left:0; width:100%; height:100%`), background `rgba(0,0,0,0.7)`, `backdrop-filter: blur(5px)`, z-index `1000`.
* **Modal Box (`.modal-box`)**:
  * Max width `500px` (width `90%`), padding `30px`.
  * Background: `#f3e5ab` (`--palette-parchment`), border `4px solid #3e2723` (`--palette-wood-dark`), radius `8px`, drop shadow `0 0 30px rgba(0,0,0,0.8)`.
  * **Header (`h2#modalTitle`)**: Font `'Cinzel'`, color `#8b0000` (`--palette-accent-red`), border bottom `2px solid #3e2723`.
  * **Warning Summary Box (`.warning-list`)**: Background `rgba(0, 0, 0, 0.05)`, padding `15px`, radius `4px`.
  * **Confirmation Checkbox (`.checkbox-container`)**: Flex row with checkbox disclaiming permanent deletion.
  * **Action Buttons (`.modal-actions`)**:
    * **Cancel Button (`.btn-cancel`)**: Background `#ccc`, color `#333`, padding `10px 20px`, radius `4px`, bold text.
    * **Delete Button (`.btn-delete`)**:
      * Disabled state: Background `#8b0000`, opacity `0.5`, cursor `not-allowed`.
      * Active state (`.btn-delete.active`): Opacity `1.0`, cursor `pointer`.

---

## 5. Key Style Discrepancies Observed on Character Bank vs. Home Page

1. **Page Title Layout**:
   * *Home Page*: Title is embedded directly inside the Notice Board card (`h2.notice-title`) at `3.5rem` size in Crimson Red (`#8b0000`).
   * *Character Bank*: Uses a standalone top-level `.page-title` block with an `h2` at `3.0rem` size in Parchment (`#f3e5ab`) with heavy text shadow.
2. **Typography Usage for Details**:
   * *Character Bank*: Uses `'Caveat Brush', cursive` for character nicknames, full names, bio previews, and stats.
   * *Home Page*: Uses `'Caveat Brush'` only for subtitles ("Pardon the Dust!", "Welcome back, traveler."), relying on `'Lato'` for body text.
3. **Card Border Sizes**:
   * *Notice Board*: Uses `8px solid #3e2723`.
   * *Character Dossier Card*: Uses `1px solid #d7c496`.
   * *Modal Box*: Uses `4px solid #3e2723` (Notice Board uses `12px solid #271815` for modal).
4. **Button Variant Extensions**:
   * Introduces `.btn-edit` using `--palette-wood-light` (`#5d4037`) with dark wood keycap shadow (`#3e2723`).
