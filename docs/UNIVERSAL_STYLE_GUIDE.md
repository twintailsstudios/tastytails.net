# TastyTails Universal Design System & Style Guide

> **Official Standard**: This document is the master, canonical design specification for **TastyTails.net**. All existing pages, new features, UI components, stylesheets, and future developments must strictly conform to the standards established in this guide.

---

## 1. Theme Philosophy & Core Identity

TastyTails is set in a **"Warm Medieval Tavern, Feral Guild Registry & Nature-Symbiotic World"** where walking animal characters live alongside magic and nature.

### Design Principles
1. **Material Realism**: Surfaces simulate physical materials — dark wood binders, parchment paper sheets, iron rivets, brass pins, leather tabs, and wax seals.
2. **Medieval Fantasy Aesthetics**: Classic chiseled Roman serif headings and buttons (`Cinzel`), handwritten ink quill bios, form fields, and ledger labels (`Caveat Brush`), organic leaf-flourished UI badges & readouts (`Philosopher`), and bookish RP logs (`Crimson Pro`).
3. **Tactile Interactivity**: Buttons function as physical 3D keycaps that depress (`translateY(2px)`) when pressed. Form dropdowns reveal sliding gold paw prints (`\f1b0`).
4. **Natural High Contrast**: Dark wood frames (`#3e2723`) bound cream parchment (`#f3e5ab`), highlighted by entrance emerald green (`#6b8c42`) for primary actions, crimson red (`#8b0000`) for danger, and metallic gold (`#ffc107`) for active accents.

---

## 2. Universal Color Palette & Design Tokens

```css
:root {
    /* === BASE CANVAS & WOOD PALETTE === */
    --palette-bg: #2c241b;                  /* Main body wood pattern canvas */
    --palette-wood-dark: #3e2723;           /* Heavy frames, outer binders, modal borders */
    --palette-wood-light: #5d4037;          /* Secondary borders, card rules, secondary buttons */
    --palette-wood-accent: #795548;         /* Splitter highlights, active slot borders */
    --palette-leather: #2a1b15;             /* Leather tabs, satchel trim */
    --palette-iron: #222222;                /* Hardware plates, rivets, spine widgets */

    /* === PAPER & PARCHMENT === */
    --palette-parchment: #f3e5ab;           /* Primary paper background, modal fill, active tab */
    --palette-parchment-light: #faf3e0;     /* Paper notes, message cards */
    --palette-parchment-dark: #e6d598;      /* Subtitles, secondary paper text, tab text default */
    --palette-text-dark: #3e2723;           /* Primary ink text for headings, bios, and inputs */
    --palette-text-light: #f5f5f5;          /* White text on dark wood backgrounds */

    /* === ACCENT & STATE COLORS === */
    --palette-gold: #ffc107;                /* Gold highlights, logo title, active tab inset line */
    --palette-gold-bright: #ffd700;         /* Header bottom border line */
    --palette-accent-red: #8b0000;          /* Notice titles, danger buttons, warning headers */

    /* === BUTTON COLOR TOKENS === */
    --btn-primary-bg: #6b8c42;              /* Anatomy Forge Entrance Green (Primary Action) */
    --btn-primary-shadow: #3e5527;          /* Solid 3D keycap shadow */
    --btn-primary-hover: #7ea34f;           /* Lighter green hover fill */

    --btn-secondary-bg: #5d4037;            /* Light Wood (Secondary Action) */
    --btn-secondary-shadow: #3e2723;        /* Dark wood keycap shadow */

    --btn-danger-bg: #8b0000;               /* Crimson Red (Destructive / Danger) */
    --btn-danger-shadow: #500000;           /* Dark garnet keycap shadow */
}
```

---

## 3. Typography Hierarchy & Font Roles

Import the standardized font suite in all master layout templates:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Caveat+Brush&family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=Philosopher:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
```

### Typography Role Assignments

| Role | Font Family | Size Range | Weight | Color | Usage Guidelines |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Site Branding & Logo** | `'Cinzel', serif` | `2.2rem - 2.5rem` | Bold | `#ffc107` | Text shadow `2px 2px 4px rgba(0,0,0,0.8)`, letter-spacing `2px` |
| **Top Page Titles** | `'Cinzel', serif` | `3.0rem` | Bold | `#f3e5ab` | Standard top `.page-title` block with `0 2px 10px rgba(0,0,0,0.8)` drop shadow |
| **Section Headings (`h2`/`h3`)**| `'Cinzel', serif` | `1.5rem` | Bold | `#8b0000` / `#3e2723` | In-card headings with `2px dashed #5d4037` bottom rule |
| **All Buttons (Tiers 1-4)** | `'Cinzel', serif` | `0.95rem - 1.1rem` | Bold / Uppercase | White / `#f3e5ab` | Primary, Secondary, Outline, and Danger buttons |
| **Forms, Bios, Inputs & Ledger Fields**| `'Caveat Brush', cursive`| `1.1rem - 2.4rem` | Normal | `#3e2723` / `#5d4037` | All form field labels, dropdown option lists, text inputs, textareas, character nicknames, full names, bios, and handwritten notes |
| **UI Badges, HUDs & Tooltips**| `'Philosopher', sans-serif`| `0.85rem - 1.0rem` | Normal / Bold | `#3e2723` / `#5d4037` | System UI badges, species pills, canvas HUD readouts, tooltips |
| **Narrative Chat Logs & RP** | `'Crimson Pro', serif` | `1.0rem` | Normal | `#3e2723` | High-volume narrative roleplay text in chat window |

---

## 4. Universal 4-Tier Button Component System

All buttons across the application must use the **Cinzel** font, 3D keycap box-shadows, and depress `translateY(2px)` on hover.

```css
/* Base Button Class */
.btn {
    font-family: 'Cinzel', serif;
    font-weight: bold;
    font-size: 1.0rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 24px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    text-decoration: none;
    user-select: none;
}

/* 1. PRIMARY ACTION BUTTON (Entrance Emerald Green) */
.btn-primary {
    background-color: var(--btn-primary-bg);   /* #6b8c42 */
    color: #ffffff;
    box-shadow: 0 4px 0 var(--btn-primary-shadow); /* #3e5527 */
}

.btn-primary:hover {
    background-color: var(--btn-primary-hover); /* #7ea34f */
    transform: translateY(2px);
    box-shadow: 0 2px 0 var(--btn-primary-shadow);
}

/* 2. SECONDARY ACTION BUTTON (Light Wood) */
.btn-secondary {
    background-color: var(--btn-secondary-bg); /* #5d4037 */
    color: var(--palette-parchment);            /* #f3e5ab */
    box-shadow: 0 4px 0 var(--btn-secondary-shadow); /* #3e2723 */
}

.btn-secondary:hover {
    background-color: #6d4c41;
    transform: translateY(2px);
    box-shadow: 0 2px 0 var(--btn-secondary-shadow);
}

/* 3. CONTROL / OUTLINE BUTTON (Parchment Outline) */
.btn-outline {
    background-color: transparent;
    border: 1px solid var(--palette-parchment);
    color: var(--palette-parchment);
}

.btn-outline:hover {
    background-color: var(--palette-accent-red); /* #8b0000 */
    border-color: var(--palette-accent-red);
    color: #ffffff;
}

/* 4. DESTRUCTIVE / DANGER BUTTON (Crimson Red) */
.btn-danger {
    background-color: var(--btn-danger-bg);   /* #8b0000 */
    color: #ffffff;
    box-shadow: 0 4px 0 var(--btn-danger-shadow); /* #500000 */
}

.btn-danger:hover {
    background-color: #a80000;
    transform: translateY(2px);
    box-shadow: 0 2px 0 var(--btn-danger-shadow);
}
```

---

## 5. Standardized Container & Modal Frame Architecture

### 5.1 Main Page Binder Container (`.binder-container`)
Used for primary page forms (e.g. Character Creator Ledger, Notice Board).
* **Border**: Heavy dark wood `10px solid var(--palette-wood-dark)` (`#3e2723`).
* **Radius**: `8px`.
* **Fill**: Parchment `#f3e5ab` with `cream-paper.png` grain texture.
* **Shadows**: Inner shadow `inset 0 0 60px rgba(62, 39, 35, 0.2)` + drop shadow `0 10px 30px rgba(0, 0, 0, 0.5)`.

### 5.2 Dossier & Content Cards (`.char-card`, `.content-card`)
Used for registry cards, item containers, and dossier panels.
* **Border**: Dark wood border `2px solid var(--palette-wood-dark)` (`#3e2723`) or parchment line `#d7c496`.
* **Radius**: `8px`.
* **Fill**: Parchment `#f3e5ab` with paper texture overlay.
* **Shadows**: Outer drop shadow `0 10px 20px rgba(0, 0, 0, 0.5)` + inner vignette `inset 0 0 40px rgba(160, 82, 45, 0.15)`.

### 5.3 Modal Overlay Dialog Boxes (`.modal-box`)
Standardized frame across all popups (Delete Confirmation, Settings, Anatomy Forge).
* **Backdrop**: `rgba(0, 0, 0, 0.75)` with `backdrop-filter: blur(5px)`.
* **Modal Frame**: `6px solid var(--palette-wood-dark)` (`#3e2723`).
* **Radius**: `8px`.
* **Fill**: Parchment `#f3e5ab` with paper texture.
* **Drop Shadow**: `0 0 30px rgba(0, 0, 0, 0.8)`.

---

## 6. Form Controls & Paw-Print Custom Select

### 6.1 "Signature Line" Text Inputs & Form Labels
```css
label {
    font-family: 'Caveat Brush', cursive;
    font-size: 1.2rem;
    color: var(--palette-wood-light);
    margin-bottom: 2px;
    white-space: nowrap;
}

input[type="text"],
input[type="email"],
input[type="password"],
textarea {
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--palette-wood-light);
    font-family: 'Caveat Brush', cursive;
    font-size: 1.2rem;
    color: var(--palette-text-dark);
    padding: 6px 10px;
    width: 100%;
    outline: none;
    transition: all 0.3s ease;
}

input:focus,
textarea:focus {
    border-bottom-color: var(--btn-primary-bg); /* #6b8c42 Entrance Green */
    background-color: rgba(255, 193, 7, 0.1);    /* Gold tint focus */
}
```

### 6.2 Magical Paw-Print Custom Select (`.custom-select-wrapper`)
Replaces native `<select>` dropdowns across all forms.
* **Trigger**: Text `#3e2723` in `Caveat Brush` font (`1.1rem`) with bottom border `2px solid #5d4037` and animated chevron.
* **Options Dropdown**: Parchment `#f3e5ab` background with `2px solid #3e2723` border and drop shadow.
* **Option Items**: Text in `Caveat Brush` font (`1.1rem`). Hovering option text turns crimson red (`#8b0000`), padding shifts right (`25px`), and a gold FontAwesome paw print (`\f1b0`) scales into view on the left.

### 6.3 Tactile Pill Toggle Groups (`.pill-toggle-group`, `.pill-btn`)
Replaces basic radio buttons for binary or short option toggles (e.g. presentation shape, genitals, pronouns).
* **Container**: Flex row with rounded border `4px`, background `rgba(62, 39, 35, 0.1)`, padding `4px`.
* **Pill Button (`.pill-btn`)**: `'Cinzel'` bold `0.95rem`, dark text `#3e2723`, padding `6px 16px`, border-radius `20px`, border `none`, 3D shadow `0 2px 4px rgba(0,0,0,0.2)`.
* **Active Pill (`.pill-btn.active`)**: Background `#ffc107` (Gilded Gold), text `#3e2723`, box shadow `0 3px 0 #b38600`.

### 6.4 Archetype Selection Grid Cards (`.archetype-grid-cards`, `.archetype-card`)
Used for primary body plan and class archetype choices (Anthropomorphic, Taur, Naga, Drider).
* **Grid Container**: Responsive grid layout with `15px` gap.
* **Card (`.archetype-card`)**: Parchment background `#f3e5ab`, border `2px solid #5d4037`, radius `8px`, padding `14px`, flex column centered.
* **Icon & Text**: Top FontAwesome icon (`1.8rem`), Title (`'Cinzel'` bold `1.1rem`), Subtitle (`'Philosopher'` `0.9rem` muted `#5d4037`).
* **Active Card State (`.archetype-card.active`)**: Golden frame border `3px solid #ffc107`, highlight fill `#fff8e7`, drop shadow `0 4px 12px rgba(255, 193, 7, 0.3)`.

### 6.5 Color Sync Engine & Slider Controls (`.color-sync-wrapper`, `#colorSyncToggle`)
Quick-sync toolbar linking body feature colors in unison.
* **Wrapper**: Flex row with dark wood accent background, rounded border `4px`, padding `8px 14px`.
* **Toggle Switch**: Sliding gold toggle knob (`.sync-slider`), emerald active glow when checked. Label in `'Cinzel'` `0.95rem` with link icon (`<i class="fa-solid fa-link"></i>`).

### 6.6 Voice Synthesizer Studio Component System (`#voiceStudioContainer`)
Audio profile configuration panel allowing real-time vocal previewing.
* **Control Sliders**: Range inputs styled with wood track (`#5d4037`) and gold keycap thumb (`#ffc107`). Labels in `'Cinzel'` bold (`Pitch`, `Speed`, `Timbre`, `Cadence`).
* **Utterance Action Buttons**: Emerald Green (`.btn-primary`) or Light Wood (`.btn-secondary`) keycap buttons for audio preview tests ("Greetings traveler!", "Chuckle", "Exclaim").

### 6.7 Authentic Examine Modal Preview Window (`.examine-modal-window`)
Live in-game examine mirror embedded in character configuration views.
* **Header Banner**: Character full name in `'Cinzel'` (`1.3rem`), species pill (`.meta-pill`), pronouns pill, and alias pill (`.alias-pill`).
* **Examine Panes**: Tab buttons for **Look** (`examineLookPane`) and **OOC Notes** (`examineOocPane`). Paragraph text rendered in `'Crimson Pro'` serif (`1.05rem`).

### 6.8 Rich Text Formatting Toolbar & Bio Templates (`.editor-toolbar`)
Formatting toolbar attached to in-character bio and OOC boundary textareas.
* **Format Buttons (`.format-btn`)**: Dark wood buttons with FontAwesome icons (Bold, Italic, Quote Card, Bullet List, Warning Box, Heading).
* **Smart Template CTAs**: Emerald Green / Gold buttons (`#insertIcTemplate`, `#insertOocTemplate`) injecting structured impression & boundary guidelines.

---

## 7. Navigation & Tab Systems

### 7.1 Global Header & Nav Bar
* **Header Bar**: `linear-gradient(to bottom, #3e2723, #5d4037)` with a `4px solid #FFD700` gold bottom line.
* **Navigation Links**: `'Cinzel', serif` `1.1rem`. Default color: parchment `#f3e5ab`. On hover: turns gold `#ffc107` with `text-shadow: 0 0 8px #ffc107`.
* **Play Mode Toggle**: Fixed top-right `#navToggle` button (`#3e2723` wood circle) that slides down navigation overlay (`body.play-mode.nav-visible nav`).

### 7.2 Tab Dividers (`.button.main`, `.menuTabs`)
* **Inactive Tab**: Background `#3e2723`, text `#e6d598`, `Cinzel` font.
* **Active Tab**: Background `#f3e5ab` (`--palette-parchment`), text `#3e2723`, with an **inset top gold underline** (`box-shadow: 0 -4px 0 #ffc107 inset`).

---

## Summary Checklist for Developers & Designers

When implementing new pages or refactoring existing components, ensure:
- [x] **Primary Buttons**: Use `#6b8c42` Entrance Green with `#3e5527` 3D keycap shadow and `Cinzel` font.
- [x] **Secondary Buttons**: Use `#5d4037` Light Wood with `#3e2723` 3D shadow and `Cinzel` font.
- [x] **Headings & Buttons**: Use `Cinzel` font.
- [x] **Form Labels, Inputs & Bios**: Use `Caveat Brush` font.
- [x] **UI Badges & Tooltips**: Use `Philosopher` font.
- [x] **RP Narrative & Chat**: Use `Crimson Pro` font.
- [x] **Modal Boxes**: Bounded by `6px solid #3e2723` dark wood frames.
- [x] **Form Selects**: Converted to the custom Paw-Print Select component with `Caveat Brush` text.
- [x] **Pill Toggle Groups**: Applied for binary / multi-choice options (`.pill-btn.active`).
- [x] **Archetype Selection Cards**: Bounded by gold active borders (`#ffc107`) with `Cinzel` headers.
- [x] **Examine Modal Preview**: Structured with Look vs OOC Notes panes and `'Crimson Pro'` text.
- [x] **Active Tabs**: Feature a parchment background with an inset top gold line (`0 -4px 0 #ffc107 inset`).
