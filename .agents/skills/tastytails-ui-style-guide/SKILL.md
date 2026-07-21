---
name: tastytails-ui-style-guide
description: Applies the TastyTails.net Universal Design System and Style Guide whenever creating new UI elements, designing pages, building features, or modifying existing components and stylesheets.
---

# TastyTails Universal UI Style Guide & Design System

> **Usage Instruction**: Invoke or reference this skill whenever you are adding, modifying, or refactoring UI components, pages, forms, buttons, colors, typography, or CSS stylesheets in the **TastyTails.net** project.

---

## 1. Core Visual Theme: "Warm Medieval Tavern & Feral Guild Registry"
All interface designs in TastyTails.net must convey a warm, tactile, medieval fantasy environment with druidic nature elements. 

### Core Aesthetic Principles
1. **Material Realism**: Use wood pattern background textures, parchment paper grain (`cream-paper.png`), iron hardware, leather tabs, and wax seals.
2. **Natural High Contrast**: Dark wood frames (`#3e2723`) contain cream parchment surfaces (`#f3e5ab`), punctuated by Entrance Emerald Green (`#6b8c42`) primary actions, Crimson Red (`#8b0000`) danger states, and metallic gold (`#ffc107`) active accents.
3. **Tactile 3D Keycaps**: Action buttons must function as physical 3D keycaps with solid bottom shadows that depress (`translateY(2px)`) when pressed.

---

## 2. Universal Design Tokens & Colors

Ensure stylesheets utilize these exact color tokens:

```css
:root {
    /* === BASE CANVAS & WOOD === */
    --palette-bg: #2c241b;                  /* Wood pattern body canvas */
    --palette-wood-dark: #3e2723;           /* Outer binders, heavy frames, modal borders */
    --palette-wood-light: #5d4037;          /* Card dividers, sub-borders, secondary buttons */
    --palette-wood-accent: #795548;         /* Active slot borders, splitter highlights */
    --palette-leather: #2a1b15;             /* Satchel tabs, leather trim */
    --palette-iron: #222222;                /* Hardware plates, rivets, spine widgets */

    /* === PAPER & PARCHMENT === */
    --palette-parchment: #f3e5ab;           /* Primary card fill, modal fill, active tabs */
    --palette-parchment-light: #faf3e0;     /* Paper notes, message cards */
    --palette-parchment-dark: #e6d598;      /* Subtitles, secondary paper text */
    --palette-text-dark: #3e2723;           /* Primary ink text for headings, bios, inputs */
    --palette-text-light: #f5f5f5;          /* White text on dark wood backgrounds */

    /* === ACCENTS & HIGHLIGHTS === */
    --palette-gold: #ffc107;                /* Logo title, active tab gold top line */
    --palette-gold-bright: #ffd700;         /* Header bottom rule line */
    --palette-accent-red: #8b0000;          /* Notice titles, danger buttons, warnings */

    /* === BUTTON COLOR TOKENS === */
    --btn-primary-bg: #6b8c42;              /* Entrance Emerald Green (Primary CTA) */
    --btn-primary-shadow: #3e5527;          /* 3D keycap shadow */
    --btn-primary-hover: #7ea34f;           /* Lighter green hover fill */

    --btn-secondary-bg: #5d4037;            /* Light Wood (Secondary Action) */
    --btn-secondary-shadow: #3e2723;        /* Dark wood keycap shadow */

    --btn-danger-bg: #8b0000;               /* Crimson Red (Danger / Destructive) */
    --btn-danger-shadow: #500000;           /* Dark garnet keycap shadow */
}
```

---

## 3. Strict Typography Rules & Font Suite

Always include Google Fonts imports for the required font family suite:
`Cinzel`, `Caveat Brush`, `Philosopher`, and `Crimson Pro`.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Caveat+Brush&family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=Philosopher:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
```

### Font Roles
- **`Cinzel`**: Use for site logos (`2.2rem`), standalone page titles (`.page-title h2`, `3.0rem` parchment text), section headers (`h2`/`h3`, `1.5rem` red text with `2px dashed #5d4037` bottom rule), and **all button text (Tiers 1-4)**.
- **`Caveat Brush`**: Use for in-world handwritten text, player bios, character nicknames (`2.4rem`), full names (`1.2rem`), form field labels (`<label>`), dropdown option lists, text inputs, textareas, and `.paper-note` cards.
- **`Philosopher`**: Use for UI badges, species pills, canvas HUD readouts, and tooltips.
- **`Crimson Pro`**: Use for narrative roleplay text and chat message logs.

---

## 4. Standardized 4-Tier Button Component System

All buttons must use the `Cinzel` font, bold uppercase formatting, solid 3D shadows, and depress `2px` on hover.

```css
/* 1. PRIMARY ACTION BUTTON (Entrance Emerald Green) */
.btn-primary {
    font-family: 'Cinzel', serif;
    font-weight: bold;
    text-transform: uppercase;
    background-color: #6b8c42;
    color: #ffffff;
    box-shadow: 0 4px 0 #3e5527;
    border: none;
    padding: 10px 24px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.btn-primary:hover {
    background-color: #7ea34f;
    transform: translateY(2px);
    box-shadow: 0 2px 0 #3e5527;
}

/* 2. SECONDARY ACTION BUTTON (Light Wood) */
.btn-secondary {
    font-family: 'Cinzel', serif;
    font-weight: bold;
    text-transform: uppercase;
    background-color: #5d4037;
    color: #f3e5ab;
    box-shadow: 0 4px 0 #3e2723;
    border: none;
    padding: 10px 24px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-secondary:hover {
    background-color: #6d4c41;
    transform: translateY(2px);
    box-shadow: 0 2px 0 #3e2723;
}

/* 3. CONTROL / OUTLINE BUTTON (Parchment Outline) */
.btn-outline {
    font-family: 'Cinzel', serif;
    background-color: transparent;
    border: 1px solid #f3e5ab;
    color: #f3e5ab;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-outline:hover {
    background-color: #8b0000;
    border-color: #8b0000;
    color: #ffffff;
}

/* 4. DESTRUCTIVE / DANGER BUTTON (Crimson Red) */
.btn-danger {
    font-family: 'Cinzel', serif;
    font-weight: bold;
    text-transform: uppercase;
    background-color: #8b0000;
    color: #ffffff;
    box-shadow: 0 4px 0 #500000;
    border: none;
    padding: 10px 24px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-danger:hover {
    background-color: #a80000;
    transform: translateY(2px);
    box-shadow: 0 2px 0 #500000;
}
```

---

## 5. Frame & Container Architecture

- **Primary Page Binders (`.binder-container`)**: `10px solid #3e2723` (`--palette-wood-dark`) with `8px` border radius, parchment fill `#f3e5ab`, and inner vignette shadow `inset 0 0 60px rgba(62,39,35,0.2)`.
- **Dossier & Content Cards (`.char-card`, `.content-card`)**: `2px solid #3e2723` border, radius `8px`, parchment paper texture background, outer drop shadow `0 10px 20px rgba(0,0,0,0.5)`.
- **Modal Dialog Boxes (`.modal-box`)**: Standardize on `6px solid #3e2723` dark wood frames, parchment background `#f3e5ab`, `8px` radius, drop shadow `0 0 30px rgba(0,0,0,0.8)`.

---

## 6. Form Controls & Custom Paw-Print Select

- **Text Inputs, Textareas & Form Labels**: Use "signature line" styling — transparent fill, bottom border `2px solid #5d4037`, `Caveat Brush` font (`1.2rem`). On focus: gold tint fill (`rgba(255, 193, 7, 0.1)`) with `#6b8c42` Entrance Green bottom border.
- **Custom Paw-Print Select (`.custom-select-wrapper`)**: Standardize custom select dropdowns across all forms with `Caveat Brush` text (`1.1rem`). Hovering options shifts padding right (`25px`) and reveals a sliding gold FontAwesome paw print (`\f1b0`).

---

## 7. Tab Indicators

- **Tab Bar (`.menuTabs`, `.button.main`)**: Inactive tab background `#3e2723`, text `#e6d598`. Active tab switches to parchment background `#f3e5ab`, dark wood text `#3e2723`, and an **inset top gold underline** (`box-shadow: 0 -4px 0 #ffc107 inset`).
