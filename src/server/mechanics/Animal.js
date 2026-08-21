/**
 * @fileoverview Server-side Animal Entity
 * @description Authoritative server implementation of animal AI, movement state machine,
 * dual-axis sliding tile collisions, tethered spawn wander pathing, dynamic biological
 * desire evaluation (Hydration/Thirst), A* water pathfinding, and resource regrowth timers.
 * 
 * Triggered by:
 * - Server tick loop (server-loop.js) via update(delta) with 1500px player proximity culling.
 * - Player socket interaction events (interactionHandlers.js) when harvesting wool.
 */

const NeedsManager = require('./NeedsManager');
const Pathfinder = require('./Pathfinder');
const defaultWaterRegistry = require('./WaterSourceRegistry');

class Animal {
    /**
     * Creates a new server-side Animal entity instance.
     * @param {string} id - Unique identifier (e.g. 'animals_323')
     * @param {number} x - Initial X coordinate in world pixels
     * @param {number} y - Initial Y coordinate in world pixels
     * @param {Object} properties - Configuration properties from Tiled object layer
     * @param {Function} collisionCallback - Injected point collision evaluator (x, y) => boolean
     * @param {Object} [waterRegistry] - Injected WaterSourceRegistry singleton
     */
    constructor(id, x, y, properties, collisionCallback, waterRegistry = null) {
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

        this.waterRegistry = waterRegistry || defaultWaterRegistry;

        // Configuration Stats
        this.speed = properties.moveSpeed || 30;
        this.wanderRange = properties.wanderRange || 200;
        this.health = typeof properties.health === 'number' ? properties.health : 60;
        this.maxHealth = typeof properties.maxHealth === 'number' ? properties.maxHealth : 60;
        this.baseArmor = typeof properties.baseArmor === 'number' ? properties.baseArmor : 0;
        this.isDead = false;
        this.harvestLoot = properties.harvestLoot || [
            { itemId: 'meat_raw_game', count: [1, 2], chance: 1.0 },
            { itemId: 'raw_wool', count: [1, 1], chance: 0.8 }
        ];

        // FSM State Machine Initialization
        // Supported states: 'IDLE', 'MOVE', 'SEEK_WATER', 'DRINKING'
        this.state = 'IDLE';
        this.stateTimer = 0;
        this.moveTimer = 0;
        this.maxMoveTime = 8.0;

        this.targetX = x;
        this.targetY = y;

        // Biological Needs & Desires Component
        this.needs = new NeedsManager(properties);

        // Pathfinding & Waypoint Navigation
        /** @type {Array<{x: number, y: number}>} */
        this.currentPath = [];
        this.pathIndex = 0;
        this.waterTarget = null;
        this.drinkingDuration = properties.drinkingDuration || 3.0; // 3.0s drinking time
        this.drinkingTimer = 0;
        this.pathSearchCooldown = 0;

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

        // Check if biological thirst desire overrides normal wander
        if (this.needs.isThirsty()) {
            if (this.startSeekingWater()) {
                return;
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
     * Initiates A* pathfinding towards the nearest water source tile.
     * @param {Object} [waterRegistryOverride]
     * @param {Array<Array<number>>|Function} [collisionOverride]
     * @returns {boolean} True if a water target was located and path calculated
     */
    startSeekingWater(waterRegistryOverride = null, collisionOverride = null) {
        const registry = waterRegistryOverride || this.waterRegistry;
        if (!registry) return false;

        const collisionMap = collisionOverride || ((tx, ty) => {
            const px = tx * 32 + 16;
            const py = ty * 32 + 16;
            return this.isBlockedAt(px, py);
        });

        // 1. Locate nearest water source and its adjacent dry standing spot
        const searchResult = registry.findNearestWaterSource(this.x, this.y, collisionMap, 10000);
        if (!searchResult) {
            return false;
        }

        this.waterTarget = searchResult;
        const destination = searchResult.standingSpot || searchResult.waterTile;

        // 2. Compute A* Path from current pixel position to standing spot
        const waypoints = Pathfinder.findWorldPath(
            this.x, 
            this.y, 
            destination.worldX, 
            destination.worldY, 
            collisionMap, 
            32, 
            { maxExplored: 2500, allowClosestOnTimeout: true }
        );

        if (waypoints && waypoints.length > 0) {
            this.currentPath = waypoints;
            this.pathIndex = 0;
            this.state = 'SEEK_WATER';
            this.moveTimer = 0;
            this.maxMoveTime = 60.0; // Pathfinding traversal timeout guard (60s)
            return true;
        }

        return false;
    }

    /**
     * Executes single tick AI update step.
     * Handles state timers, velocity movement, sliding collision physics,
     * biological desire decay, A* path following, and resource regrowth cooldowns.
     * 
     * @param {number} delta - Elapsed frame delta time in seconds (e.g. 0.033 for 30 TPS)
     * @param {Object} [waterRegistry] - Optional runtime WaterSourceRegistry reference
     * @param {Array<Array<number>>|Function} [collisionMap] - Optional runtime collision grid
     */
    update(delta, waterRegistry = null, collisionMap = null) {
        if (delta <= 0) return;

        // 1. Update Biological Needs (Hydration Decay)
        this.needs.update(delta);

        if (this.pathSearchCooldown > 0) {
            this.pathSearchCooldown -= delta;
        }

        // 2. State Machine Dispatcher
        if (this.state === 'IDLE') {
            // Check thirst drive
            if (this.needs.isThirsty() && this.pathSearchCooldown <= 0) {
                if (this.startSeekingWater(waterRegistry, collisionMap)) {
                    return;
                }
                this.pathSearchCooldown = 4.0; // Avoid hammering pathfinder if no water reachable
            }

            this.stateTimer -= delta;
            if (this.stateTimer <= 0) {
                this.pickNewState();
            }
        } else if (this.state === 'MOVE') {
            // Urgent parched check interrupts casual wandering
            if (this.needs.isParched() && this.pathSearchCooldown <= 0) {
                if (this.startSeekingWater(waterRegistry, collisionMap)) {
                    return;
                }
            }

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
                this._stepMovement(dx, dy, dist, this.speed, delta);
            }
        } else if (this.state === 'SEEK_WATER') {
            this.moveTimer += delta;
            if (this.moveTimer >= this.maxMoveTime) {
                // Path timeout guard
                this.state = 'IDLE';
                this.stateTimer = 1.0;
                this.pathSearchCooldown = 3.0;
                return;
            }

            // Distance to water target check
            if (this.waterTarget) {
                const targetTile = this.waterTarget.waterTile || this.waterTarget.standingSpot;
                const distToWater = Math.hypot(targetTile.worldX - this.x, targetTile.worldY - this.y);
                if (distToWater <= 48) {
                    // Reached water! Begin drinking
                    this.state = 'DRINKING';
                    this.drinkingTimer = this.drinkingDuration;
                    this.currentPath = [];
                    return;
                }
            }

            // Waypoint Navigation
            if (Array.isArray(this.currentPath) && this.pathIndex < this.currentPath.length) {
                const currentWaypoint = this.currentPath[this.pathIndex];
                const wdx = currentWaypoint.x - this.x;
                const wdy = currentWaypoint.y - this.y;
                const wdist = Math.sqrt(wdx * wdx + wdy * wdy);

                if (wdist <= 8) {
                    // Advance to next waypoint
                    this.pathIndex++;
                    if (this.pathIndex >= this.currentPath.length) {
                        // Reached final waypoint
                        if (this.waterTarget) {
                            this.state = 'DRINKING';
                            this.drinkingTimer = this.drinkingDuration;
                        } else {
                            this.state = 'IDLE';
                            this.stateTimer = 1.0;
                        }
                        this.currentPath = [];
                        return;
                    }
                } else {
                    // Move towards active waypoint (with +15% speed buff if critically parched)
                    const speedMult = this.needs.isParched() ? 1.2 : 1.0;
                    this._stepMovement(wdx, wdy, wdist, this.speed * speedMult, delta);
                }
            } else {
                // Path completed or empty
                this.state = 'IDLE';
                this.stateTimer = 1.0;
            }
        } else if (this.state === 'DRINKING') {
            // Stationary drinking state
            this.drinkingTimer -= delta;
            const fullyQuenched = this.needs.drink(delta);

            if (this.drinkingTimer <= 0 || fullyQuenched) {
                // Drinking complete! Hydration restored
                this.needs.satisfyHydration();
                this.state = 'IDLE';
                this.stateTimer = 2.0 + Math.random() * 2.0; // Content resting pause
                this.waterTarget = null;
                this.currentPath = [];
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
     * Executes single step sliding collision movement physics.
     * @private
     */
    _stepMovement(dx, dy, dist, moveSpeed, delta) {
        const moveDist = moveSpeed * delta;
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
            this.x = nextX;
            this.y = nextY;
        } else if (canMoveX) {
            this.x = nextX;
        } else if (canMoveY) {
            this.y = nextY;
        } else {
            // Blocked: if seeking water, advance to next waypoint or recover
            if (this.state === 'SEEK_WATER' && this.pathIndex < this.currentPath.length - 1) {
                this.pathIndex++;
            } else {
                this.state = 'IDLE';
                this.stateTimer = 1.0;
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
     * Applies damage to the animal (e.g. from carnivore predator attack or player action).
     * @param {number} amount - Raw incoming damage
     * @param {string} [damageType='brute']
     * @param {string} [attackerId=null]
     * @param {Object} [networkEmitter=null]
     * @returns {{ success: boolean, effectiveDamage: number, newHealth: number, dead: boolean }}
     */
    takeDamage(amount, damageType = 'brute', attackerId = null, networkEmitter = null) {
        if (this.isDead || this.state === 'DEAD') {
            return { success: false, effectiveDamage: 0, newHealth: 0, dead: true };
        }

        const armor = this.baseArmor || 0;
        const effectiveDamage = Math.max(1, Math.round(amount - (armor * 0.5)));
        this.health = Math.max(0, this.health - effectiveDamage);

        const isDead = this.health <= 0;
        if (isDead) {
            this.isDead = true;
            this.state = 'DEAD';
            if (networkEmitter && typeof networkEmitter.emitDied === 'function') {
                networkEmitter.emitDied({
                    animalId: this.id,
                    mobId: this.id,
                    x: this.x,
                    y: this.y,
                    harvestLoot: this.harvestLoot
                });
            }
        }

        return {
            success: true,
            effectiveDamage,
            newHealth: this.health,
            dead: isDead
        };
    }

    /**
     * Generates lightweight delta network payload for socket transmission.
     * Includes hydration stat and AI desire state.
     * 
     * @returns {{ id: string, x: number, y: number, state: string, isSheared: boolean, health: number, maxHealth: number, isDead: boolean, hydration: number, maxHydration: number }} DTO snapshot payload
     */
    getData() {
        return {
            id: this.id,
            name: (this.properties && this.properties.name) || 'Domestic Sheep',
            species: (this.properties && this.properties.species) || 'sheep',
            disposition: (this.properties && this.properties.disposition) || 'neutral',
            diet: (this.properties && this.properties.diet) || 'herbivore',
            x: Math.round(this.x * 10) / 10,
            y: Math.round(this.y * 10) / 10,
            state: this.state,
            isSheared: this.isSheared,
            health: this.health,
            maxHealth: this.maxHealth,
            isDead: this.isDead,
            hydration: Math.round(this.needs.hydration.current),
            maxHydration: this.needs.hydration.max,
            hunger: Math.round(this.needs.hunger.current),
            maxHunger: this.needs.hunger.max,
            enableHunger: this.needs.enableHunger
        };
    }
}

module.exports = Animal;
