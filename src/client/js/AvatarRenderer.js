/**
 * @fileoverview AvatarRenderer.js - Dynamic Avatar Sprite Compositor & Cache
 * 
 * @description
 * Handles the dynamic rendering of multi-layer character avatar sprite sheets
 * for the chat interface. Uses off-screen HTML5 canvases to stack, tint, and scale
 * body parts (head, eyes, ears, markings, accessories) from master texture atlases.
 * 
 * Triggered by:
 * - ChatMessage.js (ChatMessage.prototype.renderAvatar) during chat message rendering.
 * - chat.js.old (Legacy chat interface rendering).
 */

// OPTIMIZATION: Top-level pre-compiled regex patterns avoid inline regex compilation overhead in hot loop
const REGEX_SECONDARY = /secondary(?:Head)?_0?(\d+)/i;
const REGEX_EAR_OUTER = /ears_0?(\d+)-outer/i;
const REGEX_EAR_INNER = /ears_0?(\d+)-inner/i;
const REGEX_HEAD_ACC = /headAccessories_0?(\d+)/i;

class AvatarRenderer {
    /**
     * Initializes state maps, configuration parameters, and reusable canvas contexts.
     */
    constructor() {
        /** @type {Map<string, string>} LRU Cache storing profileHash -> base64 PNG DataURL */
        this.cache = new Map();
        
        /** @type {Map<string, HTMLImageElement>} Loaded master atlas image cache */
        this.atlasCache = new Map();
        
        /** @type {Map<string, Promise<HTMLImageElement>>} In-flight atlas network request deduplication map */
        this.atlasPromises = new Map();
        
        /** @type {number} Maximum number of master atlas images retained in memory */
        this.maxAtlasCacheSize = 50;

        this.atlasPath = '/assets/avatar/head_01_default.png'; // Default fallback atlas
        this.frameWidth = 100; // Source slice width (Atlas: 1000px / 10 cols)
        this.frameHeight = 100; // Source slice height (Atlas: 3600px / 36 rows)
        this.rows = 36;
        this.cols = 10;

        this.isReady = false;

        // --- PERFORMANCE: Reusable Off-screen Canvases ---
        // OPTIMIZATION: Reusing work and temp canvas contexts keeps Garbage Collection (GC) allocations near zero per render operation.
        this.workCanvas = document.createElement('canvas');
        this.workCanvas.width = 640; // 10 animation frames * 64px width
        this.workCanvas.height = 64;
        this.workCtx = this.workCanvas.getContext('2d', { willReadFrequently: true });

        this.tempCanvas = document.createElement('canvas');
        this.tempCanvas.width = 100;
        this.tempCanvas.height = 100;
        this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: true });
    }

    /**
     * Asynchronously loads a master texture atlas required for rendering.
     * Implements Map-based caching and request deduplication.
     * 
     * @param {string} url - Relative asset path of the atlas PNG
     * @returns {Promise<HTMLImageElement>} Resolves when atlas is loaded and ready for pixel reading
     */
    async loadAtlas(url) {
        if (this.atlasCache.has(url)) return this.atlasCache.get(url);
        if (this.atlasPromises.has(url)) return this.atlasPromises.get(url);

        const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                // OPTIMIZATION: Enforce LRU eviction cap on raw atlas images to bound memory usage
                if (this.atlasCache.size >= this.maxAtlasCacheSize) {
                    const oldestUrl = this.atlasCache.keys().next().value;
                    this.atlasCache.delete(oldestUrl);
                }
                this.atlasCache.set(url, img);
                this.atlasPromises.delete(url);
                this.isReady = true;
                resolve(img);
            };
            img.onerror = (err) => {
                // RELIABILITY: Clean up rejected promise so future retries are not blocked
                this.atlasPromises.delete(url);
                reject(err);
            };
            img.src = url;
        });

        this.atlasPromises.set(url, promise);
        return promise;
    }

    /**
     * Generates a unique, deterministic cache key from parsed layer configurations.
     * 
     * @param {Array<{row: number, color: string}>} layers - Array of parsed layer row and color objects
     * @param {string} atlasUrl - Source atlas URL
     * @returns {string} Deterministic cache key string
     */
    generateKey(layers, atlasUrl) {
        // OPTIMIZATION: Fast string concatenation avoids JSON.stringify overhead and short-lived allocations
        let key = atlasUrl;
        for (let i = 0; i < layers.length; i++) {
            key += `|${layers[i].row}:${layers[i].color}`;
        }
        return key;
    }

    /**
     * Synchronously checks if a profile visual configuration is already compiled in cache.
     * Promotes the entry to the end of the LRU Map order on access.
     * 
     * @param {Object} profile - Visual profile metadata object
     * @returns {string|null} Base64 PNG DataURL if cached, or null
     */
    getCached(profile) {
        if (!profile || !profile.head || !profile.head.sprite) return null;
        const ATLAS_PATH = '/assets/avatar/';
        const headSprite = profile.head.sprite;
        const atlasUrl = `${ATLAS_PATH}${headSprite}_default.png`;
        const layers = this.parseLayers(profile);
        const key = this.generateKey(layers, atlasUrl);
        
        if (!this.cache.has(key)) return null;

        const val = this.cache.get(key);
        // OPTIMIZATION: LRU Map key promotion on synchronous read prevents active avatars from premature eviction
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }

    /**
     * Main composition render method.
     * Stacks, tints, and composes body part layers into a single 640x64 animated sprite sheet.
     * 
     * @param {Object} profile - Visual profile configuration
     * @returns {Promise<string|null>} Base64 PNG DataURL of composite sprite sheet
     */
    async render(profile) {
        if (!profile || !profile.head || !profile.head.sprite) return null;

        const ATLAS_PATH = '/assets/avatar/';
        const headSprite = profile.head.sprite;
        const atlasUrl = `${ATLAS_PATH}${headSprite}_default.png`;

        // 1. Parse Layers (convert profile object to ordered layer list)
        const layers = this.parseLayers(profile);

        // 2. Check Cache
        const cacheKey = this.generateKey(layers, atlasUrl);
        if (this.cache.has(cacheKey)) {
            // OPTIMIZATION: Access bump (LRU behavior: move to end of Map)
            const val = this.cache.get(cacheKey);
            this.cache.delete(cacheKey);
            this.cache.set(cacheKey, val);
            return val;
        }

        // 3. Load Atlas if needed
        let img;
        try {
            img = await this.loadAtlas(atlasUrl);
        } catch (e) {
            console.error("Failed to load avatar atlas:", e);
            return null;
        }

        // 4. Draw to Canvas
        const fw = img.naturalWidth / 10;
        const fh = img.naturalHeight / 36;

        // Use reusable "Work Canvas"
        const ctx = this.workCtx;
        ctx.clearRect(0, 0, 640, 64);

        // Resize temp canvas if needed
        if (this.tempCanvas.width !== fw || this.tempCanvas.height !== fh) {
            this.tempCanvas.width = fw;
            this.tempCanvas.height = fh;
        }
        const tctx = this.tempCtx;

        // Render each frame (0 to 9)
        for (let frame = 0; frame < 10; frame++) {
            const x = frame * 64; // Destination X (64px wide frames)

            // Draw each layer for this frame
            layers.forEach(layer => {
                const row = layer.row;
                const color = layer.color;

                const sx = frame * fw;
                const sy = row * fh;

                // --- Tinting Logic ---
                // We use 'multiply' composite operation to tint the greyscale source.

                // Clear Temp
                tctx.globalCompositeOperation = 'source-over';
                tctx.clearRect(0, 0, fw, fh);

                // 1. Draw Sprite (Source Rect -> Temp Canvas)
                tctx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);

                // 2. Multiply Tint
                tctx.globalCompositeOperation = 'multiply';
                tctx.fillStyle = color;
                tctx.fillRect(0, 0, fw, fh);

                // 3. Clip (Restore Alpha using destination-in)
                tctx.globalCompositeOperation = 'destination-in';
                tctx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);

                // 4. Draw Scaled to Main Canvas
                tctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(this.tempCanvas, 0, 0, fw, fh, x, 0, 64, 64);
            });
        }

        // 5. Save to Cache
        const dataUrl = this.workCanvas.toDataURL('image/png');

        // Cache Management (Max 500 items)
        if (this.cache.size >= 500) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, dataUrl);

        return dataUrl;
    }

    /**
     * Converts a profile object into a list of specific Atlas Row indices and CSS hex colors.
     * 
     * @param {Object} profile - Visual profile metadata
     * @returns {Array<{row: number, color: string}>} Ordered array of layer specifications
     */
    parseLayers(profile) {
        const layers = [];
        const addLayer = (row, color) => {
            if (row !== undefined && row !== null && color) {
                let cssColor = color;
                if (typeof color === 'string') {
                    if (color.startsWith('0x')) {
                        cssColor = '#' + color.substring(2);
                    }
                } else if (typeof color === 'number') {
                    cssColor = '#' + color.toString(16).padStart(6, '0');
                } else {
                    return;
                }
                layers.push({ row, color: cssColor });
            }
        };

        // RELIABILITY: Helper for type-safe regex extraction on potential non-string values
        const safeMatch = (val, regex) => (typeof val === 'string' ? val.match(regex) : null);

        // 1. Base Head (Row 0)
        addLayer(0, profile.head.color || '#fff');

        // 2. Eyes Outer (Row 1)
        addLayer(1, '#ffffff');

        // 3. Eyes Iris (Row 2)
        if (profile.eyes && profile.eyes.color) {
            addLayer(2, profile.eyes.color);
        }

        // 4. Secondary Markings
        if (profile.head.secondarySprite) {
            const match = safeMatch(profile.head.secondarySprite, REGEX_SECONDARY);
            if (match) {
                const idx = parseInt(match[1], 10);
                const row = 3 + (idx - 1);
                if (row >= 3 && row <= 7) addLayer(row, profile.head.secondaryColor || '#fff');
            }
        }

        // 5. Accent Markings
        if (profile.head.accentSprite) {
            const match = safeMatch(profile.head.accentSprite, REGEX_SECONDARY);
            if (match) {
                const idx = parseInt(match[1], 10);
                const row = 3 + (idx - 1);
                if (row >= 3 && row <= 7) addLayer(row, profile.head.accentColor || '#fff');
            }
        }

        // 6. Ears
        if (profile.ear) {
            if (profile.ear.outerSprite) {
                const match = safeMatch(profile.ear.outerSprite, REGEX_EAR_OUTER);
                if (match) {
                    const idx = parseInt(match[1], 10);
                    const row = 9 + (idx - 1) * 2;
                    addLayer(row, profile.ear.outerColor || '#fff');
                }
            }
            if (profile.ear.innerSprite) {
                const match = safeMatch(profile.ear.innerSprite, REGEX_EAR_INNER);
                if (match) {
                    const idx = parseInt(match[1], 10);
                    const row = 8 + (idx - 1) * 2;
                    addLayer(row, profile.ear.innerColor || '#fff');
                }
            }
        }

        // 7. Head Accessories
        if (profile.headAccessories) {
            const spriteName = profile.headAccessories.sprite || profile.headAccessories;
            const match = safeMatch(spriteName, REGEX_HEAD_ACC);
            if (match) {
                const idx = parseInt(match[1], 10);
                const row = 30 + (idx - 1);
                const color = profile.headAccessories.color || '#fff';
                addLayer(row, color);
            }
        }

        return layers;
    }
}

// Global Instance
window.avatarRenderer = new AvatarRenderer();


