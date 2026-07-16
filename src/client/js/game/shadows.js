import { compute } from '../lib/visibility-polygon.js';

export class ShadowSystem {
    constructor(scene) {
        // console.log('[ShadowSystem] Constructor called');
        this.scene = scene;
        this.renderTexture = null;
        this.polygonGraphics = null;
        this.segments = []; // Store map segments from server

        this.segments = []; // Store map segments from server
        this.segmentGrid = {}; // Client-side spatial hash
        this.SEGMENT_GRID_SIZE = 400; // Match Server

        this.init();
    }

    init() {
        // 1. Create a Render Texture (Screen Size)
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;

        // console.log(`[ShadowSystem] Init: Screen Size: ${width}x${height}`);

        // DIRECTLY add the RenderTexture to the scene
        this.renderTexture = this.scene.add.renderTexture(0, 0, width, height);
        this.renderTexture.setOrigin(0, 0); // Top-left
        this.renderTexture.setScrollFactor(0); // Sticks to camera
        this.renderTexture.setDepth(100); // Overlay depth

        // 2. Helper Graphics to draw the polygon (not added to scene, just for drawing to RT)
        this.polygonGraphics = this.scene.make.graphics({ add: false });

        // Handle Resize
        this.scene.scale.on('resize', this.onResize, this);
    }

    setSegments(segments) {
        // console.log(`[ShadowSystem] setSegments called with ${segments ? segments.length : 'null'} segments`);
        this.segments = segments;
        this.populateSegmentGrid(segments);
    }

    populateSegmentGrid(segments) {
        this.segmentGrid = {};
        if (!segments) return;

        segments.forEach(seg => {
            const p1 = seg[0];
            const p2 = seg[1];

            const minX = Math.min(p1[0], p2[0]);
            const maxX = Math.max(p1[0], p2[0]);
            const minY = Math.min(p1[1], p2[1]);
            const maxY = Math.max(p1[1], p2[1]);

            const startX = Math.floor(minX / this.SEGMENT_GRID_SIZE);
            const endX = Math.floor(maxX / this.SEGMENT_GRID_SIZE);
            const startY = Math.floor(minY / this.SEGMENT_GRID_SIZE);
            const endY = Math.floor(maxY / this.SEGMENT_GRID_SIZE);

            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const key = `${x},${y}`;
                    if (!this.segmentGrid[key]) this.segmentGrid[key] = [];
                    this.segmentGrid[key].push(seg);
                }
            }
        });
        // console.log(`[ShadowSystem] Client-side Segment Grid populated.`);
    }

    getSegmentsInRange(x, y, range) {
        const cx = Math.floor(x / this.SEGMENT_GRID_SIZE);
        const cy = Math.floor(y / this.SEGMENT_GRID_SIZE);
        const rangeInCells = Math.ceil(range / this.SEGMENT_GRID_SIZE);

        const segments = new Set();

        for (let xx = cx - rangeInCells; xx <= cx + rangeInCells; xx++) {
            for (let yy = cy - rangeInCells; yy <= cy + rangeInCells; yy++) {
                const key = `${xx},${yy}`;
                if (this.segmentGrid[key]) {
                    const cellSegs = this.segmentGrid[key];
                    for (let i = 0; i < cellSegs.length; i++) {
                        segments.add(cellSegs[i]);
                    }
                }
            }
        }
        return Array.from(segments);
    }

    onResize(gameSize) {
        if (this.renderTexture) this.renderTexture.destroy();

        this.renderTexture = this.scene.add.renderTexture(0, 0, gameSize.width, gameSize.height);
        this.renderTexture.setOrigin(0, 0);
        this.renderTexture.setScrollFactor(0);
        this.renderTexture.setDepth(100);
    }

    update() {
        // console.log('[ShadowSystem] Update tick'); // Verbose
        if (!this.renderTexture) return;

        // Use playerContainer as the player object (create.js uses this)
        const player = this.scene.playerContainer;

        if (!player) {
            // console.warn('[ShadowSystem] No player container');
            return;
        }

        if (this.segments.length === 0) {
            // console.warn('[ShadowSystem] No segments yet');
            return;
        }

        // Use local player position for instant, predicted shadows
        const targetX = player.x + 30;
        const targetY = player.y;

        // Initialize if missing
        if (!this.lastShadowPos) {
            this.lastShadowPos = { x: targetX, y: targetY };
        }

        // Calculate distance to target
        const dist = Phaser.Math.Distance.Between(this.lastShadowPos.x, this.lastShadowPos.y, targetX, targetY);

        // --- ENHANCED SMOOTHING ---

        // 1. Teleport Snap (Large jumps)
        if (dist > 100) {
            this.lastShadowPos.x = targetX;
            this.lastShadowPos.y = targetY;
        }
        // 2. Resting Deadzone (Player stopped)
        // Check body speed to see if we are effectively standing still.
        // This prevents the shadow from "shimmering" due to sub-pixel body adjustments.
        else if (player.body && player.body.speed < 5) {
            this.lastShadowPos.x = targetX;
            this.lastShadowPos.y = targetY;
        }
        // 3. Normal Movement (Lerp)
        else {
            // Lerp factor: 0.3 (User Preference)
            const lerp = 0.3;
            this.lastShadowPos.x += (targetX - this.lastShadowPos.x) * lerp;
            this.lastShadowPos.y += (targetY - this.lastShadowPos.y) * lerp;
        }

        const pos = [this.lastShadowPos.x, this.lastShadowPos.y];

        // Compute visibility locally
        // [OPTIMIZED] Use Spatial Partitioning
        // View Distance matches Server (600) or arguably screen size (1920/2 = 1000)
        // Let's use 1000 to be safe for rendering (visuals matter more than strict anti-cheat here)
        const viewDist = 1000;
        const relevantSegments = this.getSegmentsInRange(pos[0], pos[1], viewDist);

        // [FIX] Add Dynamic Bounding Box Limit
        // Prevents infinite rays vs culled segments
        const boxSize = viewDist;
        const px = pos[0];
        const py = pos[1];

        relevantSegments.push(
            [[px - boxSize, py - boxSize], [px + boxSize, py - boxSize]], // Top
            [[px + boxSize, py - boxSize], [px + boxSize, py + boxSize]], // Right
            [[px + boxSize, py + boxSize], [px - boxSize, py + boxSize]], // Bottom
            [[px - boxSize, py + boxSize], [px - boxSize, py - boxSize]]  // Left
        );

        const points = compute(pos, relevantSegments);
        // console.log(`[ShadowSystem] Computed ${points.length} points`);

        const camera = this.scene.cameras.main;

        // 1. Reset Darkness (Fill texture with Black, 50% alpha)
        this.renderTexture.clear();
        this.renderTexture.fill(0x000000, 0.5);

        // 2. Draw Light Polygon (into the helper graphics)
        this.polygonGraphics.clear();
        this.polygonGraphics.beginPath();

        if (points.length > 0) {
            // Convert World -> Screen Space relative to Camera
            const scrollX = camera.scrollX;
            const scrollY = camera.scrollY;

            this.polygonGraphics.moveTo(points[0][0] - scrollX, points[0][1] - scrollY);

            for (let i = 1; i < points.length; i++) {
                this.polygonGraphics.lineTo(points[i][0] - scrollX, points[i][1] - scrollY);
            }
        }

        this.polygonGraphics.closePath();
        this.polygonGraphics.fillStyle(0xffffff); // Color doesn't matter for erase, but keeps it valid
        this.polygonGraphics.fillPath();

        // 3. Erase the polygon from the darkness (reveals the world underneath)
        this.renderTexture.erase(this.polygonGraphics, 0, 0);
    }
}
