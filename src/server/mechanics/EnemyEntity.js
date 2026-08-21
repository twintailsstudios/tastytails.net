/**
 * @fileoverview EnemyEntity.js - Authoritative Server-Side NPC Enemy & Hierarchical State Machine
 * @subsystem Combat & Telegraph Engine
 * @description
 * Implements authoritative server-side enemy AI, 4-phase synchronized attack lifecycle
 * (WINDUP -> FLASH -> ACTIVE -> RECOVERY), anatomical limb damage/fracture simulation,
 * geometric hitbox evaluation via AttackShapeMath.js, and weak-point attack interruption.
 */

const log = require('../../logger');
const AttackShapeMath = require('./AttackShapeMath');
const enemyDefinitions = require('../../data/enemyDefinitions');
const NeedsManager = require('./NeedsManager');
const Pathfinder = require('./Pathfinder');
const defaultWaterRegistry = require('./WaterSourceRegistry');

/**
 * Deep clones plain object to avoid shared references between enemy instances.
 * @param {Object} obj
 * @returns {Object}
 */
function clone(obj) {
    if (!obj) return {};
    return JSON.parse(JSON.stringify(obj));
}

class EnemyEntity {
    /**
     * Creates a new authoritative EnemyEntity.
     * @param {string} id - Unique instance ID (e.g. 'test_1')
     * @param {string} defId - Definition key in enemyDefinitions.js (e.g. 'test')
     * @param {number} x - Initial spawn X in pixels
     * @param {number} y - Initial spawn Y in pixels
     * @param {Function} [collisionCallback] - Point collision checker (x, y) => boolean
     */
    constructor(id, defId, x, y, collisionCallback) {
        this.id = id;
        this.defId = defId;
        const normalizedDefId = (typeof defId === 'string') ? defId.toLowerCase() : defId;
        const def = enemyDefinitions[defId] || enemyDefinitions[normalizedDefId] || enemyDefinitions.test || Object.values(enemyDefinitions)[0];
        this.def = def;
        this.isNewlySpawned = true;

        this.name = def.name || 'Wild Beast';
        this.description = def.description || '';
        this.texture = def.texture || 'idle_test';
        this.scale = def.scale || 1.0;
        this.footprint = def.footprint || { width: 48, height: 48 };

        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.tetherOrigin = { x: x, y: y };
        this.facingAngle = 0; // In radians

        // Stats & Vitals
        this.stats = clone(def.stats) || {
            health: 200,
            maxHealth: 200,
            bloodVolume: 3000,
            maxBloodVolume: 3000,
            stamina: 100,
            moveSpeed: 80,
            baseArmor: 0
        };

        // AI & Disposition Configuration
        this.ai = clone(def.ai) || {
            archetype: 'rusher',
            disposition: 'aggressive',
            diet: 'none',
            aggroRadius: 350,
            deaggroRadius: 550,
            preferredCombatDistance: 70,
            orbitSpeedMultiplier: 0.6,
            enrageHealthPercent: 0.35,
            enrageSpeedBuff: 1.3,
            enrageWindupMultiplier: 0.75
        };

        this.disposition = this.ai.disposition || 'aggressive'; // 'aggressive' | 'territorial' | 'neutral' | 'runner'
        this.diet = this.ai.diet || 'none'; // 'carnivore' | 'herbivore' | 'omnivore' | 'none'
        this.warningRadius = this.ai.warningRadius || this.ai.aggroRadius || 320;
        this.breachRadius = this.ai.breachRadius || 140;
        this.leashRadius = this.ai.leashRadius || this.ai.deaggroRadius || 460;
        this.postureDuration = this.ai.postureDuration || 2.5;
        this.postureTimer = 0;
        this.fearRadius = this.ai.fearRadius || 200;
        this.sprintMultiplier = this.ai.sprintMultiplier || 1.4;
        this.foodSearchRadius = this.ai.foodSearchRadius || 400;
        this.threatTable = {}; // Attacker ID -> accumulated damage points
        this.peaceTimer = 0; // Out-of-combat timer for passive regeneration (>= 5.0s)
        this.fleeTimer = 0;

        // Dietary & Foraging State
        this.foodTarget = null;
        this.eatingDuration = this.ai.eatingDuration || 4.0;
        this.eatingTimer = 0;
        this.eatingTargetType = null; // 'meat' | 'plant' (for client HUD overhead badge)

        // Anatomical Limbs & Weaknesses
        this.anatomy = clone(def.anatomy) || { limbs: {} };
        if (!this.anatomy.limbs) this.anatomy.limbs = {};
        for (const [limbKey, limbData] of Object.entries(this.anatomy.limbs)) {
            if (typeof limbData.hp !== 'number') limbData.hp = 100;
            if (typeof limbData.maxHp !== 'number') limbData.maxHp = limbData.hp;
            limbData.fractured = false;
            limbData.bleeding = 0;
        }

        // Attacks Registry with runtime cooldown tracking
        this.attacks = (def.attacks || []).map(atk => ({
            ...clone(atk),
            lastUsedTime: 0
        }));

        // Harvest Loot Drops
        this.harvestLoot = clone(def.harvestLoot) || [];

        // Collision callback
        this.checkCollision = (typeof collisionCallback === 'function')
            ? collisionCallback
            : () => false;

        // HFSM State Initialization
        // States: 'IDLE', 'POSTURING', 'FLEEING', 'RETURN_TO_TERRITORY', 'SEEK_FOOD', 'HUNT_WANDER', 'EATING', 'SEEK_WATER', 'DRINKING', 'ORBIT_SPACING', 'WINDUP', 'FLASH', 'ACTIVE', 'RECOVERY', 'DEAD'
        this.state = 'IDLE';
        this.stateTimer = 1.0; // Seconds remaining in current state
        this.targetPlayerId = null;

        // Current Active Attack Context
        this.currentAttack = null;
        this.attackOrigin = { x: x, y: y };
        this.attackAngle = 0;
        this.targetReticlePos = { x: x, y: y };
        this.windupTotalTime = 0;
        this.windupElapsedTime = 0;
        this.targetLimbGlowDamage = 0; // Accumulator for weak-point interrupt check

        // Orbit / Spacing pathing timers
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitDirection = Math.random() < 0.5 ? 1 : -1;
        this.isEnraged = false;
        this.wallStunDurationMs = 0;

        // Biological Needs & Desires Engine
        this.needs = new NeedsManager((def && def.needs) || {});
        this.waterRegistry = defaultWaterRegistry;
        this.currentPath = [];
        this.pathIndex = 0;
        this.waterTarget = null;
        this.huntTargetPos = null; // Target meadow coordinate during HUNT_WANDER
        this.drinkingDuration = (def && def.needs && def.needs.drinkingDuration) || 3.0;
        this.drinkingTimer = 0;
        this.pathSearchCooldown = 0;

        // Cached math scratch values to avoid GC allocations
        this._dx = 0;
        this._dy = 0;
    }

    /**
     * Checks if the entity's footprint is blocked at (x, y) against world tiles.
     * @param {number} testX
     * @param {number} testY
     * @returns {boolean}
     */
    isBlockedAt(testX, testY) {
        const halfW = (this.footprint.width || 32) * 0.5;
        const halfH = (this.footprint.height || 32) * 0.5;
        return this.checkCollision(testX - halfW, testY - halfH) ||
               this.checkCollision(testX + halfW, testY - halfH) ||
               this.checkCollision(testX - halfW, testY + halfH) ||
               this.checkCollision(testX + halfW, testY + halfH) ||
               this.checkCollision(testX, testY);
    }

    /**
     * Main authoritative tick update method (called at 30Hz server rate).
     * 
     * @param {number} dt - Frame delta time in seconds (e.g. ~0.033s)
     * @param {Object} players - Global players dictionary
     * @param {Object} [networkEmitter] - Optional network hooks { emitTelegraphStart, emitTelegraphCancel, emitAttackExecute, emitDied, emitWarning, applyDamageFunc, alertNearbyAllies }
     * @param {Object} [waterRegistry] - Water source registry singleton
     * @param {Array|Function} [collisionMap] - Collision map
     * @param {Object} [envContext] - Environmental ecology context { worldItems, activeResourceNodes, activeAnimals, activeEnemies, removeItem }
     */
    update(dt, players = {}, networkEmitter = null, waterRegistry = null, collisionMap = null, envContext = null) {
        if (this.state === 'DEAD') return;

        // 1. Update Biological Needs (Hydration & Hunger Decay)
        this.needs.update(dt);

        if (this.pathSearchCooldown > 0) {
            this.pathSearchCooldown -= dt;
        }

        // 2. Passive Health Regeneration (Player-aligned critical damage rule)
        const isCombat = this.state === 'ORBIT_SPACING' || this.state === 'WINDUP' || this.state === 'FLASH' || this.state === 'ACTIVE' || this.state === 'RECOVERY';
        if (!isCombat) {
            this.peaceTimer += dt;
            if (this.peaceTimer >= 5.0) {
                this.updatePassiveRegeneration(dt);
            }
        } else {
            this.peaceTimer = 0;
        }

        // Check enrage state transition
        const hpPercent = (this.stats.health || 0) / (this.stats.maxHealth || 1);
        if (!this.isEnraged && hpPercent <= (this.ai.enrageHealthPercent || 0.35)) {
            this.isEnraged = true;
            log.info(`[EnemyEntity] ${this.name} (${this.id}) entered ENRAGE FRENZY at ${Math.round(hpPercent * 100)}% HP!`);
        }

        // State Machine Dispatcher
        switch (this.state) {
            case 'IDLE':
                this.updateIdle(dt, players, waterRegistry, collisionMap, envContext, networkEmitter);
                break;
            case 'POSTURING':
                this.updatePosturing(dt, players, networkEmitter);
                break;
            case 'FLEEING':
                this.updateFleeing(dt, players, envContext);
                break;
            case 'RETURN_TO_TERRITORY':
                this.updateReturnToTerritory(dt, players, networkEmitter);
                break;
            case 'SEEK_FOOD':
                this.updateSeekFood(dt, players, envContext, networkEmitter);
                break;
            case 'HUNT_WANDER':
                this.updateHuntWander(dt, players, envContext, networkEmitter);
                break;
            case 'EATING':
                this.updateEating(dt, envContext);
                break;
            case 'SEEK_WATER':
                this.updateSeekWater(dt, players, waterRegistry, collisionMap);
                break;
            case 'DRINKING':
                this.updateDrinking(dt);
                break;
            case 'ORBIT_SPACING':
                this.updateOrbitSpacing(dt, players, networkEmitter, envContext);
                break;
            case 'WINDUP':
                this.updateWindup(dt, players, networkEmitter);
                break;
            case 'FLASH':
                this.updateFlash(dt, players, networkEmitter);
                break;
            case 'ACTIVE':
                this.updateActive(dt, players, networkEmitter, envContext);
                break;
            case 'RECOVERY':
                this.updateRecovery(dt, players);
                break;
        }
    }

    /**
     * Subsystem 3: Passive Health Regeneration with Anatomical Critical Damage Thresholds.
     * Only restores un-fractured limbs up to their maxHp; fractured or destroyed limbs cap recovery.
     * @param {number} dt - Delta time in seconds
     */
    updatePassiveRegeneration(dt) {
        if (this.stats.health >= this.stats.maxHealth) return;

        let totalMaxLimbHp = 0;
        let uninjuredMaxLimbHp = 0;
        const limbs = this.anatomy && this.anatomy.limbs ? Object.values(this.anatomy.limbs) : [];

        if (limbs.length > 0) {
            for (const limb of limbs) {
                const maxH = limb.maxHp || 100;
                totalMaxLimbHp += maxH;
                if (!limb.fractured && limb.hp > 0) {
                    uninjuredMaxLimbHp += maxH;
                }
            }
        }

        const maxRecoverableHp = totalMaxLimbHp > 0
            ? Math.round((uninjuredMaxLimbHp / totalMaxLimbHp) * this.stats.maxHealth)
            : this.stats.maxHealth;

        if (this.stats.health < maxRecoverableHp) {
            const regenRate = 0.02 * this.stats.maxHealth; // 2% max HP per second
            const regenStep = regenRate * dt;
            this.stats.health = Math.min(maxRecoverableHp, this.stats.health + regenStep);

            // Also passively heal non-fractured limbs
            for (const limb of limbs) {
                const maxH = limb.maxHp || 100;
                if (!limb.fractured && limb.hp > 0 && limb.hp < maxH) {
                    const limbRegen = (maxH / (totalMaxLimbHp || 1)) * (this.stats.maxHealth * 0.02 * dt);
                    limb.hp = Math.min(maxH, limb.hp + limbRegen);
                }
            }
        }
    }

    /**
     * IDLE state: evaluates disposition sensory triggers, biological desires, or wanders passively.
     */
    updateIdle(dt, players, waterRegistry = null, collisionMap = null, envContext = null, networkEmitter = null) {
        // 1. Disposition-specific Player Sensory & Aggro checks
        if (this.disposition === 'aggressive') {
            const target = this.findClosestTarget(players, this.ai.aggroRadius);
            if (target) {
                this.targetPlayerId = target.playerId || target.id;
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5 + Math.random() * 0.5;
                this.currentPath = [];
                this.waterTarget = null;
                this.foodTarget = null;
                return;
            }
        } else if (this.disposition === 'territorial') {
            // Check inner breach ring (immediate combat)
            const breachTarget = this.findClosestTarget(players, this.breachRadius);
            if (breachTarget) {
                this.targetPlayerId = breachTarget.playerId || breachTarget.id;
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5;
                this.currentPath = [];
                this.waterTarget = null;
                this.foodTarget = null;
                return;
            }

            // Check outer warning ring (POSTURING warning state)
            const warnTarget = this.findClosestTarget(players, this.warningRadius);
            if (warnTarget) {
                this.targetPlayerId = warnTarget.playerId || warnTarget.id;
                this.state = 'POSTURING';
                this.postureTimer = this.postureDuration;
                this.currentPath = [];
                this.waterTarget = null;
                this.foodTarget = null;
                const wx = warnTarget.position ? warnTarget.position.x : warnTarget.x;
                const wy = warnTarget.position ? warnTarget.position.y : warnTarget.y;
                this.facingAngle = Math.atan2(wy - this.y, wx - this.x);

                if (networkEmitter && typeof networkEmitter.emitWarning === 'function') {
                    networkEmitter.emitWarning({
                        mobId: this.id,
                        targetPlayerId: this.targetPlayerId,
                        warningRadius: this.warningRadius,
                        breachRadius: this.breachRadius
                    });
                }
                return;
            }

            // If mob has strayed far from territory origin without a target, return home
            const distToHome = Math.hypot(this.x - this.tetherOrigin.x, this.y - this.tetherOrigin.y);
            if (distToHome > 80) {
                this.state = 'RETURN_TO_TERRITORY';
                return;
            }
        } else if (this.disposition === 'neutral') {
            // Neutral only fights when damaged; checks threat table
            if (this.targetPlayerId && players[this.targetPlayerId] && !players[this.targetPlayerId].isDead) {
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5;
                return;
            }
        } else if (this.disposition === 'runner') {
            // Runner checks for players or predatory mobs within fearRadius
            const threat = this.findClosestThreat(players, envContext, this.fearRadius);
            if (threat) {
                this.state = 'FLEEING';
                this.fleeTimer = 3.0;
                this.currentPath = [];
                this.waterTarget = null;
                this.foodTarget = null;
                const tx = threat.position ? threat.position.x : threat.x;
                const ty = threat.position ? threat.position.y : threat.y;
                const fdx = this.x - tx;
                const fdy = this.y - ty;
                const fdist = Math.hypot(fdx, fdy);
                if (fdist > 0) {
                    const nx = fdx / fdist;
                    const ny = fdy / fdist;
                    const speed = this.stats.moveSpeed * this.sprintMultiplier;
                    this.facingAngle = Math.atan2(ny, nx);
                    this.tryMove(nx * speed * dt, ny * speed * dt);
                }
                return;
            }
        }

        // 2. Biological Desires (Hunger & Thirst when out of combat)
        const isCarnivore = this.diet === 'carnivore' || this.diet === 'omnivore';
        const strongest = this.needs.getStrongestDesire();

        if ((strongest.need === 'hunger' || this.needs.isHungry()) && this.diet !== 'none' && this.pathSearchCooldown <= 0) {
            if (this.startSeekingFood(envContext, collisionMap)) {
                return;
            }
            // If carnivore is hungry but no prey found in local radius, transition to HUNT_WANDER prowl
            if (isCarnivore) {
                this.state = 'HUNT_WANDER';
                this.stateTimer = 20.0 + Math.random() * 10.0;
                const herbTiles = (envContext && Array.isArray(envContext.herbivoreTiles) && envContext.herbivoreTiles.length > 0)
                    ? envContext.herbivoreTiles
                    : (envContext && Array.isArray(envContext.plantTiles) && envContext.plantTiles.length > 0 ? envContext.plantTiles : null);

                if (herbTiles && herbTiles.length > 0) {
                    const chosen = herbTiles[Math.floor(Math.random() * herbTiles.length)];
                    this.huntTargetPos = { x: chosen.x, y: chosen.y };
                } else {
                    this.huntTargetPos = null;
                }
                return;
            }
            this.pathSearchCooldown = 3.0;
        } else if ((strongest.need === 'hydration' || this.needs.isThirsty()) && this.pathSearchCooldown <= 0) {
            if (this.startSeekingWater(waterRegistry, collisionMap)) {
                return;
            }
            this.pathSearchCooldown = 3.0;
        }

        // 3. Passive idle wander (open roaming for wild fauna, tethered for territorial guardians)
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.stateTimer = 2.0 + Math.random() * 2.0;
            if (this.disposition === 'territorial') {
                const dist = Math.hypot(this.x - this.startX, this.y - this.startY);
                if (dist > 150) {
                    const angle = Math.atan2(this.startY - this.y, this.startX - this.x);
                    this.facingAngle = angle;
                    this.tryMove(Math.cos(angle) * (this.stats.moveSpeed * 0.4) * dt, Math.sin(angle) * (this.stats.moveSpeed * 0.4) * dt);
                    return;
                }
            }
            // Open roaming for wild fauna
            const randomAngle = Math.random() * Math.PI * 2;
            this.facingAngle = randomAngle;
            const wanderSpeed = this.stats.moveSpeed * 0.35;
            this.tryMove(Math.cos(randomAngle) * wanderSpeed * dt, Math.sin(randomAngle) * wanderSpeed * dt);
        }
    }

    /**
     * Finds the closest player or predatory mob threat for a runner entity.
     * @param {Object} players
     * @param {Object} envContext
     * @param {number} radius
     * @returns {Object|null}
     */
    findClosestThreat(players, envContext, radius) {
        let closest = null;
        let minDistSq = radius * radius;

        // Check players
        for (const player of Object.values(players || {})) {
            if (!player || player.isDead || !player.position) continue;
            const dx = player.position.x - this.x;
            const dy = player.position.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= minDistSq) {
                minDistSq = distSq;
                closest = player;
            }
        }

        // Check aggressive carnivore enemies
        if (envContext && envContext.activeEnemies) {
            for (const other of Object.values(envContext.activeEnemies)) {
                if (!other || other.id === this.id || other.state === 'DEAD') continue;
                if (other.diet === 'carnivore' || other.disposition === 'aggressive') {
                    const dx = other.x - this.x;
                    const dy = other.y - this.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq <= minDistSq) {
                        minDistSq = distSq;
                        closest = other;
                    }
                }
            }
        }

        return closest;
    }

    /**
     * POSTURING State (Territorial mobs): Halts, faces player, and counts down postureDuration.
     */
    updatePosturing(dt, players, networkEmitter) {
        this.peaceTimer = 0;
        const target = this.getTargetPlayer(players);
        if (!target || target.isDead || !target.position) {
            this.targetPlayerId = null;
            this.state = 'RETURN_TO_TERRITORY';
            this.stateTimer = 1.0;
            return;
        }

        const tx = target.position.x;
        const ty = target.position.y;
        this.facingAngle = Math.atan2(ty - this.y, tx - this.x);
        const dist = Math.hypot(tx - this.x, ty - this.y);

        // Breach trigger: player entered inner ring
        if (dist <= this.breachRadius) {
            this.state = 'ORBIT_SPACING';
            this.stateTimer = 0.5;
            return;
        }

        // De-escalation trigger: player backed away beyond outer warning ring
        if (dist > this.warningRadius) {
            this.targetPlayerId = null;
            this.state = 'RETURN_TO_TERRITORY';
            this.stateTimer = 1.0;
            return;
        }

        // Warning posture countdown
        this.postureTimer -= dt;
        if (this.postureTimer <= 0) {
            // Posture duration expired while player remained in warning ring -> mob attacks!
            this.state = 'ORBIT_SPACING';
            this.stateTimer = 0.5;
        }
    }

    /**
     * FLEEING State (Runner mobs): Computes inverted repulsion vector away from nearest threat.
     */
    updateFleeing(dt, players, envContext) {
        this.peaceTimer = 0;
        const threat = this.findClosestThreat(players, envContext, this.fearRadius * 1.5);
        if (threat) {
            const tx = threat.position ? threat.position.x : threat.x;
            const ty = threat.position ? threat.position.y : threat.y;
            const dx = this.x - tx;
            const dy = this.y - ty;
            const dist = Math.hypot(dx, dy);

            if (dist > 0) {
                const nx = dx / dist;
                const ny = dy / dist;
                const speed = this.stats.moveSpeed * this.sprintMultiplier;
                this.facingAngle = Math.atan2(ny, nx);
                this.tryMove(nx * speed * dt, ny * speed * dt);
            }

            if (dist > this.fearRadius * 1.5) {
                this.fleeTimer -= dt;
                if (this.fleeTimer <= 0) {
                    this.state = 'IDLE';
                    this.stateTimer = 1.0;
                }
            } else {
                this.fleeTimer = 3.0;
            }
        } else {
            this.fleeTimer -= dt;
            if (this.fleeTimer <= 0) {
                this.state = 'IDLE';
                this.stateTimer = 1.0;
            }
        }
    }

    /**
     * RETURN_TO_TERRITORY State: Paths back to territory leash point without chasing across the map.
     */
    updateReturnToTerritory(dt, players, networkEmitter) {
        // Territorial mobs still scan for trespassing players while walking home
        if (this.disposition === 'territorial') {
            const breachTarget = this.findClosestTarget(players, this.breachRadius);
            if (breachTarget) {
                this.targetPlayerId = breachTarget.playerId || breachTarget.id;
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5;
                return;
            }
            const warnTarget = this.findClosestTarget(players, this.warningRadius);
            if (warnTarget) {
                this.targetPlayerId = warnTarget.playerId || warnTarget.id;
                this.state = 'POSTURING';
                this.postureTimer = this.postureDuration;
                const wx = warnTarget.position ? warnTarget.position.x : warnTarget.x;
                const wy = warnTarget.position ? warnTarget.position.y : warnTarget.y;
                this.facingAngle = Math.atan2(wy - this.y, wx - this.x);
                if (networkEmitter && typeof networkEmitter.emitWarning === 'function') {
                    networkEmitter.emitWarning({
                        mobId: this.id,
                        targetPlayerId: this.targetPlayerId,
                        warningRadius: this.warningRadius,
                        breachRadius: this.breachRadius
                    });
                }
                return;
            }
        }

        const dx = this.tetherOrigin.x - this.x;
        const dy = this.tetherOrigin.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= 15) {
            this.x = this.tetherOrigin.x;
            this.y = this.tetherOrigin.y;
            this.state = 'IDLE';
            this.stateTimer = 1.0;
            return;
        }

        const speed = this.stats.moveSpeed * 0.8;
        const step = Math.min(dist, speed * dt);
        this.facingAngle = Math.atan2(dy, dx);
        this.tryMove((dx / dist) * step, (dy / dist) * step);
    }

    /**
     * Subsystem 2: Initiates dietary search for food sources based on diet classification.
     * @param {Object} envContext
     * @param {Array|Function} [collisionOverride]
     * @returns {boolean} True if a valid food source was located and targeted
     */
    startSeekingFood(envContext, collisionOverride = null) {
        if (!envContext || this.diet === 'none') return false;

        const candidates = [];
        const radius = this.foodSearchRadius || 400;
        const radiusSq = radius * radius;

        // Carnivore Sources: dropped raw meat, domestic animals, wild runner mobs
        if (this.diet === 'carnivore' || this.diet === 'omnivore') {
            // 1. Dropped meat items
            const items = Array.isArray(envContext.worldItems) ? envContext.worldItems : [];
            for (const item of items) {
                if (!item) continue;
                const isMeat = item.itemId === 'meat_raw_game' || (item.name && item.name.toLowerCase().includes('meat'));
                if (isMeat) {
                    const distSq = (item.x - this.x) ** 2 + (item.y - this.y) ** 2;
                    if (distSq <= radiusSq) {
                        candidates.push({ type: 'item', target: item, x: item.x, y: item.y, distSq, dietCategory: 'meat' });
                    }
                }
            }

            // 2. Domestic Animals (Sheep, etc.)
            const animals = envContext.activeAnimals ? Object.values(envContext.activeAnimals) : [];
            for (const animal of animals) {
                if (!animal || animal.isDead || animal.state === 'DEAD') continue;
                const distSq = (animal.x - this.x) ** 2 + (animal.y - this.y) ** 2;
                if (distSq <= radiusSq) {
                    candidates.push({ type: 'prey', target: animal, targetType: 'animal', x: animal.x, y: animal.y, distSq, dietCategory: 'meat' });
                }
            }

            // 3. Wild Herbivores & Runner mobs (Bunnies, Sheep, Boars, etc.)
            const enemies = envContext.activeEnemies ? Object.values(envContext.activeEnemies) : [];
            for (const other of enemies) {
                if (!other || other.id === this.id || other.state === 'DEAD') continue;
                const isPrey = other.diet === 'herbivore' || other.disposition === 'runner';
                if (isPrey) {
                    const distSq = (other.x - this.x) ** 2 + (other.y - this.y) ** 2;
                    if (distSq <= radiusSq) {
                        candidates.push({ type: 'prey', target: other, targetType: 'enemy', x: other.x, y: other.y, distSq, dietCategory: 'meat' });
                    }
                }
            }
        }

        // Herbivore Sources: flora resource nodes, dropped produce
        if (this.diet === 'herbivore' || this.diet === 'omnivore') {
            // 1. Resource nodes (trees, crops, dynamic flora)
            const nodes = envContext.activeResourceNodes ? Object.values(envContext.activeResourceNodes) : [];
            for (const node of nodes) {
                if (!node || typeof node.capacity !== 'number' || node.capacity <= 0) continue;
                const isFlora = node.isDynamicFlora || (node.type && (
                    node.type.includes('flora') ||
                    node.type.includes('tree') ||
                    node.type.includes('plant') ||
                    node.type.includes('crop')
                ));
                if (isFlora) {
                    const distSq = (node.x - this.x) ** 2 + (node.y - this.y) ** 2;
                    if (distSq <= radiusSq) {
                        candidates.push({ type: 'node', target: node, x: node.x, y: node.y, distSq, dietCategory: 'plant' });
                    }
                }
            }

            // 2. Dropped produce items
            const items = Array.isArray(envContext.worldItems) ? envContext.worldItems : [];
            const FLORA_ITEMS = new Set(['food_orange', 'food_potato', 'food_berry', 'indigo', 'madder_root', 'weld', 'fiber_plant', 'clover_leaf', 'flower_dandelion', 'petal_red', 'petal_blue', 'petal_yellow']);
            for (const item of items) {
                if (!item) continue;
                if (FLORA_ITEMS.has(item.itemId) || (item.name && (item.name.toLowerCase().includes('fruit') || item.name.toLowerCase().includes('orange') || item.name.toLowerCase().includes('potato') || item.name.toLowerCase().includes('berry') || item.name.toLowerCase().includes('clover') || item.name.toLowerCase().includes('grass')))) {
                    const distSq = (item.x - this.x) ** 2 + (item.y - this.y) ** 2;
                    if (distSq <= radiusSq) {
                        candidates.push({ type: 'item', target: item, x: item.x, y: item.y, distSq, dietCategory: 'plant' });
                    }
                }
            }
        }

        if (candidates.length === 0) return false;

        // Sort candidates by closest distance
        candidates.sort((a, b) => a.distSq - b.distSq);
        const chosen = candidates[0];

        this.foodTarget = chosen;
        this.eatingTargetType = chosen.dietCategory;
        this.state = 'SEEK_FOOD';
        this.stateTimer = 45.0;
        this.currentPath = [];
        this.pathIndex = 0;

        return true;
    }

    /**
     * SEEK_FOOD State: Traverses to targeted food item, flora node, or prey.
     */
    updateSeekFood(dt, players, envContext, networkEmitter) {
        // Player threat interrupt check for aggressive mobs
        if (this.disposition === 'aggressive') {
            const player = this.findClosestTarget(players, this.ai.aggroRadius);
            if (player && this.needs.hunger.current > 15) {
                this.targetPlayerId = player.playerId || player.id;
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5;
                this.foodTarget = null;
                return;
            }
        }

        if (!this.foodTarget || !this.foodTarget.target) {
            this.state = 'IDLE';
            this.stateTimer = 1.0;
            this.foodTarget = null;
            return;
        }

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.state = 'IDLE';
            this.stateTimer = 1.0;
            this.pathSearchCooldown = 3.0;
            this.foodTarget = null;
            return;
        }

        const targetObj = this.foodTarget.target;
        const targetX = targetObj.x !== undefined ? targetObj.x : targetObj.worldX;
        const targetY = targetObj.y !== undefined ? targetObj.y : targetObj.worldY;

        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.hypot(dx, dy);

        // Prey hunting handling
        if (this.foodTarget.type === 'prey') {
            const isPreyDead = targetObj.isDead || targetObj.state === 'DEAD' || (targetObj.stats && targetObj.stats.health <= 0);
            if (isPreyDead) {
                // Prey slain! Transition to eating on the spot
                this.state = 'EATING';
                this.eatingTimer = this.eatingDuration;
                return;
            }

            // Close reach -> attack prey
            if (dist <= 48) {
                this.facingAngle = Math.atan2(dy, dx);
                if (typeof targetObj.takeDamage === 'function') {
                    const dmgRes = targetObj.takeDamage(35, 'brute', this.id, null, {}, networkEmitter);
                    if (dmgRes && dmgRes.dead) {
                        this.state = 'EATING';
                        this.eatingTimer = this.eatingDuration;
                        return;
                    }
                }
            } else {
                // Chase prey
                const speed = this.stats.moveSpeed * 1.1;
                const ratio = Math.min(1.0, (speed * dt) / dist);
                this.facingAngle = Math.atan2(dy, dx);
                this.tryMove(dx * ratio, dy * ratio);
            }
            return;
        }

        // Static Item / Node Foraging
        if (dist <= 40) {
            // Reached food node/item! Begin eating
            this.state = 'EATING';
            this.eatingTimer = this.eatingDuration;
            return;
        }

        // Move towards food
        const speed = this.stats.moveSpeed;
        const ratio = Math.min(1.0, (speed * dt) / dist);
        this.facingAngle = Math.atan2(dy, dx);
        this.tryMove(dx * ratio, dy * ratio);
    }

    /**
     * HUNT_WANDER State: Apex predator actively prowls toward herbivore meadows / plant zones,
     * continuously sniffing for prey scent. Switches immediately to SEEK_FOOD upon detecting prey.
     */
    updateHuntWander(dt, players, envContext, networkEmitter) {
        // 1. Player threat interrupt check for aggressive mobs (unless starving)
        if (this.disposition === 'aggressive') {
            const player = this.findClosestTarget(players, this.ai.aggroRadius);
            if (player && this.needs.hunger.current > 15) {
                this.targetPlayerId = player.playerId || player.id;
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5;
                this.foodTarget = null;
                this.huntTargetPos = null;
                return;
            }
        }

        // 2. Continuous Scent Scan for Prey / Food
        if (this.startSeekingFood(envContext)) {
            // Scent acquired! Locked onto prey, transitioned to SEEK_FOOD
            this.huntTargetPos = null;
            return;
        }

        // 3. If hunger is somehow satisfied or timer expires, revert to IDLE
        this.stateTimer -= dt;
        if (!this.needs.isHungry() || this.stateTimer <= 0) {
            this.state = 'IDLE';
            this.stateTimer = 2.0;
            this.huntTargetPos = null;
            this.pathSearchCooldown = 3.0;
            return;
        }

        // 4. Determine Navigation Target towards Herbivore Meadows
        if (!this.huntTargetPos) {
            const herbTiles = (envContext && Array.isArray(envContext.herbivoreTiles) && envContext.herbivoreTiles.length > 0)
                ? envContext.herbivoreTiles
                : (envContext && Array.isArray(envContext.plantTiles) && envContext.plantTiles.length > 0 ? envContext.plantTiles : null);

            if (herbTiles && herbTiles.length > 0) {
                const chosen = herbTiles[Math.floor(Math.random() * herbTiles.length)];
                this.huntTargetPos = { x: chosen.x, y: chosen.y };
            } else {
                // Fallback: roam in an open forward vector
                const forwardAngle = this.facingAngle || (Math.random() * Math.PI * 2);
                this.huntTargetPos = {
                    x: this.x + Math.cos(forwardAngle) * 400,
                    y: this.y + Math.sin(forwardAngle) * 400
                };
            }
        }

        // 5. Move towards hunting destination
        const dx = this.huntTargetPos.x - this.x;
        const dy = this.huntTargetPos.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= 32) {
            // Reached waypoint, pick a new herbivore meadow tile on next tick
            this.huntTargetPos = null;
        } else {
            const huntSpeed = this.ai.huntWanderSpeed || (this.stats.moveSpeed * 0.75);
            const ratio = Math.min(1.0, (huntSpeed * dt) / dist);
            this.facingAngle = Math.atan2(dy, dx);
            this.tryMove(dx * ratio, dy * ratio);
        }
    }

    /**
     * EATING / GRAZING State: Stationary timer restoring hunger and consuming food source.
     */
    updateEating(dt, envContext) {
        this.eatingTimer -= dt;
        if (this.eatingTimer <= 0) {
            // Replenish hunger to 100%
            this.needs.satisfyHunger();

            if (this.foodTarget && this.foodTarget.target) {
                if (this.foodTarget.type === 'item') {
                    // Consume item from world
                    if (envContext && typeof envContext.removeItem === 'function') {
                        envContext.removeItem(this.foodTarget.target);
                    }
                } else if (this.foodTarget.type === 'node') {
                    // Consume 1 capacity from harvestable flora node
                    const targetNode = this.foodTarget.target;
                    if (typeof targetNode.capacity === 'number') {
                        targetNode.capacity = Math.max(0, targetNode.capacity - 1);
                        if (targetNode.capacity <= 0 && targetNode.isDynamicFlora) {
                            // Depleted dynamic flora: trigger relocation respawn
                            const EcologyManager = require('./EcologyManager');
                            EcologyManager.handleFloraDepleted(targetNode.uid || targetNode.id);
                        }
                    }
                }
            }

            this.foodTarget = null;
            this.state = 'IDLE';
            this.stateTimer = 2.0 + Math.random() * 2.0;
        }
    }

    /**
     * Initiates A* pathfinding towards the nearest water source tile.
     */
    startSeekingWater(waterRegistryOverride = null, collisionOverride = null) {
        const registry = waterRegistryOverride || this.waterRegistry;
        if (!registry) return false;

        const collisionMap = collisionOverride || ((tx, ty) => {
            const px = tx * 32 + 16;
            const py = ty * 32 + 16;
            return this.isBlockedAt(px, py);
        });

        const searchResult = registry.findNearestWaterSource(this.x, this.y, collisionMap, 10000);
        if (!searchResult) return false;

        this.waterTarget = searchResult;
        const destination = searchResult.standingSpot || searchResult.waterTile;

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
            this.stateTimer = 60.0; // Timeout (60s)
            return true;
        }

        return false;
    }

    /**
     * SEEK_WATER state: traverses waypoints to nearest water source.
     */
    updateSeekWater(dt, players, waterRegistry = null, collisionMap = null) {
        // Player aggro check (unless critically parched)
        if (!this.needs.isParched() && this.disposition === 'aggressive') {
            const target = this.findClosestTarget(players, this.ai.aggroRadius * 0.85);
            if (target) {
                this.targetPlayerId = target.playerId || target.id;
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5 + Math.random() * 0.5;
                this.currentPath = [];
                this.waterTarget = null;
                return;
            }
        }

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
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
            const wdist = Math.hypot(wdx, wdy);

            if (wdist <= 10) {
                this.pathIndex++;
                if (this.pathIndex >= this.currentPath.length) {
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
                const moveSpeed = this.stats.moveSpeed * (this.needs.isParched() ? 1.2 : 1.0);
                this.facingAngle = Math.atan2(wdy, wdx);
                const step = moveSpeed * dt;
                const ratio = Math.min(1.0, step / wdist);
                this.tryMove(wdx * ratio, wdy * ratio);
            }
        } else {
            this.state = 'IDLE';
            this.stateTimer = 1.0;
        }
    }

    /**
     * DRINKING state: stationary drinking timer refilling hydration.
     */
    updateDrinking(dt) {
        this.drinkingTimer -= dt;
        const fullyQuenched = this.needs.drink(dt);

        if (this.drinkingTimer <= 0 || fullyQuenched) {
            this.needs.satisfyHydration();
            this.state = 'IDLE';
            this.stateTimer = 2.0 + Math.random() * 2.0;
            this.waterTarget = null;
            this.currentPath = [];
        }
    }

    /**
     * ORBIT_SPACING state: navigates relative to target, handles territorial leashing, and evaluates attack readiness.
     */
    updateOrbitSpacing(dt, players, networkEmitter, envContext = null) {
        const target = this.getTargetPlayer(players);
        if (!target || target.isDead) {
            this.targetPlayerId = null;
            this.state = this.disposition === 'territorial' ? 'RETURN_TO_TERRITORY' : 'IDLE';
            this.stateTimer = 1.0;
            return;
        }

        const tx = target.position ? target.position.x : target.x;
        const ty = target.position ? target.position.y : target.y;
        const dist = Math.hypot(tx - this.x, ty - this.y);

        // Territorial Leash Check: if player flees beyond leashRadius or mob is too far from territory origin
        if (this.disposition === 'territorial') {
            const distFromOrigin = Math.hypot(this.x - this.tetherOrigin.x, this.y - this.tetherOrigin.y);
            if (dist > this.leashRadius || distFromOrigin > this.leashRadius) {
                this.targetPlayerId = null;
                this.state = 'RETURN_TO_TERRITORY';
                this.stateTimer = 1.0;
                return;
            }
        } else {
            // General De-aggro check for aggressive / neutral
            if (dist > (this.ai.deaggroRadius || 700)) {
                this.targetPlayerId = null;
                this.state = 'IDLE';
                this.stateTimer = 1.5;
                return;
            }
        }

        // Face the target
        this.facingAngle = Math.atan2(ty - this.y, tx - this.x);

        // Attempt attack selection
        const attack = this.selectReadyAttack(dist);
        if (attack) {
            this.startAttack(attack, target, networkEmitter);
            return;
        }

        // Positioning & Orbit Movement
        const speed = this.stats.moveSpeed * (this.isEnraged ? (this.ai.enrageSpeedBuff || 1.3) : 1.0);
        const preferredDist = this.ai.preferredCombatDistance || 70;

        if (dist > preferredDist + 20) {
            // Move directly towards target
            const moveStep = speed * dt;
            this.tryMove(Math.cos(this.facingAngle) * moveStep, Math.sin(this.facingAngle) * moveStep);
        } else if (dist < preferredDist - 20) {
            // Back away slightly
            const backAngle = this.facingAngle + Math.PI;
            const moveStep = speed * (this.ai.orbitSpeedMultiplier || 0.6) * dt;
            this.tryMove(Math.cos(backAngle) * moveStep, Math.sin(backAngle) * moveStep);
        } else {
            // Orbit around target
            this.orbitAngle += this.orbitDirection * (speed / preferredDist) * dt * (this.ai.orbitSpeedMultiplier || 0.6);
            const targetOrbitX = tx + Math.cos(this.orbitAngle) * preferredDist;
            const targetOrbitY = ty + Math.sin(this.orbitAngle) * preferredDist;
            const odx = targetOrbitX - this.x;
            const ody = targetOrbitY - this.y;
            const odist = Math.hypot(odx, ody);
            if (odist > 2) {
                const step = Math.min(odist, speed * dt);
                this.tryMove((odx / odist) * step, (ody / odist) * step);
            }
        }
    }

    /**
     * Selects an available attack based on cooldowns, range, weights, and limb health.
     * @param {number} distToTarget - Distance to current target
     * @returns {Object|null}
     */
    selectReadyAttack(distToTarget) {
        const now = Date.now();
        const validAttacks = [];
        let totalWeight = 0;

        for (const atk of this.attacks) {
            // Cooldown check
            if (now - atk.lastUsedTime < (atk.cooldownMs || 3000)) {
                continue;
            }

            // Limb fracture check: if any required limb is fractured, disable this attack
            let limbDisabled = false;
            if (this.anatomy && this.anatomy.limbs) {
                for (const [lKey, lData] of Object.entries(this.anatomy.limbs)) {
                    if (lData.disableAttackOnFracture === atk.id) {
                        if (lData.fractured || lData.hp <= 0) {
                            limbDisabled = true;
                            break;
                        }
                    }
                }
            }
            if (limbDisabled) continue;

            // Distance constraints
            const minD = atk.minDistance || 0;
            const maxD = atk.range || atk.length || 100;
            if (distToTarget < minD || distToTarget > maxD + 40) {
                continue;
            }

            validAttacks.push(atk);
            totalWeight += (atk.weight || 50);
        }

        if (validAttacks.length === 0) return null;

        // Weighted random selection
        let roll = Math.random() * totalWeight;
        for (const atk of validAttacks) {
            const w = atk.weight || 50;
            if (roll <= w) return atk;
            roll -= w;
        }

        return validAttacks[0];
    }

    /**
     * Initiates 4-phase attack sequence starting with WINDUP.
     */
    startAttack(attack, target, networkEmitter) {
        this.currentAttack = attack;
        this.state = 'WINDUP';

        // Calculate phase durations with Enrage windup buff
        const windupMult = this.isEnraged ? (this.ai.enrageWindupMultiplier || 0.75) : 1.0;
        const windupMs = Math.round((attack.windupMs || 1000) * windupMult);
        const flashMs = attack.flashMs || 150;
        const activeMs = attack.activeMs || 300;
        const recoveryMs = attack.recoveryMs || 600;

        this.windupTotalTime = windupMs / 1000;
        this.windupElapsedTime = 0;
        this.stateTimer = this.windupTotalTime;
        this.targetLimbGlowDamage = 0;

        this.attackOrigin = { x: this.x, y: this.y };
        const tx = target.position ? target.position.x : target.x;
        const ty = target.position ? target.position.y : target.y;
        this.attackAngle = Math.atan2(ty - this.y, tx - this.x);
        this.facingAngle = this.attackAngle;
        this.targetReticlePos = { x: tx, y: ty };

        // Broadcast enemyTelegraphStart
        const telegraphPayload = {
            mobId: this.id,
            attackId: attack.id,
            type: attack.type,
            origin: { x: this.attackOrigin.x, y: this.attackOrigin.y },
            angle: this.attackAngle,
            targetPos: { x: this.targetReticlePos.x, y: this.targetReticlePos.y },
            params: {
                range: attack.range,
                radius: attack.radius || attack.range,
                innerRadius: attack.innerRadius || 0,
                arcAngle: attack.arcAngle,
                length: attack.length,
                width: attack.width
            },
            durations: {
                windupMs,
                flashMs,
                activeMs,
                recoveryMs
            },
            limbGlow: attack.limbGlow || null
        };

        if (networkEmitter && typeof networkEmitter.emitTelegraphStart === 'function') {
            networkEmitter.emitTelegraphStart(telegraphPayload);
        }
    }

    /**
     * WINDUP Phase: Decal fills 0% -> 100%. Tracks orientation for first 60%.
     */
    updateWindup(dt, players, networkEmitter) {
        this.windupElapsedTime += dt;
        this.stateTimer -= dt;

        const target = this.getTargetPlayer(players);
        // Track target for first 60% of windup
        const progressRatio = this.windupTotalTime > 0 ? (this.windupElapsedTime / this.windupTotalTime) : 1;
        if (progressRatio <= 0.60 && target && target.position) {
            this.attackAngle = Math.atan2(target.position.y - this.y, target.position.x - this.x);
            this.facingAngle = this.attackAngle;
            this.targetReticlePos.x = target.position.x;
            this.targetReticlePos.y = target.position.y;
        }

        if (this.stateTimer <= 0) {
            // Transition to FLASH phase
            this.state = 'FLASH';
            this.stateTimer = (this.currentAttack.flashMs || 150) / 1000;
        }
    }

    /**
     * FLASH Phase: Telegraph locks 100% position/rotation and flashes bright warning.
     */
    updateFlash(dt, players, networkEmitter) {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            // Transition to ACTIVE phase
            this.state = 'ACTIVE';
            this.stateTimer = (this.currentAttack.activeMs || 300) / 1000;
            this.executeAttackHitboxes(players, networkEmitter);
        }
    }

    /**
     * Evaluates authoritative geometric hitboxes against players during ACTIVE phase.
     */
    executeAttackHitboxes(players, networkEmitter) {
        const attack = this.currentAttack;
        if (!attack) return;

        const hitPlayerIds = [];
        const playerRadius = 24; // Standard player bounding radius

        for (const [pId, player] of Object.entries(players)) {
            if (!player || player.isDead || !player.position) continue;
            const px = player.position.x;
            const py = player.position.y;

            let isHit = false;

            switch (attack.type) {
                case 'linear_runway':
                    isHit = AttackShapeMath.checkOBBOverlap(
                        this.attackOrigin.x,
                        this.attackOrigin.y,
                        this.attackAngle,
                        attack.length || 200,
                        attack.width || 48,
                        px,
                        py,
                        playerRadius
                    );
                    break;

                case 'conical':
                    isHit = AttackShapeMath.checkConeOverlap(
                        this.attackOrigin.x,
                        this.attackOrigin.y,
                        this.attackAngle,
                        attack.arcAngle || 90,
                        attack.range || 75,
                        px,
                        py,
                        playerRadius
                    );
                    break;

                case 'radial':
                    isHit = AttackShapeMath.checkDonutOverlap(
                        this.attackOrigin.x,
                        this.attackOrigin.y,
                        attack.innerRadius || 0,
                        attack.radius || attack.range || 100,
                        px,
                        py,
                        playerRadius
                    );
                    break;

                case 'targeted_mortar':
                    isHit = AttackShapeMath.checkMortarOverlap(
                        this.targetReticlePos.x,
                        this.targetReticlePos.y,
                        attack.radius || 80,
                        px,
                        py,
                        playerRadius
                    );
                    break;

                case 'directional_bullet':
                    isHit = AttackShapeMath.checkConeOverlap(
                        this.attackOrigin.x,
                        this.attackOrigin.y,
                        this.attackAngle,
                        attack.spreadAngle || 30,
                        attack.range || 250,
                        px,
                        py,
                        playerRadius
                    );
                    break;
            }

            if (isHit) {
                hitPlayerIds.push(pId);
                // Apply damage to victim player
                if (networkEmitter && typeof networkEmitter.applyDamageFunc === 'function') {
                    networkEmitter.applyDamageFunc(
                        pId,
                        attack.damage || 20,
                        this.id,
                        attack.damageType || 'brute',
                        null,
                        { bleedMult: attack.bleedMult || 1.0, fractureMult: attack.fractureMult || 1.0 }
                    );
                }
            }
        }

        // Broadcast enemyAttackExecute
        if (networkEmitter && typeof networkEmitter.emitAttackExecute === 'function') {
            networkEmitter.emitAttackExecute({
                mobId: this.id,
                attackId: attack.id,
                origin: { x: this.attackOrigin.x, y: this.attackOrigin.y },
                angle: this.attackAngle,
                hitPlayerIds
            });
        }
    }

    /**
     * ACTIVE Phase: Handles physical motion (e.g. forward dash for runways) and wall collision.
     */
    updateActive(dt, players, networkEmitter, envContext = null) {
        this.stateTimer -= dt;

        // If linear runway charge, physically move forward along attackAngle
        if (this.currentAttack && this.currentAttack.type === 'linear_runway') {
            const activeTotalTime = (this.currentAttack.activeMs || 300) / 1000;
            const chargeSpeed = (this.currentAttack.length || 260) / activeTotalTime;
            const stepDist = chargeSpeed * dt;
            const moveX = Math.cos(this.attackAngle) * stepDist;
            const moveY = Math.sin(this.attackAngle) * stepDist;

            const nextX = this.x + moveX;
            const nextY = this.y + moveY;

            // Check for wall collision
            if (this.isBlockedAt(nextX, nextY)) {
                // Self-stun on wall impact
                const stunMs = this.currentAttack.wallStunDurationMs || 1500;
                log.info(`[EnemyEntity] ${this.name} (${this.id}) crashed into a wall! Self-stunned for ${stunMs}ms.`);
                this.state = 'RECOVERY';
                this.stateTimer = stunMs / 1000;
                this.currentAttack.lastUsedTime = Date.now();
                return;
            } else {
                this.x = nextX;
                this.y = nextY;
            }
        }

        if (this.stateTimer <= 0) {
            // Transition to RECOVERY phase
            this.state = 'RECOVERY';
            this.stateTimer = (this.currentAttack ? this.currentAttack.recoveryMs : 600) / 1000;
            if (this.currentAttack) {
                this.currentAttack.lastUsedTime = Date.now();
            }
        }
    }

    /**
     * RECOVERY Phase: Enemy is immobilized in a fatigue state (vulnerable counter-attack window).
     */
    updateRecovery(dt, players) {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            this.currentAttack = null;
            const target = this.getTargetPlayer(players);
            if (target && !target.isDead) {
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5;
            } else {
                this.state = this.disposition === 'territorial' ? 'RETURN_TO_TERRITORY' : 'IDLE';
                this.stateTimer = 1.0;
            }
        }
    }

    /**
     * Processes damage dealt to this enemy by an attack.
     * Evaluates limb HP, fractures, bleed triggers, windup weak-point interrupts, and disposition threat tables.
     * 
     * @param {number} amount - Incoming raw damage
     * @param {string} [damageType='brute'] - Damage classification
     * @param {string} [attackerId=null] - Socket ID of attacking player/mob
     * @param {string} [targetLimb=null] - Anatomical limb targeted (e.g. 'snout', 'leftFrontLeg')
     * @param {Object} [options={}] - Modifiers ({ bleedMult, fractureMult })
     * @param {Object} [networkEmitter=null] - Network emitter hooks
     * @returns {{ success: boolean, newHealth: number, dead: boolean, fractured: boolean, interrupted: boolean }}
     */
    takeDamage(amount, damageType = 'brute', attackerId = null, targetLimb = null, options = {}, networkEmitter = null) {
        if (this.state === 'DEAD') return { success: false, dead: true };

        this.peaceTimer = 0; // Reset peace timer on taking damage

        // Armor mitigation
        const armor = this.stats.baseArmor || 0;
        const effectiveDamage = Math.max(1, Math.round(amount - (armor * 0.5)));

        // Reduce total health
        this.stats.health = Math.max(0, this.stats.health - effectiveDamage);

        // Update threat table
        if (attackerId) {
            this.threatTable[attackerId] = (this.threatTable[attackerId] || 0) + effectiveDamage;
        }

        // Resolve anatomical limb with Target Doll mapping fallback
        let resolvedLimb = targetLimb;
        if (!resolvedLimb || !this.anatomy.limbs[resolvedLimb]) {
            const ZONE_MAP = {
                mouth: 'snout',
                eyes: 'head',
                leftEar: 'head',
                rightEar: 'head',
                leftArm: 'leftFrontLeg',
                rightArm: 'rightFrontLeg',
                leftHand: 'leftFrontLeg',
                rightHand: 'rightFrontLeg',
                leftLeg: 'leftHindLeg',
                rightLeg: 'rightHindLeg',
                leftFoot: 'leftHindLeg',
                rightFoot: 'rightHindLeg',
                groin: 'torso'
            };

            const mapped = targetLimb ? ZONE_MAP[targetLimb] : null;
            if (mapped && this.anatomy.limbs[mapped]) {
                resolvedLimb = mapped;
            } else if (this.anatomy.limbs.torso) {
                resolvedLimb = 'torso';
            } else {
                const availableLimbs = Object.keys(this.anatomy.limbs);
                resolvedLimb = availableLimbs.length > 0 ? availableLimbs[0] : 'torso';
            }
        }

        const limb = this.anatomy.limbs[resolvedLimb];
        let limbFractured = false;

        if (limb) {
            limb.hp = Math.max(0, limb.hp - effectiveDamage);
            const maxHp = limb.maxHp || 100;
            const fractureMult = options.fractureMult !== undefined ? options.fractureMult : 1.0;

            // Fracture check: guaranteed at <= 20% HP or threshold roll
            if (!limb.fractured && fractureMult > 0) {
                const deficitRatio = (maxHp - limb.hp) / maxHp;
                if (limb.hp <= maxHp * 0.2 || (Math.random() < deficitRatio * 0.8 * fractureMult)) {
                    limb.fractured = true;
                    limbFractured = true;
                    log.info(`[EnemyEntity] ${this.name}'s ${resolvedLimb} has FRACTURED!`);
                }
            }

            // Bleed check
            if (limb.hp <= maxHp * 0.4) {
                limb.bleeding = Math.min(5.0, (limb.bleeding || 0) + 0.5);
            }
        }

        let interrupted = false;

        // Weak-Point Attack Interrupt during WINDUP
        if (this.state === 'WINDUP' && this.currentAttack) {
            const glowingLimb = this.currentAttack.limbGlow;
            if (glowingLimb && resolvedLimb === glowingLimb) {
                this.targetLimbGlowDamage += effectiveDamage;
                if (this.targetLimbGlowDamage >= 25 || limbFractured) {
                    interrupted = true;
                    log.info(`[EnemyEntity] STAGGER INTERRUPT! ${this.name}'s ${this.currentAttack.name} was canceled by targeting glowing ${glowingLimb}!`);

                    // Transition to 1.5s Stagger / Recovery state
                    this.state = 'RECOVERY';
                    this.stateTimer = 1.5; // 1500ms
                    if (this.currentAttack) {
                        this.currentAttack.lastUsedTime = Date.now();
                    }

                    if (networkEmitter && typeof networkEmitter.emitTelegraphCancel === 'function') {
                        networkEmitter.emitTelegraphCancel({
                            mobId: this.id,
                            reason: 'stagger_interrupt',
                            limb: glowingLimb
                        });
                    }
                }
            }
        }

        // Disposition Reactivity on Damage
        const isDead = this.stats.health <= 0;
        if (!isDead && !interrupted && this.state !== 'RECOVERY' && this.state !== 'WINDUP' && this.state !== 'FLASH' && this.state !== 'ACTIVE') {
            if (this.disposition === 'neutral') {
                this.targetPlayerId = attackerId;
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5;

                // Social Pack Defense: alert nearby neutral mobs within 300px
                if (networkEmitter && typeof networkEmitter.alertNearbyAllies === 'function') {
                    networkEmitter.alertNearbyAllies(this, attackerId, 300);
                }
            } else if (this.disposition === 'runner') {
                this.state = 'FLEEING';
                this.fleeTimer = 3.0;
            } else if (this.disposition === 'territorial') {
                this.targetPlayerId = attackerId;
                this.state = 'ORBIT_SPACING';
                this.stateTimer = 0.5;
            }
        }

        // Death check
        if (isDead) {
            this.state = 'DEAD';
            log.info(`[EnemyEntity] ${this.name} (${this.id}) has been slain by ${attackerId}!`);
            if (networkEmitter && typeof networkEmitter.emitDied === 'function') {
                networkEmitter.emitDied({
                    mobId: this.id,
                    x: this.x,
                    y: this.y,
                    harvestLoot: this.harvestLoot
                });
            }
        }

        return {
            success: true,
            newHealth: this.stats.health,
            dead: isDead,
            limb: resolvedLimb,
            fractured: limbFractured,
            interrupted
        };
    }

    /**
     * Sliding physics movement evaluator.
     */
    tryMove(dx, dy) {
        const nextX = this.x + dx;
        const nextY = this.y + dy;

        const canMoveX = !this.isBlockedAt(nextX, this.y);
        const canMoveY = !this.isBlockedAt(this.x, nextY);
        const canMoveDiag = canMoveX && canMoveY && !this.isBlockedAt(nextX, nextY);

        if (canMoveDiag) {
            this.x = nextX;
            this.y = nextY;
        } else if (canMoveX) {
            this.x = nextX;
        } else if (canMoveY) {
            this.y = nextY;
        }
    }

    /**
     * Locates the closest active, living player within a given radius.
     * Prioritizes weakened or bleeding targets.
     */
    findClosestTarget(players, radius) {
        let closest = null;
        const maxRadiusSq = (radius || 350) * (radius || 350);
        let bestDistanceSq = Infinity;
        let lowestHpRatio = 1.01;

        for (const player of Object.values(players || {})) {
            if (!player || player.isDead || !player.position) continue;
            const dx = player.position.x - this.x;
            const dy = player.position.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= maxRadiusSq) {
                const pHealth = player.stats ? (player.stats.health / (player.stats.maxHealth || 100)) : 1.0;
                if (pHealth < lowestHpRatio - 0.05) {
                    lowestHpRatio = pHealth;
                    bestDistanceSq = distSq;
                    closest = player;
                } else if (Math.abs(pHealth - lowestHpRatio) <= 0.05) {
                    if (distSq < bestDistanceSq) {
                        bestDistanceSq = distSq;
                        closest = player;
                    }
                }
            }
        }
        return closest;
    }

    /**
     * Gets the current aggroed player reference from the players dictionary.
     */
    getTargetPlayer(players) {
        if (!this.targetPlayerId || !players) return null;
        return players[this.targetPlayerId] || null;
    }

    /**
     * Generates a lightweight DTO snapshot for network sync.
     * @returns {Object}
     */
    getData() {
        return {
            id: this.id,
            defId: this.defId,
            enemyName: (this.def && (this.def.enemyName || this.def.spriteFolder)) || this.defId,
            name: this.name,
            texture: (this.def && this.def.texture) || 'idle_test',
            x: Math.round(this.x * 10) / 10,
            y: Math.round(this.y * 10) / 10,
            facingAngle: Math.round(this.facingAngle * 100) / 100,
            state: this.state,
            disposition: this.disposition,
            diet: this.diet,
            eatingTargetType: this.eatingTargetType,
            health: this.stats.health,
            maxHealth: this.stats.maxHealth,
            isEnraged: this.isEnraged,
            limbGlow: (this.state === 'WINDUP' || this.state === 'FLASH') && this.currentAttack ? this.currentAttack.limbGlow : null,
            fracturedLimbs: Object.keys(this.anatomy.limbs).filter(l => this.anatomy.limbs[l].fractured),
            warningRadius: this.warningRadius,
            breachRadius: this.breachRadius,
            leashRadius: this.leashRadius,
            fearRadius: this.fearRadius,
            foodSearchRadius: this.foodSearchRadius,
            description: this.description,
            hydration: Math.round(this.needs.hydration.current),
            maxHydration: this.needs.hydration.max,
            thirstThreshold: this.needs.hydration.desireThreshold,
            hydrationDecayRate: this.needs.hydration.decayRate,
            hunger: Math.round(this.needs.hunger.current),
            maxHunger: this.needs.hunger.max,
            hungerThreshold: this.needs.hunger.desireThreshold,
            hungerDecayRate: this.needs.hunger.decayRate,
            enableHunger: this.needs.enableHunger
        };
    }
}

module.exports = EnemyEntity;
