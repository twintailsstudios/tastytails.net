# TastyTails Asset Pipeline Specification

This document details the asset loading, declaration, and dynamic rendering systems utilized in the TastyTails client application.

---

## 1. Asset Manifest & Declarations

All game assets are declared centrally inside [assetsList.js](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/client/js/game/assetsList.js). This lists tilesets, static images, spritesheets (with frame dimensions and animation flags), and emotes.

*   **Preloading Phase:** The Phaser game engine processes this list during the scenes initialization phase in [preload.js](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/client/js/game/preload.js).
*   **Dynamic Maps:** The active tilemap is loaded dynamically based on `window.mapFilename` (configured on server launch via [mapConfig.js](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server/mapConfig.js)).

---

## 2. Dynamic Avatar Composite Rendering

To enable custom appearance options without loading thousands of pre-rendered sheets, the game uses a dynamic canvas composite approach in [AvatarRenderer.js](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/client/js/AvatarRenderer.js).

### Master Texture Atlas Layout
Dynamic character layers (head shapes, ear shapes, hair, accents) are loaded from a master spritesheet atlas template: `/assets/avatar/[head_sprite]_default.png`.
*   **Columns:** 10 columns (representing 10 animation frames).
*   **Rows:** 36 rows (each representing a different cosmetic layer/part).
*   **Dimensions:** Sourced at $100\text{px} \times 100\text{px}$ slices, and composed down to $64\text{px} \times 64\text{px}$ for the chat interface.

### Composite Layer Indice Mapping
When assembling a character's profile, the renderer draws layers in a specific order:
1.  **Row 0 (Base Head):** Drawn and tinted with the head base color.
2.  **Row 1 (Eyes Outer):** White sclera background (untinted).
3.  **Row 2 (Eyes Iris):** Drawn and tinted with the character's eye color.
4.  **Rows 3–7 (Secondary/Accent Head Markings):** Extracted by matching the sprite name regex (e.g. `/secondary(?:Head)?_0?(\d+)/i`) and offset from row 3.
5.  **Rows 8–9+ (Ears):**
    *   Inner ears are offset from **Row 8** (e.g. `8 + 2 * (index - 1)`).
    *   Outer ears are offset from **Row 9** (e.g. `9 + 2 * (index - 1)`).
6.  **Rows 30+ (Head Accessories):** Extracted by matching `headAccessories_0?(\d+)` and offset from Row 30.

### Composition Steps (Multiply Tinting)
For each frame (0 to 9) of the avatar animation, the renderer repeats these steps:
1.  Draw the slice from the source sheet onto a temporary, off-screen canvas context (`tempCanvas`).
2.  Change the canvas blend mode (`globalCompositeOperation`) to `'multiply'`.
3.  Fill the canvas with the hex color tint (e.g. `#ffa500` for orange).
4.  Change the blend mode to `'destination-in'` and re-draw the original sprite to clip the multiplied bounds back to the original alpha mask.
5.  Draw the completed layer onto the target frame on the composite sheet canvas (`workCanvas`) at `frame * 64px`.

### LRU Caching
To prevent visual lag, compiled sheets are saved as data URLs in a **Least Recently Used (LRU) Cache** limited to 500 entries. Subsequent chat messages by the same character configuration render instantly from the cache.

---

## 3. Work-In-Progress (TBD) Pipelines

The following aspects of the asset pipeline are currently in development or undergoing design reviews:

### Audio Assets & Integration
*   **Status:** **TBD (To Be Determined)**
*   **Target:** Integration of action audio triggers (footsteps, interface clicks) and spatial sound environments.

### Custom Walk/Idle Animations
*   **Status:** **TBD (To Be Determined)**
*   **Target:** Rules for defining sprite frames, mapping custom walk/idle/action animations for new clothing items or species.

### Spritesheet Art Guidelines
*   **Status:** **TBD (To Be Determined)**
*   **Target:** Templates, anchor points, canvas grids, and export specifications for artists creating new gear or parts.
