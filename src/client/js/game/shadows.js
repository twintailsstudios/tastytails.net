/**
 * @fileoverview shadows.js - Client-Side Dynamic Line-of-Sight (LoS) & Fog of War System
 * 
 * @description
 * Implements the ShadowSystem class for TastyTails.net, generating real-time dynamic light
 * visibility polygons around the player character using spatial hash partitioning and
 * sweep-line 2D raycasting. Renders a screen-fixed Phaser RenderTexture for Fog of War darkness.
 * 
 * Triggered by:
 * - Map load / Socket segment updates: socket.on('mapSegments') -> setSegments()
 * - Viewport resize events: Phaser.Scale.Events.RESIZE -> onResize()
 * - Scene main loop: scene.update() -> ShadowSystem.update() (60 FPS tick)
 */

import { computeViewport } from '../lib/visibility-polygon.js';

/**
 * Configuration constants for the Shadow System.
 * @type {Object}
 */
const SHADOW_CONFIG = {
    GRID_SIZE: 400,
    VIEW_DISTANCE: 1000,
    LERP_FACTOR: 0.3,
    SPEED_DEADZONE: 5,
    PLAYER_OFFSET_X: 30,
    FOG_COLOR: 0x000000,
    FOG_ALPHA: 0.5,
    DEPTH: 100,
    MIN_BOUNDS: 16
};

/**
 * Packs 2D cell grid coordinates (x, y) into a 32-bit integer key.
 * OPTIMIZATION: Replaces string template concatenation (`${x},${y}`) to prevent per-frame GC allocations.
 * Supports cell ranges from -32,768 to +32,767 (world bounds up to ±13,107,200 pixels).
 * 
 * @param {number} x - Grid cell X coordinate.
 * @param {number} y - Grid cell Y coordinate.
 * @returns {number} 32-bit packed integer key.
 */
function packCellKey(x, y) {
    return (((x + 32768) & 0xffff) * 65536) + ((y + 32768) & 0xffff);
}

/**
 * Manages dynamic 2D line-of-sight visibility and fog erasure.
 */
export class ShadowSystem {
    /**
     * @param {Phaser.Scene} scene - The active Phaser game scene instance.
     */
    constructor(scene) {
        this.scene = scene;
        this.renderTexture = null;
        this.polygonGraphics = null;
        this.segments = []; // Store map obstacle line segments from server
        this.segmentGrid = {}; // Client-side spatial hash index
        this.SEGMENT_GRID_SIZE = SHADOW_CONFIG.GRID_SIZE;

        // OPTIMIZATION: Allocation Pools & Caching to eliminate per-tick GC pressure
        this._seenSegments = new Set();
        this._relevantSegmentsBuffer = [];
        this._posBuffer = [0, 0];
        this._lastScrollX = null;
        this._lastScrollY = null;
        this.lastShadowPos = null;
        this.isDirty = true; // Force render on first frame or map load

        // OPTIMIZATION: Pre-allocated Bounding Box Segments Pool
        this._bboxSegments = [
            [[0, 0], [0, 0]], // Top
            [[0, 0], [0, 0]], // Right
            [[0, 0], [0, 0]], // Bottom
            [[0, 0], [0, 0]]  // Left
        ];

        this.init();
    }

    /**
     * Initializes the screen-sized RenderTexture, helper Graphics object, and event listeners.
     */
    init() {
        const width = Math.max(Math.floor(this.scene.scale.width || 800), SHADOW_CONFIG.MIN_BOUNDS);
        const height = Math.max(Math.floor(this.scene.scale.height || 600), SHADOW_CONFIG.MIN_BOUNDS);

        // Screen-fixed RenderTexture overlaying dark fog across viewport
        this.renderTexture = this.scene.add.renderTexture(0, 0, width, height);
        this.renderTexture.setOrigin(0, 0);
        this.renderTexture.setScrollFactor(0);
        this.renderTexture.setDepth(SHADOW_CONFIG.DEPTH);

        this.polygonGraphics = this.scene.make.graphics({ add: false });

        this.scene.scale.on('resize', this.onResize, this);

        // SAFEGUARD: Bind cleanup to Phaser Scene Shutdown / Destroy events to prevent memory leaks
        if (this.scene.events) {
            this.scene.events.once('shutdown', this.destroy, this);
            this.scene.events.once('destroy', this.destroy, this);
        }
    }

    /**
     * Hydrates the system with map obstacle line segments received from the server.
     * @param {Array<Array<Array<number>>>} segments - Array of 2D line segment coordinate pairs.
     */
    setSegments(segments) {
        this.segments = segments;
        this.populateSegmentGrid(segments);
        this.isDirty = true;
    }

    /**
     * Indexes map obstacle line segments into the spatial hash grid.
     * @param {Array<Array<Array<number>>>} segments - Array of 2D line segment coordinate pairs.
     */
    populateSegmentGrid(segments) {
        this.segmentGrid = {};
        if (!segments) return;

        for (let s = 0; s < segments.length; s++) {
            const seg = segments[s];
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
                    const key = packCellKey(x, y);
                    if (!this.segmentGrid[key]) this.segmentGrid[key] = [];
                    this.segmentGrid[key].push(seg);
                }
            }
        }
    }

    /**
     * Fast spatial query returning unique line segments within range of observer position.
     * OPTIMIZATION: Uses internal reusable array buffer to avoid per-frame allocations.
     * 
     * @param {number} x - Target world X coordinate.
     * @param {number} y - Target world Y coordinate.
     * @param {number} range - Query radius in world units (pixels).
     * @returns {Array<Array<Array<number>>>} Reusable array buffer of nearby line segments.
     */
    getSegmentsInRange(x, y, range) {
        const cx = Math.floor(x / this.SEGMENT_GRID_SIZE);
        const cy = Math.floor(y / this.SEGMENT_GRID_SIZE);
        const rangeInCells = Math.ceil(range / this.SEGMENT_GRID_SIZE);

        this._relevantSegmentsBuffer.length = 0;
        this._seenSegments.clear();

        for (let xx = cx - rangeInCells; xx <= cx + rangeInCells; xx++) {
            for (let yy = cy - rangeInCells; yy <= cy + rangeInCells; yy++) {
                const key = packCellKey(xx, yy);
                const cellSegs = this.segmentGrid[key];
                if (cellSegs) {
                    for (let i = 0; i < cellSegs.length; i++) {
                        const seg = cellSegs[i];
                        if (!this._seenSegments.has(seg)) {
                            this._seenSegments.add(seg);
                            this._relevantSegmentsBuffer.push(seg);
                        }
                    }
                }
            }
        }
        return this._relevantSegmentsBuffer;
    }

    /**
     * Resizes the screen RenderTexture upon game viewport dimensions update.
     * @param {Object} gameSize - Phaser GameSize object containing width and height.
     */
    onResize(gameSize) {
        const width = Math.max(Math.floor((gameSize && gameSize.width) || this.scene.scale.width || 800), SHADOW_CONFIG.MIN_BOUNDS);
        const height = Math.max(Math.floor((gameSize && gameSize.height) || this.scene.scale.height || 600), SHADOW_CONFIG.MIN_BOUNDS);

        if (this.renderTexture) {
            this.renderTexture.destroy();
        }

        this.renderTexture = this.scene.add.renderTexture(0, 0, width, height);
        this.renderTexture.setOrigin(0, 0);
        this.renderTexture.setScrollFactor(0);
        this.renderTexture.setDepth(SHADOW_CONFIG.DEPTH);
        this.isDirty = true;
    }

    /**
     * Main frame tick update handler. Smooths player position, queries line segments,
     * computes visibility polygon, and erases darkness mask.
     */
    update() {
        if (!this.renderTexture) return;

        const player = this.scene.playerContainer;
        if (!player || this.segments.length === 0) return;

        const targetX = player.x + SHADOW_CONFIG.PLAYER_OFFSET_X;
        const targetY = player.y;

        if (!this.lastShadowPos) {
            this.lastShadowPos = { x: targetX, y: targetY };
        }

        const dist = Phaser.Math.Distance.Between(this.lastShadowPos.x, this.lastShadowPos.y, targetX, targetY);

        // Smooth position tracking: Teleport Snap -> Deadzone Check -> Lerp
        if (dist > 100) {
            this.lastShadowPos.x = targetX;
            this.lastShadowPos.y = targetY;
        } else if (player.body && player.body.speed < SHADOW_CONFIG.SPEED_DEADZONE) {
            this.lastShadowPos.x = targetX;
            this.lastShadowPos.y = targetY;
        } else {
            this.lastShadowPos.x += (targetX - this.lastShadowPos.x) * SHADOW_CONFIG.LERP_FACTOR;
            this.lastShadowPos.y += (targetY - this.lastShadowPos.y) * SHADOW_CONFIG.LERP_FACTOR;
        }

        const camera = this.scene.cameras && this.scene.cameras.main;
        if (!camera) return;

        const scrollX = camera.scrollX;
        const scrollY = camera.scrollY;

        // OPTIMIZATION: Skip raycasting & WebGL erase pass if stationary and scene is clean
        const isStationary = Math.abs(this.lastShadowPos.x - targetX) < 0.01 &&
                             Math.abs(this.lastShadowPos.y - targetY) < 0.01 &&
                             scrollX === this._lastScrollX &&
                             scrollY === this._lastScrollY;

        if (isStationary && !this.isDirty) {
            return;
        }

        this.isDirty = false;
        this._lastScrollX = scrollX;
        this._lastScrollY = scrollY;

        this._posBuffer[0] = this.lastShadowPos.x;
        this._posBuffer[1] = this.lastShadowPos.y;

        const viewDist = SHADOW_CONFIG.VIEW_DISTANCE;
        const relevantSegments = this.getSegmentsInRange(this._posBuffer[0], this._posBuffer[1], viewDist);

        const px = this._posBuffer[0];
        const py = this._posBuffer[1];
        const minCorner = [px - viewDist, py - viewDist];
        const maxCorner = [px + viewDist, py + viewDist];

        const points = computeViewport(this._posBuffer, relevantSegments, minCorner, maxCorner);

        // Fill background fog
        this.renderTexture.clear();
        this.renderTexture.fill(SHADOW_CONFIG.FOG_COLOR, SHADOW_CONFIG.FOG_ALPHA);

        // Render light polygon into helper graphics
        this.polygonGraphics.clear();
        this.polygonGraphics.beginPath();

        if (points.length > 0) {
            this.polygonGraphics.moveTo(points[0][0] - scrollX, points[0][1] - scrollY);
            for (let i = 1; i < points.length; i++) {
                this.polygonGraphics.lineTo(points[i][0] - scrollX, points[i][1] - scrollY);
            }
        }

        this.polygonGraphics.closePath();
        this.polygonGraphics.fillStyle(0xffffff);
        this.polygonGraphics.fillPath();

        // Cut light polygon out of dark fog texture
        this.renderTexture.erase(this.polygonGraphics, 0, 0);
    }

    /**
     * Idempotent cleanup method. Unbinds listeners and destroys WebGL render textures.
     */
    destroy() {
        if (this.scene && this.scene.scale) {
            this.scene.scale.off('resize', this.onResize, this);
        }
        if (this.scene && this.scene.events) {
            this.scene.events.off('shutdown', this.destroy, this);
            this.scene.events.off('destroy', this.destroy, this);
        }
        if (this.renderTexture) {
            this.renderTexture.destroy();
            this.renderTexture = null;
        }
        if (this.polygonGraphics) {
            this.polygonGraphics.destroy();
            this.polygonGraphics = null;
        }
        this.segmentGrid = {};
        this._seenSegments.clear();
        this._relevantSegmentsBuffer.length = 0;
    }
}


