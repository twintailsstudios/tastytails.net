# TastyTails Page-Specific Style Guide: Character Creator (`http://localhost:3000/create`)

> **Note**: This document is the canonical page-specific design specification for the **Character Creator (`/create`)**. It captures the exact design language, 5-tab ledger architecture, modern pill toggle groups, archetype selection cards, Voice Synthesizer Studio, Color Sync engine, live Examine Modal preview, bio editor toolbars, star ratings, the node-graph **Anatomy Forge**, and the **Preview Mirror** rendering column. It serves as an authoritative reference in the TastyTails Universal Design System.

---

## 1. Theme & Design Philosophy

The Character Creator represents the **"Guild Ledger & Magical Mirror of Transformation"**. It balances an organized multi-page parchment record book (the Ledger) on the left with a dark, magical scrying glass (the Preview Mirror) on the right.

### Design Principles for Character Creator Language
1. **The Guild Ledger**: Form controls are arranged inside a heavy dark wood binder (`10px solid #3e2723`) with parchment pages (`#f3e5ab`) and tabbed dividers (`Cinzel` buttons with inset gold active top underlines `0 -4px 0 #ffc107 inset`).
2. **Pill Toggle Groups & Archetype Cards**: Interactive binary and multi-option choices are rendered as sleek 3D tactile pill buttons (`.pill-btn`) and archetype grid cards (`.archetype-card`) with FontAwesome icons, golden active borders, and clear sub-descriptions.
3. **Voice Synthesizer Studio**: Integrated vocal tuning studio allowing real-time preview and customization of character pitch, speaking speed, vocal timbre, and cadence using Web Audio synthesis.
4. **Authentic In-Game Examine Preview**: Embedded interactive examine window (`.examine-modal-window`) mirroring the exact in-game player inspect UI (Look vs OOC Notes tabs) so players can preview their public dossier live.
5. **Color Sync Engine**: Interactive toolbar toggle linking primary body colors across head, ears, and tail in unison to simplify species customization.
6. **Magical Selects & Inputs**: Native dropdowns are replaced by custom animated select lists where hovering options causes a gold paw print icon (`\f1b0`) to slide out alongside crimson red text.
7. **Anatomy Forge Graph Engine**: The Vore tab hosts a visual node-graph canvas where body parts and pathways are mapped as parchment cards (`.af-node`) connected by Bezier ink lines (`path.af-connector`) and wax seal controls (`.af-node-edit-btn`).
8. **Scrying Mirror Preview**: The 2D sprite renderer is housed inside an arch-topped metallic lens with a dark dragon-scale frame (`black-scales.png`), flanked by dark wood action controls.

---

## 2. Color Palette & Functional Mapping

| Token / Color Name | Hex / Value | Usage on Character Creator Page |
| :--- | :--- | :--- |
| `--bg-color` | `#2c241b` | Main body canvas background (wood pattern) |
| `--wood-dark` | `#3e2723` | Ledger outer frame, inactive tab background, preview button base, card section borders |
| `--wood-light` | `#5d4037` | Tab bar background, sub-nav container background, mirror outer frame border |
| `--parchment` | `#f3e5ab` | Active tab background, Ledger parchment background, examine modal fill, custom select menu |
| `--parchment-dark` | `#e6d598` | Inactive tab text, palette label text, reset button border |
| `--gold` | `#ffc107` | Active tab top line (`0 -4px 0 #ffc107 inset`), sync slider active knob, archetype card active border, hover paw icon |
| `--text-dark` | `#3e2723` | Main ink text for labels, inputs, bios, examine preview text, and dropdown options |
| `--accent-red` | `#8b0000` | Collapsible hover text, danger warnings, wax seal node edit buttons, reset button hover state |
| `--btn-primary-bg` | `#6b8c42` | Entrance Emerald Green (Primary action CTAs, active sub-nav buttons) |
| `--node-entrance` | `#6b8c42` | Green top stripe on entrance nodes & green socket (`IN`) |
| `--node-path` | `#d4a356` | Gold top stripe on path nodes |
| `--node-dest` | `#a84a4a` | Crimson top stripe on destination nodes & red socket (`OUT`) |
| `--node-exit` | `#7a6e63` | Grey top stripe on exit nodes |

---

## 3. Typography Hierarchy

| Role | Font Family | Size | Weight / Style | Color | Visual Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Main Ledger Tabs** | `'Cinzel', serif` | `1.1rem` | Bold | `#e6d598` / `#3e2723` | Active tab: parchment background `#f3e5ab`, inset gold top border `0 -4px 0 #ffc107 inset` |
| **Section Headings (`h2`)**| `'Cinzel', serif` | `1.5rem` | Bold | `#3e2723` | Flex row with FontAwesome icon, bottom rule `2px dashed #5d4037` |
| **Card Section Titles** | `'Cinzel', serif` | `1.2rem` | Bold | `#3e2723` | Section card titles inside Identity and About studios |
| **Sub-Nav Bar Buttons** | `'Cinzel', serif` | `0.95rem` | Bold | `#f3e5ab` / `#3e2723` | Active button turns emerald green `#6b8c42` or gold `#ffc107` |
| **Pill Toggle Buttons** | `'Cinzel', serif` | `0.95rem` | Bold | `#3e2723` | Tactile keycap pill shape with active gold background `#ffc107` |
| **Archetype Card Titles**| `'Cinzel', serif` | `1.1rem` | Bold | `#3e2723` | Archetype card title header |
| **Form Field Labels** | `'Caveat Brush', cursive`| `1.2rem` | Normal | `#5d4037` | Handwritten label text for names, species, and traits |
| **UI Badges & Pills** | `'Philosopher', sans-serif`| `0.9rem` | Bold | `#3e2723` | Species pills, examine preview pills, status readouts |
| **Examine Preview Text** | `'Crimson Pro', serif` | `1.05rem` | Normal / Italic | `#3e2723` | In-game examine look description & OOC notes preview |
| **Dropdown Options** | `'Caveat Brush', cursive`| `1.1rem` | Normal | `#3e2723` | Hover shifts padding right with gold paw icon (`\f1b0`) |
| **Anatomy Node Label** | `'Cinzel', serif` | `0.9rem` | Bold | `#2c241b` | Center text inside node card |

---

## 4. Sub-Tab & Component Specifications

### 4.1 Primary Ledger Navigation (`#primaryButtons`)
* **Bar Container**: Background `#5d4037` (`--wood-light`), bottom border `4px solid #3e2723` (`--wood-dark`).
* **5 Primary Tabs**:
  1. **Identity** (`#identity`): Icon `<i class="fa-solid fa-id-card"></i>`
  2. **Appearance** (`#gender`): Icon `<i class="fa-solid fa-palette"></i>`
  3. **About** (`#about`): Icon `<i class="fa-solid fa-feather-pointed"></i>`
  4. **Kinks** (`#kinks`): Icon `<i class="fa-solid fa-heart"></i>`
  5. **Vore** (`#vore`): Icon `<i class="fa-solid fa-utensils"></i>`
* **Tab Interaction**: Inactive tabs have background `#3e2723` and `0.7` opacity. Active tab (`.active-tab`) transitions to parchment `#f3e5ab`, opacity `1.0`, dark wood text `#3e2723`, and an inset gold top underline (`box-shadow: 0 -4px 0 #ffc107 inset`).

---

### 4.2 Tab 1: Identity Specifications (`#identityPullout`)
* **Header**: `"Identity & Core Archetype"` with section subtitle `"Define your character's gender presentation, reproductive anatomy, body plan, and vocal profile."`
* **Pill Toggle Groups (`.pill-toggle-group`)**:
  * **Presentation & Shape**: Pill toggles for **Feminine** (`data-value="F-"`) and **Masculine** (`data-value="M-"`).
  * **Reproductive Anatomy**: Pill toggles for **Vagina** (`data-value="empty"`), **Penis** (`data-value="penis"`), and **Both** (`data-value="both"`).
* **Archetype Grid Cards (`.archetype-grid-cards`)**:
  * 4 Grid Cards: **Anthropomorphic** (`body_01`), **Taur** (`body_02`), **Naga** (`body_03`), **Drider** (`body_04`).
  * Visual Layout: Parchment card background, `2px solid #5d4037` border, active card gets `3px solid #ffc107` gold frame and `#fff8e7` highlight fill. Includes FontAwesome icon, title (`'Cinzel'`), and sub-description (`'Philosopher'`).
* **Voice Synthesizer Studio (`#voiceStudioContainer`)**:
  * Controls: Pitch Slider (`0.5x` to `1.5x`), Speaking Rate Slider (`0.7x` to `1.4x`), Timbre/Tone Selector, Cadence Variation.
  * Preview Actions: Test Utterance preview buttons ("Greetings traveler!", "Chuckle", "Exclaim"), Preset selector dropdown.
  * Data Binding: Form hidden input `#voiceProfileInput` stores serialized JSON voice configuration.

---

### 4.3 Tab 2: Appearance Specifications (`#genderPullout`)
* **Color Sync Toolbar (`.appearance-toolbar`)**:
  * Features a styled toggle switch (`#colorSyncToggle`) with gold slider (`.sync-slider`).
  * Label: `<i class="fa-solid fa-link"></i> Sync Feature Colors`. When checked, updating body color automatically synchronizes Head, Ears, and Tail colors in unison.
* **Appearance Sub-Category Nav (`.appearance-sub-nav`)**:
  * 4 Sub-Tabs: **Head & Face** (`subTabHead`), **Body & Coat** (`subTabBody`), **Tail & Markings** (`subTabTail`), **Hair & Horns** (`subTabHair`).
  * Buttons: `'Cinzel'` font `0.95rem` bold. Active sub-nav button highlighted in emerald green `#6b8c42` or gold `#ffc107`.
* **Sub-Tab Panes (`.sub-tab-pane`)**:
  * **Head & Face Pane**: Head Species select (`Vulpine`, `Canine`, `Feline`, `Bunny`, `Avian`, `Reptile`), Beak color picker (dynamic for Avian), Head Secondary & Accent Fur selects, Outer/Inner Ear type & color pickers, Eye Iris color picker.
  * **Body & Coat Pane**: Primary Body Color picker, Secondary Fur pattern & color, Accent Fur pattern & color, Hands Markings pattern & color, Feet Markings pattern & color.
  * **Tail & Markings Pane**: Tail Type select (`Vulpine`, `Canine`, `Feline`, `Rabbit`, `Avian`, `Reptile`, `Equine`), Tail Primary, Secondary, and Accent color pickers.
  * **Hair & Horns Pane**: Hair Style select (`Short Bob`, `Pony Tail`, `Covers Eye`, etc.) & Hair Color picker, Accessories & Horns select (`Nubby horns`, `Antlers`, `Dragon Horns`, `Antenna`, `Unicorn Horn`) & Accessories Color picker.
* **Color Pickers (`.pickr` / `.pcr-button`)**: Circular `2rem x 2rem` button, border `2px solid #3e2723`, shadow `0 2px 5px rgba(0,0,0,0.3)`.

---

### 4.4 Tab 3: About Specifications (`#aboutPullout`)
* **Personal Details Studio**:
  * Fields: First Name (`#firstName`), Last Name (`#lastName`), Nickname / Alias (`#nickName`), Species Name (`#speciesName`).
  * Form Style: Signature line inputs (transparent fill, bottom border `2px solid #5d4037`).
  * Pronouns Pill Toggles: **She / Her** (`data-value="1"`), **He / Him** (`data-value="2"`), **They / Them** (`data-value="3"`).
* **Authentic In-Game Examine Modal Preview (`.examine-modal-preview-wrapper`)**:
  * Window Frame: Wood border `3px solid #3e2723`, parchment fill `#f3e5ab`, header title with preview badge (`<i class="fa-solid fa-eye"></i> In-Game View`).
  * Header Banner: Displays character name (`#previewCharName`), species pill (`#previewSpecies`), pronouns pill (`#previewPronouns`), and alias pill (`#previewAlias`).
  * Examine Tabs: Interactive **Look** (`examineLookPane`) and **OOC Notes** (`examineOocPane`) buttons updating live as the player types in the editors below.
* **In-Character (IC) & Out-of-Character (OOC) Description Editors**:
  * Editor Toolbar (`.editor-toolbar`): Formatting buttons for Bold (`bold`), Italic (`italic`), Quote Card (`quote`), Bullet List (`list`), Warning Box (`warning`), and Section Heading (`heading`).
  * Smart Templates: **Smart Impression Template** (`#insertIcTemplate`) populates structured physical impression guidelines; **Smart Boundaries Template** (`#insertOocTemplate`) populates structured OOC limits & boundaries.
  * Textarea Style: `'Crimson Pro'` serif font `1.05rem`, parchment paper fill, border `2px solid #5d4037`, focus glow border `#6b8c42`.

---

### 4.5 Tab 4: Kinks Specifications (`#kinksPullout`)
* **Title & Subtitle**: `"Preferences"` in `'Cinzel'`, followed by `"Rate your interest from 1 to 5 stars."` in italic text.
* **Grid Layout (`#kinksInput ul`)**: CSS Grid `repeat(auto-fill, minmax(280px, 1fr))`, gap `15px`.
* **Kink Items (`<li>`)**: Background `rgba(255, 255, 255, 0.2)`, border `1px solid rgba(62, 39, 35, 0.1)`, radius `4px`, font `'Caveat Brush', cursive` `1.1rem` in dark ink `#3e2723`.
* **Star Rating Component (`.rating`)**: Reversed flex row using SVG star mask images. Default state: `rgba(62, 39, 35, 0.3)`. Hover/Selected state: Fill color turns metallic gold `#ffc107`.

---

### 4.6 Tab 5: Vore / Anatomy Forge Specifications (`#vorePullout` & `partials/anatomy_forge.ejs`)
* **Wrapper Container (`.af-wrapper`)**: Full flex layout, min-height `600px`. Parchment background (`#f4e4bc`) with radial vignette and SVG fractal noise. Font `'Lora', serif`. Border `4px solid #4a3c31`.
* **Toolbox Sidebar (`.af-sidebar`)**: Width `200px`, background `#4a3c31` (`--wood-dark`), right border `4px solid #2c241b`.
* **Node Category Buttons (`.af-node-btn`)**: Entrance (Green `#6b8c42`), Path (Gold `#d4a356`), Destination (Red `#a84a4a`), Exit (Grey `#7a6e63`).
* **Node Canvas & Connections (`#af-world`)**: Bezier ink paths (`stroke: #2c241b`), white crossing halos, parchment node cards (`.af-node`), red wax seal edit buttons (`.af-node-edit-btn`).
* **Inspector Drawer (`.af-inspector`)**: Width `300px`, paper background `#fdf6e3` with noise texture, slides out from right.

---

### 4.7 Right Column: Preview Mirror Specifications (`#previewContainer`)
* **Scrying Mirror Frame**: Sticky positioning (`position: sticky; top: 20px`). Heavy wood outer frame `12px solid #5d4037`, background `#1a1a1a` layered with `black-scales.png` texture. Arch-top lens window (`border-radius: 100px 100px 10px 10px`), metallic rim `4px solid #888`, containing Phaser 3 sprite canvas.
* **Control Panels (`.preview-controls`)**: View Rotation buttons (`#rotateLeft`, `#rotateRight`), Action buttons (`#randomizer`, `#resetMainDefaults`).

---

### 4.8 Asset Safety & Telemetry (`UnavailableAssetKey.js`)
* **Asset Validation Engine**: Evaluates selected feature sprite keys against registered texture manifest maps before dispatching draw calls to the Phaser preview mirror.
* **Graceful Fallback**: Prevents broken sprite rendering or console stack traces by cleanly mapping missing/unavailable assets to fallback default keys (`empty` or `01-base`) with diagnostic warning logs.

---

## 5. Discrepancies & Design System Alignment

1. **Tab Active Underline vs Text Glow**:
   * Character Creator standardizes active tab indicators using an **inset gold top border** (`box-shadow: 0 -4px 0 #ffc107 inset`) and parchment background (`#f3e5ab`).
2. **Pill Toggles vs Native Radio Buttons**:
   * Binary and multi-choice selections (Gender shape, Genitals, Pronouns) use **Pill Toggle Groups** (`.pill-btn`) rather than native radio circles.
3. **Sub-Nav Organization**:
   * Dense feature sets (Appearance options) are organized via **Sub-Category Nav Bars** (`.appearance-sub-nav`) to avoid endless scroll fatigue.
4. **Interactive In-Game Previewing**:
   * Character bio text is paired with a live **Examine Modal Preview Card** (`.examine-modal-window`) matching the exact in-game player inspect UI.
