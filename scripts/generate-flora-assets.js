/**
 * @fileoverview generate-flora-assets.js
 * 
 * Generates pixel-perfect 32x32 transparent PNGs for all flora and botanical harvest items
 * in TastyTails.net using standard 8-bit RGBA PNG encoding.
 * 
 * Conforms to the TastyTails Simple Asset Artist specification:
 * - 32x32 Resolution
 * - 100% Alpha transparency background
 * - Top-left light source with highlights and shadows
 * - Semi-transparent ground contact shadows for flora
 * - Multi-directory deployment to /assets/images/flora/ and /assets/tilemaps/
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Creates a raw 32x32 RGBA canvas buffer initialized to transparent (0,0,0,0).
 */
function createCanvas() {
    return {
        width: 32,
        height: 32,
        data: Buffer.alloc(32 * 32 * 4, 0)
    };
}

/**
 * Sets a pixel on the canvas with clamping and alpha blending.
 */
function setPixel(canvas, x, y, r, g, b, a = 255) {
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
    const idx = (y * canvas.width + x) * 4;

    if (a === 255 || canvas.data[idx + 3] === 0) {
        canvas.data[idx] = r;
        canvas.data[idx + 1] = g;
        canvas.data[idx + 2] = b;
        canvas.data[idx + 3] = a;
    } else {
        // Standard Alpha Compositing
        const srcA = a / 255;
        const dstA = canvas.data[idx + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA > 0) {
            canvas.data[idx] = Math.round((r * srcA + canvas.data[idx] * dstA * (1 - srcA)) / outA);
            canvas.data[idx + 1] = Math.round((g * srcA + canvas.data[idx + 1] * dstA * (1 - srcA)) / outA);
            canvas.data[idx + 2] = Math.round((b * srcA + canvas.data[idx + 2] * dstA * (1 - srcA)) / outA);
            canvas.data[idx + 3] = Math.round(outA * 255);
        }
    }
}

/**
 * Parses hex color (e.g. "#ff0000" or [r, g, b, a]) and draws a pixel.
 */
function p(canvas, x, y, color) {
    if (!color) return;
    if (Array.isArray(color)) {
        setPixel(canvas, x, y, color[0], color[1], color[2], color[3] !== undefined ? color[3] : 255);
    } else if (typeof color === 'string') {
        let hex = color.replace('#', '');
        if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            setPixel(canvas, x, y, r, g, b, 255);
        } else if (hex.length === 8) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            const a = parseInt(hex.slice(6, 8), 16);
            setPixel(canvas, x, y, r, g, b, a);
        }
    }
}

/**
 * Draws a filled ellipse for contact shadows.
 */
function drawShadowEllipse(canvas, cx, cy, rx, ry, color = [15, 35, 15, 70]) {
    for (let y = cy - ry; y <= cy + ry; y++) {
        for (let x = cx - rx; x <= cx + rx; x++) {
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            if (dx * dx + dy * dy <= 1.0) {
                p(canvas, x, y, color);
            }
        }
    }
}

/**
 * Encodes a 32x32 RGBA canvas to a valid binary PNG Buffer with zlib compression.
 */
function encodePNG(canvas) {
    const width = canvas.width;
    const height = canvas.height;

    // Build raw scanlines with filter byte 0 (None)
    const scanlineLength = 1 + width * 4;
    const rawScanlines = Buffer.alloc(height * scanlineLength);

    for (let y = 0; y < height; y++) {
        const rowOffset = y * scanlineLength;
        rawScanlines[rowOffset] = 0; // Filter byte: None
        const srcOffset = y * width * 4;
        canvas.data.copy(rawScanlines, rowOffset + 1, srcOffset, srcOffset + width * 4);
    }

    const compressed = zlib.deflateSync(rawScanlines, { level: 9 });

    // PNG Chunks Builder
    function makeChunk(typeStr, dataBuf) {
        const len = dataBuf.length;
        const typeAndData = Buffer.concat([Buffer.from(typeStr, 'ascii'), dataBuf]);
        const crc = zlib.crc32(typeAndData);

        const chunk = Buffer.alloc(4 + 4 + len + 4);
        chunk.writeUInt32BE(len, 0);
        typeAndData.copy(chunk, 4);
        chunk.writeUInt32BE(crc, 8 + len);
        return chunk;
    }

    // 1. Signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // 2. IHDR Chunk (32x32, 8-bit depth, RGBA color type 6)
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8;  // bit depth
    ihdrData[9] = 6;  // color type 6: RGBA
    ihdrData[10] = 0; // compression
    ihdrData[11] = 0; // filter
    ihdrData[12] = 0; // interlace
    const ihdrChunk = makeChunk('IHDR', ihdrData);

    // 3. IDAT Chunk
    const idatChunk = makeChunk('IDAT', compressed);

    // 4. IEND Chunk
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// =========================================================================
// ASSET DRAWING FUNCTIONS (32x32 Pixel Art)
// =========================================================================

const assetsToGenerate = {
    // 1. Wild Tall Grass
    'flora_tall_grass': () => {
        const c = createCanvas();
        drawShadowEllipse(c, 16, 28, 9, 3, [12, 30, 12, 75]);

        const H = '#8ae05c'; // Highlight
        const M = '#4ea832'; // Main
        const D = '#2e7020'; // Dark/Shadow
        const O = '#184210'; // Outline

        // Left blade arch
        const leftBlade = [[10, 27], [9, 24], [8, 20], [8, 16], [9, 13], [10, 10], [12, 8]];
        leftBlade.forEach(([x, y]) => { p(c, x, y, M); p(c, x - 1, y, D); p(c, x, y - 1, H); });

        // Center tall main blades
        const centerBlade1 = [[15, 27], [15, 23], [14, 19], [14, 15], [15, 11], [15, 7], [16, 4]];
        centerBlade1.forEach(([x, y]) => { p(c, x, y, M); p(c, x - 1, y, H); p(c, x + 1, y, D); });

        const centerBlade2 = [[17, 27], [17, 22], [17, 17], [18, 13], [18, 9], [17, 6], [16, 5]];
        centerBlade2.forEach(([x, y]) => { p(c, x, y, H); p(c, x + 1, y, M); p(c, x + 2, y, D); });

        // Right blade arch
        const rightBlade = [[20, 27], [21, 23], [22, 19], [23, 16], [23, 13], [22, 11], [21, 9]];
        rightBlade.forEach(([x, y]) => { p(c, x, y, M); p(c, x + 1, y, D); p(c, x - 1, y, H); });

        // Dense bottom bush clump
        for (let y = 23; y <= 27; y++) {
            for (let x = 11; x <= 21; x++) {
                if (x + y % 2 === 0) p(c, x, y, M);
                else p(c, x, y, D);
            }
        }
        // Base roots/rim
        for (let x = 12; x <= 20; x++) p(c, x, 28, O);

        return c;
    },

    // 2. White Clover Patch
    'flora_clover': () => {
        const c = createCanvas();
        drawShadowEllipse(c, 16, 27, 10, 3, [12, 30, 12, 75]);

        const LH = '#74db60';
        const LM = '#349924';
        const LD = '#1d5c14';
        const WM = '#d6f5cc'; // Watermark
        const FW = '#ffffff'; // Flower white
        const FM = '#e8ede4';
        const FS = '#c0c9bc';

        // Stems
        const stems = [[15, 27], [15, 25], [14, 23], [17, 27], [17, 24], [18, 22], [16, 21], [16, 18]];
        stems.forEach(([x, y]) => p(c, x, y, LD));

        // Clover Leaf 1 (Left cluster: 3 leaflets)
        const leaf1 = [
            [10, 19], [11, 19], [10, 20], [11, 20], // top
            [8, 21], [9, 21], [8, 22], [9, 22],     // left
            [12, 21], [13, 21], [12, 22], [13, 22]  // right
        ];
        leaf1.forEach(([x, y]) => p(c, x, y, LM));
        p(c, 10, 19, LH); p(c, 8, 21, LH); p(c, 13, 21, LH);
        p(c, 10, 20, WM); p(c, 9, 21, WM); p(c, 12, 21, WM);

        // Clover Leaf 2 (Right cluster: 3 leaflets)
        const leaf2 = [
            [21, 20], [22, 20], [21, 21], [22, 21],
            [19, 22], [20, 22], [19, 23], [20, 23],
            [23, 22], [24, 22], [23, 23], [24, 23]
        ];
        leaf2.forEach(([x, y]) => p(c, x, y, LM));
        p(c, 21, 20, LH); p(c, 19, 22, LH); p(c, 24, 22, LH);
        p(c, 21, 21, WM); p(c, 20, 22, WM); p(c, 23, 22, WM);

        // White Clover Flower Head (Top center)
        const flower = [
            [15, 14], [16, 14], [17, 14],
            [14, 15], [15, 15], [16, 15], [17, 15], [18, 15],
            [14, 16], [15, 16], [16, 16], [17, 16], [18, 16],
            [15, 17], [16, 17], [17, 17]
        ];
        flower.forEach(([x, y]) => p(c, x, y, FM));
        p(c, 15, 14, FW); p(c, 16, 14, FW); p(c, 17, 14, FW);
        p(c, 15, 15, FW); p(c, 16, 15, FW);
        p(c, 14, 16, FS); p(c, 18, 16, FS); p(c, 16, 17, FS);

        return c;
    },

    // 3. Yellow Dandelion
    'flora_dandelion': () => {
        const c = createCanvas();
        drawShadowEllipse(c, 16, 28, 9, 3, [15, 35, 15, 70]);

        const FH = '#fff780';
        const FM = '#ffcc00';
        const FD = '#e69900';
        const FO = '#b36b00';
        const SH = '#50a836';
        const SM = '#2d691e';
        const SD = '#18400f';

        // Jagged basal leaves
        const leaves = [
            [9, 27], [10, 26], [11, 27], [12, 26], [13, 27], // left leaf
            [19, 27], [20, 26], [21, 27], [22, 26], [23, 27]  // right leaf
        ];
        leaves.forEach(([x, y]) => { p(c, x, y, SM); p(c, x, y - 1, SH); p(c, x, y + 1, SD); });

        // Upright central stem
        for (let y = 17; y <= 27; y++) {
            p(c, 16, y, SM);
            p(c, 15, y, SH);
            p(c, 17, y, SD);
        }

        // Green calyx cup
        p(c, 15, 17, SD); p(c, 16, 17, SD); p(c, 17, 17, SD);
        p(c, 14, 16, SM); p(c, 18, 16, SM);

        // Radiant Yellow Dandelion Head
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= 4.2) {
                    const x = 16 + dx;
                    const y = 12 + dy;
                    if (dist <= 1.5) p(c, x, y, FH);
                    else if (dist <= 3.0) p(c, x, y, (dx < 0 || dy < 0) ? FM : FD);
                    else p(c, x, y, (dx > 1 || dy > 1) ? FO : FD);
                }
            }
        }
        // Petal serration tips
        p(c, 16, 7, FH); p(c, 16, 17, FO);
        p(c, 11, 12, FM); p(c, 21, 12, FD);
        p(c, 12, 9, FH); p(c, 20, 9, FM);
        p(c, 12, 15, FD); p(c, 20, 15, FO);

        return c;
    },

    // 4. Red Poppy (flora_flower_1)
    'flora_flower_1': () => {
        const c = createCanvas();
        drawShadowEllipse(c, 16, 28, 8, 3, [15, 30, 15, 70]);

        const PH = '#ff6b6b';
        const PM = '#e61919';
        const PD = '#a80a0a';
        const PO = '#5e0000';
        const C1 = '#241824'; // Core
        const C2 = '#d9b84a'; // Stamen
        const SM = '#4d9e33';
        const SD = '#265917';

        // Curved stem
        const stem = [[15, 27], [15, 24], [16, 21], [16, 18], [15, 15]];
        stem.forEach(([x, y]) => { p(c, x, y, SM); p(c, x + 1, y, SD); });

        // Red Poppy Blossom
        for (let dy = -5; dy <= 5; dy++) {
            for (let dx = -5; dx <= 5; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= 5.0) {
                    const x = 16 + dx;
                    const y = 11 + dy;
                    if (dist <= 1.5) {
                        p(c, x, y, C1);
                    } else if (dist <= 3.2) {
                        p(c, x, y, (dx < 0 || dy < 0) ? PH : PM);
                    } else {
                        p(c, x, y, (dx > 2 || dy > 2) ? PO : PD);
                    }
                }
            }
        }
        // Stamen golden specks in center
        p(c, 15, 11, C2); p(c, 17, 11, C2); p(c, 16, 10, C2); p(c, 16, 12, C2);

        return c;
    },

    // 5. Blue Starflower (flora_flower_2)
    'flora_flower_2': () => {
        const c = createCanvas();
        drawShadowEllipse(c, 16, 28, 8, 3, [15, 30, 25, 70]);

        const BH = '#8ae6ff';
        const BM = '#3399ff';
        const BD = '#1a5ecc';
        const BO = '#0d3380';
        const CW = '#ffffff';
        const SM = '#45947a';
        const SD = '#235444';

        // Stem
        for (let y = 17; y <= 27; y++) {
            p(c, 16, y, SM); p(c, 17, y, SD);
        }
        // Leaves
        p(c, 14, 25, SM); p(c, 13, 24, SM); p(c, 18, 23, SM); p(c, 19, 22, SM);

        // 5 Star Petals
        const center = [16, 11];
        // Top petal
        for (let i = 0; i <= 5; i++) { p(c, 16, 11 - i, i < 3 ? BH : BM); p(c, 15, 11 - i, BD); }
        // Bottom Left petal
        for (let i = 0; i <= 4; i++) { p(c, 16 - i, 11 + i, BM); p(c, 16 - i, 12 + i, BD); }
        // Bottom Right petal
        for (let i = 0; i <= 4; i++) { p(c, 16 + i, 11 + i, BM); p(c, 16 + i, 12 + i, BO); }
        // Left petal
        for (let i = 0; i <= 5; i++) { p(c, 16 - i, 10, BH); p(c, 16 - i, 11, BM); }
        // Right petal
        for (let i = 0; i <= 5; i++) { p(c, 16 + i, 10, BM); p(c, 16 + i, 11, BD); }

        // White core
        p(c, 16, 11, CW); p(c, 16, 10, CW); p(c, 15, 11, BH); p(c, 17, 11, BH);

        return c;
    },

    // 6. Yellow Marigold (flora_flower_3)
    'flora_flower_3': () => {
        const c = createCanvas();
        drawShadowEllipse(c, 16, 28, 8, 3, [20, 30, 15, 70]);

        const MH = '#fff275';
        const MM = '#ffbb00';
        const MD = '#e66a00';
        const MO = '#8a3800';
        const SM = '#3e8c32';
        const SD = '#1e4f16';

        // Stem
        for (let y = 17; y <= 27; y++) {
            p(c, 16, y, SM); p(c, 17, y, SD);
        }
        // Feathery leaves
        p(c, 14, 25, SM); p(c, 13, 24, SM); p(c, 18, 23, SM); p(c, 19, 22, SM);

        // Dense Pompom Marigold Head
        for (let dy = -5; dy <= 5; dy++) {
            for (let dx = -5; dx <= 5; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= 5.2) {
                    const x = 16 + dx;
                    const y = 11 + dy;
                    if ((x + y) % 2 === 0) {
                        if (dist <= 2.0) p(c, x, y, MH);
                        else if (dist <= 3.8) p(c, x, y, MM);
                        else p(c, x, y, MD);
                    } else {
                        if (dist <= 2.5) p(c, x, y, MM);
                        else p(c, x, y, (dx > 1 || dy > 1) ? MO : MD);
                    }
                }
            }
        }

        return c;
    },

    // 7. Sweet Berry Bush
    'flora_berry_bush': () => {
        const c = createCanvas();
        drawShadowEllipse(c, 16, 28, 12, 4, [15, 35, 15, 80]);

        const BH = '#6bd455';
        const BM = '#3b9429';
        const BD = '#1f5914';
        const BO = '#103309';

        const R_HI = '#ffffff';
        const R_PK = '#ff7399';
        const R_MD = '#cc144d';
        const R_DK = '#730026';

        // Bush foliage clusters
        for (let dy = -9; dy <= 9; dy++) {
            for (let dx = -11; dx <= 11; dx++) {
                const normX = dx / 11;
                const normY = dy / 9;
                if (normX * normX + normY * normY <= 1.0) {
                    const x = 16 + dx;
                    const y = 18 + dy;
                    if (y <= 27) {
                        if (dy < -3 && dx < 0) p(c, x, y, (x + y) % 3 === 0 ? BH : BM);
                        else if (dx > 4 || dy > 4) p(c, x, y, (x + y) % 2 === 0 ? BD : BO);
                        else p(c, x, y, (x + y) % 2 === 0 ? BM : BD);
                    }
                }
            }
        }

        // Helper: Draw ripe berry with shine
        function drawBerry(bx, by) {
            p(c, bx, by, R_MD);
            p(c, bx + 1, by, R_MD);
            p(c, bx, by + 1, R_MD);
            p(c, bx + 1, by + 1, R_DK);
            p(c, bx, by, R_PK);
            p(c, bx - 1, by, R_DK);
            p(c, bx, by - 1, R_HI); // Specular highlight
        }

        // Scattered ripe berries across bush face
        drawBerry(11, 14);
        drawBerry(16, 12);
        drawBerry(21, 15);
        drawBerry(9, 20);
        drawBerry(15, 18);
        drawBerry(22, 21);
        drawBerry(18, 23);

        return c;
    },

    // 8. Plant Fiber (Harvest Material)
    'fiber_plant': () => {
        const c = createCanvas();
        const H = '#d4ed85';
        const M = '#91b83e';
        const D = '#5b7a21';
        const T1 = '#d9a75b'; // Twine highlight
        const T2 = '#8c5f1e'; // Twine shadow

        // Strands sheaf
        for (let i = -4; i <= 4; i++) {
            for (let y = 8; y <= 24; y++) {
                const x = 16 + i + Math.round(Math.sin((y - 16) * 0.3) * 2);
                p(c, x, y, (i < 0) ? H : (i === 0 ? M : D));
            }
        }

        // Frayed ends
        p(c, 13, 7, H); p(c, 15, 6, H); p(c, 18, 7, M); p(c, 20, 8, D);
        p(c, 13, 25, H); p(c, 16, 26, M); p(c, 19, 25, D);

        // Center twine band
        for (let x = 13; x <= 19; x++) {
            p(c, x, 15, T1);
            p(c, x, 16, T2);
        }

        return c;
    },

    // 9. Clover Leaf (Item)
    'clover_leaf': () => {
        const c = createCanvas();
        const H = '#75e660';
        const M = '#37a624';
        const D = '#1c6111';
        const W = '#d4fcd0';

        // 3 leaflets
        // Top leaflet
        for (let dy = 0; dy <= 3; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                p(c, 16 + dx, 10 + dy, dx < 0 ? H : M);
            }
        }
        p(c, 16, 12, W);

        // Left leaflet
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -3; dx <= 0; dx++) {
                p(c, 13 + dx, 15 + dy, dy < 0 ? H : M);
            }
        }
        p(c, 12, 15, W);

        // Right leaflet
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = 0; dx <= 3; dx++) {
                p(c, 19 + dx, 15 + dy, dy < 0 ? M : D);
            }
        }
        p(c, 20, 15, W);

        // Stem
        for (let i = 0; i <= 8; i++) {
            p(c, 16 + Math.round(i * 0.4), 16 + i, D);
        }

        return c;
    },

    // 10. Four-Leaf Clover (Rare Lucky Item)
    'four_leaf_clover': () => {
        const c = createCanvas();
        const H = '#82f56c';
        const M = '#38b524';
        const D = '#1d6b11';
        const G = '#ffd700'; // Gold shimmer

        // 4 leaflets (top, bottom, left, right)
        // Top
        for (let y = 8; y <= 12; y++) for (let x = 14; x <= 18; x++) p(c, x, y, x < 16 ? H : M);
        // Bottom
        for (let y = 16; y <= 20; y++) for (let x = 14; x <= 18; x++) p(c, x, y, x < 16 ? M : D);
        // Left
        for (let y = 12; y <= 16; y++) for (let x = 10; x <= 14; x++) p(c, x, y, y < 14 ? H : M);
        // Right
        for (let y = 12; y <= 16; y++) for (let x = 18; x <= 22; x++) p(c, x, y, y < 14 ? M : D);

        // Center golden glint
        p(c, 16, 14, G); p(c, 15, 14, G); p(c, 16, 13, G);
        p(c, 8, 8, '#ffffff'); p(c, 24, 8, G); p(c, 24, 22, G);

        // Stem
        p(c, 16, 21, D); p(c, 17, 22, D); p(c, 18, 23, D); p(c, 19, 24, D);

        return c;
    },

    // 11. Dandelion Bloom (Item)
    'flower_dandelion': () => {
        const c = createCanvas();
        const H = '#fff88a';
        const M = '#ffcc00';
        const D = '#c77800';
        const S = '#3e8c32';

        for (let dy = -5; dy <= 5; dy++) {
            for (let dx = -5; dx <= 5; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= 5.0) {
                    const x = 16 + dx;
                    const y = 15 + dy;
                    if (dist <= 1.8) p(c, x, y, H);
                    else if (dist <= 3.6) p(c, x, y, (dx < 0 || dy < 0) ? H : M);
                    else p(c, x, y, (dx > 1 || dy > 1) ? D : M);
                }
            }
        }
        // Calyx bottom
        p(c, 15, 21, S); p(c, 16, 21, S); p(c, 17, 21, S);
        p(c, 16, 22, S); p(c, 16, 23, S);

        return c;
    },

    // 12. Crimson Poppy Petal (Item)
    'petal_red': () => {
        const c = createCanvas();
        const H = '#ff6b6b';
        const M = '#e61e1e';
        const D = '#9e0a0a';
        const O = '#570000';

        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -5; dx <= 5; dx++) {
                const normX = dx / 5;
                const normY = dy / 6;
                if (normX * normX + normY * normY <= 1.0) {
                    const x = 16 + dx;
                    const y = 16 + dy;
                    if (dx < -1 || dy < -1) p(c, x, y, H);
                    else if (dx > 2 || dy > 2) p(c, x, y, (dx > 3 || dy > 3) ? O : D);
                    else p(c, x, y, M);
                }
            }
        }
        return c;
    },

    // 13. Azure Starflower Petal (Item)
    'petal_blue': () => {
        const c = createCanvas();
        const H = '#99ebff';
        const M = '#33a3ff';
        const D = '#1963d4';
        const O = '#0d3280';

        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const normX = dx / 4;
                const normY = dy / 6;
                if (normX * normX + normY * normY <= 1.0) {
                    const x = 16 + dx;
                    const y = 16 + dy;
                    if (dx < 0 || dy < -1) p(c, x, y, H);
                    else if (dx > 2 || dy > 2) p(c, x, y, O);
                    else p(c, x, y, (dx > 1 || dy > 1) ? D : M);
                }
            }
        }
        return c;
    },

    // 14. Golden Marigold Petal (Item)
    'petal_yellow': () => {
        const c = createCanvas();
        const H = '#fff585';
        const M = '#ffbf00';
        const D = '#d46e00';
        const O = '#803800';

        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const normX = dx / 4;
                const normY = dy / 6;
                if (normX * normX + normY * normY <= 1.0) {
                    const x = 16 + dx;
                    const y = 16 + dy;
                    if (dx < 0 || dy < -1) p(c, x, y, H);
                    else if (dx > 2 || dy > 2) p(c, x, y, O);
                    else p(c, x, y, (dx > 1 || dy > 1) ? D : M);
                }
            }
        }
        return c;
    },

    // 15. Sweet Wild Berries (Item)
    'food_berry': () => {
        const c = createCanvas();
        const HI = '#ffffff';
        const PK = '#ff85a8';
        const MD = '#d61852';
        const DK = '#80082c';
        const LM = '#5cb83d';
        const LD = '#2d691a';

        // Stem & Leaf
        p(c, 16, 9, LD); p(c, 16, 10, LD);
        p(c, 15, 10, LM); p(c, 14, 9, LM); p(c, 17, 10, LM); p(c, 18, 9, LM);

        // Helper: Draw berry sphere
        function drawBerry(cx, cy, r) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy <= r * r) {
                        const x = cx + dx;
                        const y = cy + dy;
                        if (dx < 0 && dy < 0) p(c, x, y, (dx === -1 && dy === -1) ? HI : PK);
                        else if (dx > 1 || dy > 1) p(c, x, y, DK);
                        else p(c, x, y, MD);
                    }
                }
            }
        }

        drawBerry(13, 16, 4);
        drawBerry(20, 16, 4);
        drawBerry(16, 21, 4);

        return c;
    }
};

// =========================================================================
// RUN GENERATION & SAVE TO ALL DIRECTORIES
// =========================================================================

const floraDir = path.join(__dirname, '../src/client/assets/images/flora');
const tilemapDir = path.join(__dirname, '../src/client/assets/tilemaps');

if (!fs.existsSync(floraDir)) {
    fs.mkdirSync(floraDir, { recursive: true });
}

let generatedCount = 0;

for (const [key, drawFn] of Object.entries(assetsToGenerate)) {
    const canvas = drawFn();
    const pngBuffer = encodePNG(canvas);

    const floraPath = path.join(floraDir, `${key}.png`);
    const tilemapPath = path.join(tilemapDir, `${key}.png`);

    // Write to /assets/tilemaps/ (used by Phaser preloader and stream)
    fs.writeFileSync(tilemapPath, pngBuffer);

    // If it's a flora item, also write to /assets/images/flora/
    if (key.startsWith('flora_')) {
        fs.writeFileSync(floraPath, pngBuffer);
    }

    generatedCount++;
    console.log(`[Asset Generator] Generated 32x32 pixel art PNG for '${key}' (${pngBuffer.length} bytes)`);
}

console.log(`[Asset Generator] Successfully generated and deployed ${generatedCount} 32x32 visual assets!`);
