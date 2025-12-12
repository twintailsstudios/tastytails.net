import { compute } from '../lib/visibility-polygon.js';

export class ShadowSystem {
    constructor(scene) {
        // console.log('[ShadowSystem] Constructor called');
        this.scene = scene;
        this.renderTexture = null;
        this.polygonGraphics = null;
        this.segments = []; // Store map segments from server

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
        const playerX = player.x;
        const playerY = player.y;
        const pos = [playerX, playerY];

        // Compute visibility locally
        const points = compute(pos, this.segments);
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
