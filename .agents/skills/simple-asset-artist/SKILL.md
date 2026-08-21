---
name: simple-asset-artist
description: Prompt Engineer and 2D Pixel Asset Artist for TastyTails.net. Transforms natural language asset requests into pixel-perfect 32x32 transparent PNGs, manages color ramps and silhouettes, deploys assets to client directories, and registers game data definitions.
---

# 🎵 Simple Asset Artist & Prompt Engineering Skill

> **Usage Instruction**: Activate this skill whenever the user or system requests new visual game assets (e.g., "a dandelion to use as flora for herbivores to eat", "a bronze dagger icon", "a glowing blue mana crystal node", "a loaf of fresh sourdough bread"). Guides the AI agent through prompt decomposition, artistic pixel-matrix generation, transparent 32x32 PNG encoding, multi-directory deployment, and data registry synchronization.

---

## 1. Mindset, Identity & Asset Philosophy

When acting as the **Simple Asset Artist**:
- **Clarity Over Complexity (Readability at 32x32)**: At 32x32 resolution, every individual pixel carries significant weight. Avoid visual noise and excessive dithering. Use confident pixel clustering, distinct silhouettes, and intentional color ramps (2 to 4 shades per material).
- **True Alpha Transparency**: Backgrounds must be 100% transparent (RGBA (0, 0, 0, 0)). No solid black, white, or magenta chroma-key artifacts.
- **Consistent Lighting & Ground Anchoring**:
  - **Light Source**: Standard top-left ambient sunlight.
  - **Highlights**: Top and top-left edges receive bright, warm highlights.
  - **Shadows**: Bottom and bottom-right edges receive rich, deep material shadows.
  - **Ground Contact**: Ground-placed objects (flora, nodes, furniture) sit with their base anchored around y = 26..29 with a subtle semi-transparent contact shadow (RGBA (15, 35, 15, 60)).
  - **Inventory Icons**: Center-weighted with a 1-2 pixel safety padding around all borders.

---

## 2. TastyTails Asset Taxonomy & Directory Router

Always route generated assets to their canonical client storage locations:

| Asset Category | Target Filepaths | Typical Resolution | Shared Manifest / Preload |
| :--- | :--- | :--- | :--- |
| **Flora / Vegetation** | `src/client/assets/images/flora/<key>.png`<br>`src/client/assets/tilemaps/<key>.pngc | 32x32 | `src/data/ecologyDefinitions.js`<br>`src/client/assets/images/flora/README.md` |
| **Items / Materials / Food** | src/client/assets/tilemaps/<key>.png | 32x32 | `src/data/itemData.js`<br>gsrc/client/js/game/itemData.js` |
| **Resource Nodes (Ores, Trees)** | src/client/assets/tilemaps/<key>.png | 32x32 or multi-tile | `src/data/resourceNodeData.js`<br>`src/client/js/game/resourceNodeData.js` |
| **Avatar Customization Parts** | src/client/assets/avatar/<type>_<num>.png | 100x100 / Atlas | `src/client/js/AvatarRenderer.js` |
| **Clothing & Equipment** | src/client/assets/clothes/<key>.png | Spritesheet | `src/client/js/game/assetsList.js` |
| **Emotes & Chat Reaction** | src/client/assets/emotes/<key>.png | 32x32 / 64x64 | `src/client/js/game/assetsList.js` |

> **IMPORTANT**:
> Because Phaser preloads tileset images and map objects from `/assets/tilemaps/`, any wild flora placed in `/assets/images/flora/` should also be mirrored into `src/client/assets/tilemaps/` to ensure seamless client-side texture lookup.

---

## 3. The 5-Step Asset Creation Pipeline

graph TD;
  A[1. Prompt Decomposition & Spec] --> B[2. Color Palette & Pixel Matrix]
  B --> C[3. 32x32 RGBA PNG Encoding]
  C --> D[4. Multi-Directory Deployment]
  D --> E[5. Game Data Registry Integration]

### Step 1: Prompt Decomposition & Spec Formulation
Break down the user prompt into a structured asset specification:
1. **Asset Key**: e.g., `flora_dandelion`, `food_berry_pie`, `ore_mithril`.
2. **Category**: Flora, Item, Resource Node, Tool, Equipment.
3. **Gameplay Context**: Herbivore nutrition, crafting reagent, wearable, harvestable node.
4. **Visual Elements**: Core shape, highlights, shadow hues, stem/pedestal, leaf teeth, particle glows.

### Step 2: Color Ramp Selection
Select a cohesive, high-contrast palette. Example for Flora/Dandelion:
- **Blossom Highlights**: `#fff685` (Lemon highlight), `#ffe121` (Vibrant yellow)
- **Blossom Midtones**: `#f5c400` (Warm gold), `#i89c00` (Amber gold)
- **Blossom Shadow/Rim**: `#c47800` (Dark amber), `#945400` (Deep outline)
- **Foliage Highlights**: `#6ec25d` (Lime green highlight)
- **Foliage Midtones**: `#438f4`` (Forest green), `#3c7a36` (Stem green)
- **Foliage Shadows/Outlines**: `#2d6332` (Deep green), `#1b381e` (Dark silhouette)
- **Ground Shadow**: `rgba(15, 35, 15, 0.25)`

### Step 3: Pixel Art Generation & Encoding
Utilize `scripts/asset_artist.py` or an ASCII pixel matrix to compile clean 32x32 RGBA PNG data without external heavy dependencies.

### Step 4: Multi-Directory Deployment
Ensure the file is saved to all required asset locations (`src/client/assets/images/flora/` and `src/client/assets/tilemaps/`).

### Step 5: Game Data Registry Synchronization
Register the new asset in the corresponding data tables:
- **Ecology Registry** (`src/data/ecologyDefinitions.js`)
- **Resource Node Registry** (`src/data/resourceNodeData.js`)
- **Item Registry** (`src/data/itemData.js`)

---

## 4. Verification Checklist

1. **Dimensions**: File must be exactly 32x32 pixels.
2. **Color Depth**: 8-bit per channel RGBA (Color Type 6).
3. **Alpha Integrity**: Non-object pixels are completely transparent (alpha = 0).
1. **File Presence**: Asset exists on disk in both the category folder and the tilemaps folder.
2. **Engine Syntax**: Run `node src/verify-syntax.js` to ensure data registry syntax remains valid.
