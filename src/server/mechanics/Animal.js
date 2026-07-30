
/**
 * @fileoverview Server-side Animal Entity
 * @description Authoritative server implementation of animal AI, movement state machine,
 * dual-axis sliding tile collisions, tethered spawn wander pathing, and resource regrowth timers.
 * 
 * Triggered by:
 * - Server tick loop (server-loop.js) via update(delta) with 1500px player proximity culling.
 * - Player socket interaction events (interactionHandlers.js) when harvesting wool.
 */
class Animal {
    /**
     * Creates a new server-side Animal entity instance.
     * @param {string} id - Unique identifier (e.g. 'animals_323')
     * @param {number} x - Initial X coordinate in world pixels
     * @param {number} y - Initial Y coordinate in world pixels
     * @param {Object} properties - Configuration properties from Tiled object layer
     * @param {Function} collisionCallback - Injected point collision evaluator (x, y) => boolean
     */
    constructor(id, x, y, properties, collisionCallback) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.properties = properties || {};
        
        // SAFEGUARD: Defensive fallback prevents server process crash if invoked without a valid callback function
        this.checkCollision = (typeof collisionCallback === 'function') 
            ? collisionCallback 
            : () => false;

        // Configuration Stats
        this.speed = properties.moveSpeed || 30;
        this.wanderRange = properties.wanderRange || 200;

        // FSM State Machine Initialization
        this.state = 'IDLE'; // Supported states: 'IDLE', 'MOVE'
        this.stateTimer = 0;

        this.targetX = x;
        this.targetY = y;

        // OPTIMIZATION: Pre-cached Bounding Box Dimensions to match 24x24 entity footprint
        this.bodyWidth = properties.bodyWidth || 24;
        this.bodyHeight = properties.bodyHeight || 24;
        this.halfW = this.bodyWidth / 2;

        // Wool Harvest Mechanics & Regrowth Timers
        this.isSheared = false;
        this.regrowthTimer = 0;
        this.regrowthDuration = properties.regrowthDuration || 60.0; // Default 60 seconds

        // Initial AI State Selection
        this.pickNewState();
    }

    /**
     * Evaluates tilemap collision for the entity's bounding box centered at (x, y).
     * Tests 6 key points along the lower body bounding box against solid grid tiles.
     * 
     * @param {number} x - Center X position in pixels
     * @param {number} y - Bottom Y position in pixels
     * @returns {boolean} True if any bounding box sample point collides with a solid tile.
     */
    isBlockedAt(x, y) {
        const halfW = this.halfW;
        const h = this.bodyHeight;
        // OPTIMIZATION: Short-circuits on first colliding tile point to minimize callback invocations
        return this.checkCollision(x - halfW, y) ||
               this.checkCollision(x + halfW, y) ||
               this.checkCollision(x - halfW, y - h) ||
               this.checkCollision(x + halfW, y - h) ||
               this.checkCollision(x, y) ||
               this.checkCollision(x, y - h);
    }

    /**
     * Randomly picks the next AI state (MOVE vs IDLE) and calculates target wander coordinates
     * tethered within wanderRange of the initial spawn origin (startX, startY).
     */
    /**
     * Randomly picks the next AI state (MOVE vs IDLE) and calculates target wander coordinates
     * tethered within wanderRange of the initial spawn origin (startX, startY).
     */
    pickNewState() {
        // If entity itself is currently blocked at current position, attempt minor recovery nudge
        if (this.isBlockedAt(this.x, this.y)) {
            const offsets = [[-8, 0], [8, 0], [0, -8], [0, 8], [-16, 0], [16, 0], [0, -16], [0, 16]];
            for (const [ox, oy] of offsets) {
                if (!this.isBlockedAt(this.x + ox, this.y + oy)) {
                    this.x += ox;
                    this.y += oy;
                    break;
                }
            }
        }

        // Probabilistic State Transition: 80% MOVE, 20% IDLE
        if (Math.random() < 0.2) {
            this.state = 'IDLE';
            this.stateTimer = 1 + Math.random() * 2; // 1-3s pause duration
        } else {
            this.state = 'MOVE';
            this.moveTimer = 0;
            this.maxMoveTime = 8.0; // Pathing timeout guard: give up after 8 seconds

            const maxDist = Math.max(20, this.wanderRange - 50);
            let validTargetFound = false;

            // Attempt up to 5 candidate wander targets to avoid picking blocked destinations
            for (let attempt = 0; attempt < 5; attempt++) {
                const dist = 50 + Math.random() * maxDist;
                const angle = Math.random() * Math.PI * 2;
                const candidateX = this.startX + Math.cos(angle) * dist;
                const candidateY = this.startY + Math.sin(angle) * dist;

                if (!this.isBlockedAt(candidateX, candidateY)) {
                    this.targetX = candidateX;
                    this.targetY = candidateY;
                    validTargetFound = true;
                    break;
                }
            }

            if (!validTargetFound) {
                // Fall back to IDLE if no valid target in range
                this.state = 'IDLE';
                this.stateTimer = 1.0;
            }
        }
    }

    /**
     * Executes single tick AI update step.
     * Handles state timers, velocity movement, sliding collision physics, and regrowth cooldowns.
     * 
     * @param {number} delta - Elapsed frame delta time in seconds (e.g. 0.033 for 30 TPS)
     */
    update(delta) {
        if (this.state === 'IDLE') {
            this.stateTimer -= delta;
            if (this.stateTimer <= 0) {
                this.pickNewState();
            }
        } else if (this.state === 'MOVE') {
            this.moveTimer += delta;
            if (this.moveTimer >= this.maxMoveTime) {
                this.state = 'IDLE';
                this.stateTimer = 1.0;
                return;
            }

            // Vector math towards target position
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
                // Reached destination target
                this.x = this.targetX;
                this.y = this.targetY;
                this.pickNewState();
            } else {
                // Normalize velocity and calculate target delta position
                const moveDist = this.speed * delta;
                const ratio = moveDist / dist;
                const moveX = dx * ratio;
                const moveY = dy * ratio;

                const nextX = this.x + moveX;
                const nextY = this.y + moveY;

                // Separate Axis Collision (Sliding Physics) with Diagonal Safeguard
                const canMoveX = !this.isBlockedAt(nextX, this.y);
                const canMoveY = !this.isBlockedAt(this.x, nextY);
                const canMoveDiagonal = canMoveX && canMoveY && !this.isBlockedAt(nextX, nextY);

                if (canMoveDiagonal) {
                    // Full Diagonal Movement
                    this.x = nextX;
                    this.y = nextY;
                } else if (canMoveX) {
                    // Slide along X axis when Y is obstructed
                    this.x = nextX;
                } else if (canMoveY) {
                    // Slide along Y axis when X is obstructed
                    this.y = nextY;
                } else {
                    // Fully Blocked: Force 1.0s IDLE pause and reset state
                    this.state = 'IDLE';
                    this.stateTimer = 1.0;
                }
            }
        }

        // Regrowth Cooldown Logic
        if (this.isSheared) {
            this.regrowthTimer -= delta;
            if (this.regrowthTimer <= 0) {
                this.isSheared = false;
            }
        }
    }

    /**
     * Marks animal as sheared and initiates the resource regrowth timer.
     * Invoked by socket interaction handlers when a player uses shears.
     */
    markSheared() {
        this.isSheared = true;
        this.regrowthTimer = this.regrowthDuration;
    }

    /**
     * Generates lightweight delta network payload for socket transmission.
     * 
     * OPTIMIZATION: Rounds coordinates to 1 decimal place to reduce JSON string payload length by ~40%
     * while maintaining 0.1px resolution for smooth client Arcade physics catch-up.
     * 
     * @returns {{ id: string, x: number, y: number, state: string, isSheared: boolean }} DTO snapshot payload
     */
    getData() {
        return {
            id: this.id,
            x: Math.round(this.x * 10) / 10,
            y: Math.round(this.y * 10) / 10,
            state: this.state,
            isSheared: this.isSheared
        };
    }
}

module.exports = Animal;
