/**
 * AvatarRenderer.js
 * 
 * Handles the generation of dynamic avatar sprites for the chat interface.
 * Implements a "composite" rendering approach where separate body part layers
 * (head, eyes, ears, etc.) are drawn onto a single canvas, tinted, and combined.
 * 
 * Features:
 * - LRU (Least Recently Used) Caching to prevent re-rendering common avatars
 * - Reusable "Work Canvas" objects to minimize Garbage Collection
 * - Asynchronous Atlas Loading
 */
class AvatarRenderer {
    constructor() {
        this.cache = new Map(); // Key: profileHash -> DataURL
        this.atlasImage = null;
        this.atlasPath = '/assets/avatar/head_01_default.png'; // Fallback or dynamic
        this.frameWidth = 100; // Source dimensions (Atlas is 1000px wide / 10 cols)
        this.frameHeight = 100; // Source dimensions (Atlas is 3600px high / 36 rows)
        this.rows = 36;
        this.cols = 10;

        this.isReady = false;
        this.pendingRequests = []; // Callbacks waiting for load

        // --- Performance: Reusable Canvases ---
        // We reuse these canvas elements for every render operation to avoid 
        // the overhead of creating DOM elements and getting contexts repeatedly.
        this.workCanvas = document.createElement('canvas');
        this.workCanvas.width = 640;
        this.workCanvas.height = 64;
        this.workCtx = this.workCanvas.getContext('2d', { willReadFrequently: true });

        this.tempCanvas = document.createElement('canvas');
        // Initial size, will resize if needed but usually 100x100
        this.tempCanvas.width = 100;
        this.tempCanvas.height = 100;
        this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: true });
    }

    /**
     * Loads the master texture atlas required for rendering.
     * Handles singleton-like loading state to prevent duplicate network requests.
     * @param {string} url - The URL of the atlas image
     * @returns {Promise<HTMLImageElement>}
     */
    async loadAtlas(url) {
        if (this.atlasImage && this.atlasImage.src.endsWith(url)) return this.atlasImage;
        if (this.currentAtlasUrl === url && this.atlasPromise) return this.atlasPromise;

        this.currentAtlasUrl = url;
        this.atlasPromise = new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                this.atlasImage = img;
                this.isReady = true;
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
        return this.atlasPromise;
    }

    /**
     * Generates a unique key for the profile configuration.
     * Used for the LRU Cache lookups.
     */
    generateKey(layers, atlasUrl) {
        // Simple hash of the layers + atlas
        return atlasUrl + '::' + JSON.stringify(layers);
    }

    /**
     * Synchronously check if a profile is already cached.
     * Use this to avoid async overhead/flicker for instant-render cases.
     * @param {Object} profile - The visual profile object
     * @returns {string|null} DataURL of cached image or null
     */
    getCached(profile) {
        if (!profile || !profile.head || !profile.head.sprite) return null;
        const ATLAS_PATH = '/assets/avatar/';
        const headSprite = profile.head.sprite;
        const atlasUrl = `${ATLAS_PATH}${headSprite}_default.png`;
        const layers = this.parseLayers(profile);
        const key = this.generateKey(layers, atlasUrl);
        return this.cache.get(key) || null;
    }

    /**
     * Main render method. 
     * Composes the avatar layers into a single animated sprite sheet (640x64).
     * @param {Object} profile - The visual profile object
     * @returns {Promise<string|null>} Resolves to a DataURL (image string).
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
            // Access bump (LRU-ish behavior: remove and re-add to end)
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
        if (this.cache.size > 500) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, dataUrl);

        return dataUrl;
    }

    /**
     * Converts the high-level profile object into a list of specific Atlas Rows and Colors.
     * This mapping is specific to the "TastyTails" avatar sprite sheet layout.
     * @param {Object} profile 
     * @returns {Array} List of {row, color} objects
     */
    parseLayers(profile) {
        const layers = [];
        const addLayer = (row, color) => {
            if (row !== undefined && row !== null && color) {
                let cssColor = color;
                if (typeof color === 'string' && color.startsWith('0x')) {
                    cssColor = '#' + color.substring(2);
                }
                layers.push({ row, color: cssColor });
            }
        };

        // 1. Base Head (Row 0)
        addLayer(0, profile.head.color || '#fff');

        // 2. Eyes Outer (Row 1)
        addLayer(1, '#ffffff');

        // 3. Eyes Iris (Row 2)
        if (profile.eyes && profile.eyes.color) {
            addLayer(2, profile.eyes.color);
        }

        // ... Body markings logic ...
        // 4. Secondary Markings
        if (profile.head.secondarySprite) {
            const match = profile.head.secondarySprite.match(/secondary(?:Head)?_0?(\d+)/i);
            if (match) {
                const idx = parseInt(match[1], 10);
                const row = 3 + (idx - 1);
                if (row >= 3 && row <= 7) addLayer(row, profile.head.secondaryColor || '#fff');
            }
        }

        // 5. Accent Markings
        if (profile.head.accentSprite) {
            const match = profile.head.accentSprite.match(/secondary(?:Head)?_0?(\d+)/i);
            if (match) {
                const idx = parseInt(match[1], 10);
                const row = 3 + (idx - 1);
                if (row >= 3 && row <= 7) addLayer(row, profile.head.accentColor || '#fff');
            }
        }

        // 6. Ears
        if (profile.ear) {
            if (profile.ear.outerSprite) {
                const match = profile.ear.outerSprite.match(/ears_0?(\d+)-outer/i);
                if (match) {
                    const idx = parseInt(match[1], 10);
                    const row = 9 + (idx - 1) * 2;
                    addLayer(row, profile.ear.outerColor || '#fff');
                }
            }
            if (profile.ear.innerSprite) {
                const match = profile.ear.innerSprite.match(/ears_0?(\d+)-inner/i);
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
            if (typeof spriteName === 'string') {
                const match = spriteName.match(/headAccessories_0?(\d+)/i);
                if (match) {
                    const idx = parseInt(match[1], 10);
                    const row = 30 + (idx - 1);
                    const color = profile.headAccessories.color || '#fff';
                    addLayer(row, color);
                }
            }
        }

        return layers;
    }
}

// Global Instance
window.avatarRenderer = new AvatarRenderer();
