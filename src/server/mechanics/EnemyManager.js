/**
 * @fileoverview EnemyManager.js - Master Server-Side NPC Enemy & Combat Orchestrator
 * @subsystem Combat & Telegraph Engine
 * @description
 * Coordinates active enemy instances, handles 30Hz game loop ticks with proximity culling,
 * broadcasts Area-Of-Interest (AOI) network packets (spawns, state updates, telegraph decals, deaths),
 * and handles player-to-enemy attack routing.
 */

const log = require('../../logger');
const EnemyEntity = require('./EnemyEntity');
const enemyDefinitions = require('../../data/enemyDefinitions');
const WaterSourceRegistry = require('./WaterSourceRegistry');
const EcologyManager = require('./EcologyManager');

class EnemyManager {
    constructor() {
        /** @type {Object.<string, EnemyEntity>} */
        this.activeEnemies = {};
        this.io = null;
        this.players = {};
        this.collisionMap = null;
        this.isTileSolid = () => false;
        this.addCorpse = null;
        this.worldItems = [];
        this.addItemToGrid = null;
        this.removeItemFromGrid = null;
        this.activeAnimals = {};
        this.activeResourceNodes = {};
        this.messageSystem = null;
        this.applyDamageFunc = null;
    }

    /**
     * Initializes the EnemyManager singleton with server dependencies.
     */
    init(config = {}) {
        this.io = config.io || null;
        this.players = config.players || {};
        this.collisionMap = config.collisionMap || null;
        this.isTileSolid = config.isTileSolid || (() => false);
        this.addCorpse = config.addCorpse || null;
        this.worldItems = config.worldItems || [];
        this.addItemToGrid = config.addItemToGrid || null;
        this.removeItemFromGrid = config.removeItemFromGrid || null;
        this.activeAnimals = config.activeAnimals || {};
        this.activeResourceNodes = config.activeResourceNodes || {};
        this.messageSystem = config.messageSystem || null;

        // Lazy-load damage dispatcher
        if (config.applyDamageFunc) {
            this.applyDamageFunc = config.applyDamageFunc;
        } else {
            const { applyDamage } = require('./damage');
            const User = require('../../model/User');
            this.applyDamageFunc = (targetId, amount, sourceId, damageType, targetPart, options) => {
                applyDamage(this.players, User, targetId, amount, sourceId, damageType, this.addCorpse, this.io, targetPart, this.messageSystem, options);
            };
        }

        log.info('[EnemyManager] Initialized modular enemy combat and ecology manager.');
    }

    /**
     * Alerts nearby neutral allies of the same species within a radius to assist in combat.
     * @param {EnemyEntity} callerMob
     * @param {string} targetPlayerId
     * @param {number} [radius=300]
     */
    alertNearbyAllies(callerMob, targetPlayerId, radius = 300) {
        if (!callerMob || !targetPlayerId) return;
        const radiusSq = radius * radius;
        for (const [id, enemy] of Object.entries(this.activeEnemies)) {
            if (enemy.id === callerMob.id || enemy.state === 'DEAD') continue;
            if (enemy.defId === callerMob.defId && enemy.disposition === 'neutral' && enemy.state === 'IDLE') {
                const distSq = (enemy.x - callerMob.x) ** 2 + (enemy.y - callerMob.y) ** 2;
                if (distSq <= radiusSq) {
                    enemy.targetPlayerId = targetPlayerId;
                    enemy.state = 'ORBIT_SPACING';
                    enemy.stateTimer = 0.5;
                    log.info(`[EnemyManager] ${enemy.name} (${enemy.id}) joined social pack defense to assist ${callerMob.name} (${callerMob.id})!`);
                }
            }
        }
    }

    /**
     * Spawns an authoritative enemy mob instance.
     * @param {string} id - Unique identifier
     * @param {string} defId - Definition key from enemyDefinitions.js
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Function} [collisionCb] - Optional collision evaluator override
     * @returns {EnemyEntity}
     */
    spawnEnemy(id, defId, x, y, collisionCb = null) {
        const checker = collisionCb || this.isTileSolid;
        const enemy = new EnemyEntity(id, defId, x, y, checker);
        this.activeEnemies[id] = enemy;

        log.info(`[EnemyManager] Spawned ${enemy.name} (${id}) at (${x}, ${y})`);

        // Broadcast spawn packet to clients
        if (this.io) {
            this.io.emit('enemySpawn', enemy.getData());
        }

        return enemy;
    }

    /**
     * Retrieves an active enemy instance by ID (case-insensitive fallback).
     * @param {string} id
     * @returns {EnemyEntity|null}
     */
    getEnemy(id) {
        if (!id) return null;
        if (this.activeEnemies[id]) return this.activeEnemies[id];
        const lower = id.toLowerCase();
        for (const [key, enemy] of Object.entries(this.activeEnemies)) {
            if (key.toLowerCase() === lower || enemy.id.toLowerCase() === lower) {
                return enemy;
            }
        }
        return null;
    }

    /**
     * Removes an enemy from active tracking.
     * @param {string} id
     */
    removeEnemy(id) {
        if (this.activeEnemies[id]) {
            delete this.activeEnemies[id];
        }
    }

    /**
     * Authoritative tick loop execution (invoked from server-loop.js at 30Hz).
     * @param {number} delta - Frame delta in seconds (e.g. 0.033)
     */
    update(delta) {
        const enemyIds = Object.keys(this.activeEnemies);
        if (enemyIds.length === 0) return;

        const activePlayerList = Object.values(this.players);
        const enemyUpdates = {};
        const deadMobIds = [];

        // Network hooks emitter passed into entity updates
        const networkEmitter = {
            emitTelegraphStart: (payload) => {
                if (this.io) {
                    this.io.emit('enemyTelegraphStart', payload);
                }
            },
            emitTelegraphCancel: (payload) => {
                if (this.io) {
                    this.io.emit('enemyTelegraphCancel', payload);
                }
            },
            emitAttackExecute: (payload) => {
                if (this.io) {
                    this.io.emit('enemyAttackExecute', payload);
                }
            },
            emitWarning: (payload) => {
                if (this.io) {
                    this.io.emit('enemyWarning', payload);
                }
            },
            alertNearbyAllies: (callerMob, targetPlayerId, radius) => {
                this.alertNearbyAllies(callerMob, targetPlayerId, radius);
            },
            emitDied: (payload) => {
                deadMobIds.push(payload.mobId);
                this.handleEnemyDeath(payload);
            },
            applyDamageFunc: this.applyDamageFunc
        };

        // Environmental context for foraging and predation
        const envContext = {
            worldItems: this.worldItems,
            activeResourceNodes: this.activeResourceNodes,
            activeAnimals: this.activeAnimals,
            activeEnemies: this.activeEnemies,
            herbivoreTiles: EcologyManager.herbivoreTiles || [],
            plantTiles: EcologyManager.plantTiles || [],
            removeItem: (item) => {
                if (Array.isArray(this.worldItems)) {
                    const idx = this.worldItems.indexOf(item);
                    if (idx > -1) this.worldItems.splice(idx, 1);
                }
                if (typeof this.removeItemFromGrid === 'function') {
                    this.removeItemFromGrid(item);
                }
                if (this.io && item && item.uid) {
                    this.io.emit('itemRemoved', { uid: item.uid, id: item.uid });
                }
            }
        };

        for (let i = 0; i < enemyIds.length; i++) {
            const id = enemyIds[i];
            const enemy = this.activeEnemies[id];
            if (!enemy) continue;

            // Proximity culling: skip AI update if no players are within 2000px
            if (activePlayerList.length > 0) {
                const hasNearby = activePlayerList.some(p => p.position && Math.hypot(p.position.x - enemy.x, p.position.y - enemy.y) <= 2000);
                if (!hasNearby && enemy.state === 'IDLE') {
                    continue;
                }
            }

            const oldX = enemy.x;
            const oldY = enemy.y;
            const oldState = enemy.state;
            const oldHealth = enemy.stats.health;
            const oldHydration = enemy.needs ? enemy.needs.hydration.current : 100;
            const oldHunger = enemy.needs ? enemy.needs.hunger.current : 100;

            enemy.update(delta, this.players, networkEmitter, WaterSourceRegistry, this.collisionMap, envContext);

            if (enemy.state === 'DEAD') {
                deadMobIds.push(enemy.id);
            } else {
                // Record delta if state, position, health, hydration, or hunger changed, or if newly spawned
                const isNew = !!enemy.isNewlySpawned;
                if (isNew) enemy.isNewlySpawned = false;

                const hydrationChanged = enemy.needs && Math.abs(enemy.needs.hydration.current - oldHydration) >= 1.0;
                const hungerChanged = enemy.needs && Math.abs(enemy.needs.hunger.current - oldHunger) >= 1.0;
                if (isNew || enemy.x !== oldX || enemy.y !== oldY || enemy.state !== oldState || enemy.stats.health !== oldHealth || hydrationChanged || hungerChanged) {
                    enemyUpdates[enemy.id] = enemy.getData();
                }
            }
        }

        // Clean up dead mobs
        for (const deadId of deadMobIds) {
            delete this.activeEnemies[deadId];
        }

        // Broadcast throttled AOI enemyUpdates to nearby players
        if (Object.keys(enemyUpdates).length > 0 && this.io) {
            const connectedSocketIds = Object.keys(this.players);

            connectedSocketIds.forEach(socketId => {
                const player = this.players[socketId];
                if (!player || !player.position) return;

                const relevantUpdates = {};
                let hasRelevant = false;

                for (const [mId, mData] of Object.entries(enemyUpdates)) {
                    if (mData.x !== undefined && mData.y !== undefined) {
                        const dist = Math.hypot(player.position.x - mData.x, player.position.y - mData.y);
                        if (dist < 2500) {
                            relevantUpdates[mId] = mData;
                            hasRelevant = true;
                        }
                    }
                }

                if (hasRelevant) {
                    this.io.to(socketId).emit('enemyUpdates', relevantUpdates);
                }
            });
        }
    }

    /**
     * Handles enemy death, corpse conversion, and loot drop generation.
     */
    handleEnemyDeath(payload) {
        const { mobId, x, y, harvestLoot } = payload;

        // Broadcast enemyDied event
        if (this.io) {
            this.io.emit('enemyDied', { mobId, x, y });
        }

        // Spawn loot items on the ground
        if (Array.isArray(harvestLoot) && this.worldItems && this.addItemToGrid) {
            harvestLoot.forEach((lootRule, idx) => {
                const roll = Math.random();
                if (roll <= (lootRule.chance || 1.0)) {
                    const minCount = Array.isArray(lootRule.count) ? lootRule.count[0] : (lootRule.count || 1);
                    const maxCount = Array.isArray(lootRule.count) ? lootRule.count[1] : (lootRule.count || 1);
                    const count = Math.floor(minCount + Math.random() * (maxCount - minCount + 1));

                    for (let c = 0; c < count; c++) {
                        const offsetX = (Math.random() - 0.5) * 32;
                        const offsetY = (Math.random() - 0.5) * 32;
                        const lootItem = {
                            uid: `loot_${mobId}_${lootRule.itemId}_${Date.now()}_${idx}_${c}`,
                            itemId: lootRule.itemId,
                            name: lootRule.itemId.replace(/_/g, ' '),
                            texture: lootRule.itemId,
                            icon: 'fa-box',
                            size: 1,
                            properties: {},
                            x: Math.round(x + offsetX),
                            y: Math.round(y + offsetY)
                        };

                        this.worldItems.push(lootItem);
                        this.addItemToGrid(lootItem);
                        if (this.io) {
                            this.io.emit('itemSpawned', lootItem);
                        }
                    }
                }
            });
        }
    }

    /**
     * Handles a player attacking an enemy mob via playerPerformAction.
     * 
     * @param {Object} socket - Player's Socket.io instance
     * @param {Object} player - Attacking player object
     * @param {string} enemyId - Targeted mob instance ID
     * @param {string} targetZone - Targeted limb (e.g. 'snout', 'leftFrontLeg', 'torso')
     * @param {string} intent - Combat intent ('hostile', 'friendly', 'grabbing')
     * @param {Object} weaponAction - Resolved weapon action parameters
     * @returns {boolean} True if attack was successfully handled
     */
    handlePlayerAttackEnemy(socket, player, enemyId, targetZone, intent, weaponAction) {
        const enemy = this.getEnemy(enemyId);
        if (!enemy) return false;

        // Reach check (e.g. 100px melee reach)
        const dist = Math.hypot(player.position.x - enemy.x, player.position.y - enemy.y);
        if (dist > 110) {
            if (socket) {
                socket.emit('systemMessage', { message: `${enemy.name} is too far away.` });
            }
            return true;
        }

        const resolvedLimb = targetZone || 'torso';
        let rawDamage = 15;
        let damageType = 'brute';
        let bleedMult = 0.5;
        let fractureMult = 1.0;

        if (weaponAction && weaponAction.isWeapon) {
            rawDamage = weaponAction.damage || 20;
            damageType = weaponAction.damageType || 'brute';
            bleedMult = weaponAction.bleedMult || 1.0;
            fractureMult = weaponAction.fractureMult || 1.0;
        }

        const networkEmitter = {
            emitTelegraphCancel: (payload) => {
                if (this.io) this.io.emit('enemyTelegraphCancel', payload);
            },
            emitWarning: (payload) => {
                if (this.io) this.io.emit('enemyWarning', payload);
            },
            alertNearbyAllies: (callerMob, targetPlayerId, radius) => {
                this.alertNearbyAllies(callerMob, targetPlayerId, radius);
            },
            emitDied: (payload) => {
                this.handleEnemyDeath(payload);
            }
        };

        const result = enemy.takeDamage(
            rawDamage,
            damageType,
            player.playerId || socket.id,
            resolvedLimb,
            { bleedMult, fractureMult },
            networkEmitter
        );

        let msg = `${player.firstName || player.Username} struck ${enemy.name}'s ${resolvedLimb} for ${rawDamage} ${damageType}!`;
        if (result.interrupted) {
            msg += ` (STAGGER INTERRUPT! Weak point shattered!)`;
        }
        if (result.dead) {
            msg += ` ${enemy.name} has collapsed!`;
        }

        if (socket) {
            socket.emit('systemMessage', { message: msg });
        }

        return true;
    }

    /**
     * Gets complete snapshot of all active enemies for newly connected players.
     * @returns {Object.<string, Object>}
     */
    getAllEnemiesSnapshot() {
        const snapshot = {};
        for (const [id, enemy] of Object.entries(this.activeEnemies)) {
            snapshot[id] = enemy.getData();
        }
        return snapshot;
    }
}

// Singleton Export
const instance = new EnemyManager();
module.exports = instance;
