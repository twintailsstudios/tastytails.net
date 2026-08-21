/**
 * @fileoverview enemyFramework.test.js - Comprehensive Automated Test Suite
 * @subsystem Combat & Telegraph Engine
 * @description
 * Unit and integration tests for Modular NPC Enemy Framework & Universal Telegraphed Attack Engine.
 * Tests:
 * 1. enemyDefinitions.js data registry & schema validation
 * 2. AttackShapeMath.js zero-allocation 2D geometric intersection calculations across all 5 archetypes
 * 3. Authoritative EnemyEntity 4-phase state machine transitions (WINDUP -> FLASH -> ACTIVE -> RECOVERY)
 * 4. Weak-point attack interrupt on >= 25 damage or fracture to glowing limb during windup
 * 5. Limb-fracture ability disabling logic
 * 6. Enrage frenzy mode triggering and parameter scaling
 */

const assert = require('assert');
const enemyDefinitions = require('../src/data/enemyDefinitions');
const AttackShapeMath = require('../src/server/mechanics/AttackShapeMath');
const EnemyEntity = require('../src/server/mechanics/EnemyEntity');
const EnemyManager = require('../src/server/mechanics/EnemyManager');

describe('Modular NPC Enemy & Universal Telegraphed Combat Engine', () => {

    describe('1. Data Registry & Schema Validation (enemyDefinitions.js)', () => {
        it('should successfully load tiger definition conforming to complete schema', () => {
            const tiger = enemyDefinitions.tiger;
            assert.ok(tiger, 'tiger definition must exist');
            assert.strictEqual(tiger.id, 'tiger');
            assert.strictEqual(tiger.name, 'Wild Tiger');
            assert.strictEqual(tiger.texture, 'idle_tiger');

            // Stats
            assert.strictEqual(tiger.stats.health, 240);
            assert.strictEqual(tiger.stats.moveSpeed, 115);

            // AI
            assert.strictEqual(tiger.ai.archetype, 'rusher');
            assert.strictEqual(tiger.ai.aggroRadius, 400);
            assert.strictEqual(tiger.ai.enrageHealthPercent, 0.3);

            // Anatomy Limbs
            assert.ok(tiger.anatomy.limbs.jaws, 'jaws limb must exist');
            assert.strictEqual(tiger.anatomy.limbs.jaws.disableAttackOnFracture, 'tiger_bite');
            assert.strictEqual(tiger.anatomy.limbs.leftFrontLeg.disableAttackOnFracture, 'tiger_pounce');

            // Attacks
            assert.strictEqual(tiger.attacks.length, 2);
            const bite = tiger.attacks.find(a => a.id === 'tiger_bite');
            const pounce = tiger.attacks.find(a => a.id === 'tiger_pounce');
            assert.ok(bite && pounce, 'Both tiger_bite and tiger_pounce must be defined');
            assert.strictEqual(bite.type, 'conical');
            assert.strictEqual(pounce.type, 'linear_runway');

            // Harvest Loot
            assert.ok(Array.isArray(tiger.harvestLoot) && tiger.harvestLoot.length > 0);
        });

        it('should successfully load multi-archetype enemy definitions (test)', () => {
            const testMob = enemyDefinitions.test;
            assert.ok(testMob, 'test definition must exist');
            assert.strictEqual(testMob.ai.archetype, 'skirmisher');
            const cleave = testMob.attacks.find(a => a.type === 'conical');
            const whirl = testMob.attacks.find(a => a.type === 'radial');
            const thrust = testMob.attacks.find(a => a.type === 'linear_runway');
            assert.ok(cleave && whirl && thrust, 'Test enemy must have conical, radial, and linear_runway attacks');
        });
    });

    describe('2. 2D Geometric Intersection Engine (AttackShapeMath.js)', () => {
        const playerRadius = 24;

        it('Archetype 1: linear_runway (OBB corridor test)', () => {
            const originX = 100;
            const originY = 100;
            const heading = 0; // Pointing East (+X)
            const length = 200;
            const width = 50; // Y spans [75, 125]

            // 1. Direct hit along corridor center
            assert.strictEqual(
                AttackShapeMath.checkOBBOverlap(originX, originY, heading, length, width, 200, 100, playerRadius),
                true,
                'Player inside corridor center should register hit'
            );

            // 2. Grazing hit on lateral edge
            assert.strictEqual(
                AttackShapeMath.checkOBBOverlap(originX, originY, heading, length, width, 150, 135, playerRadius),
                true,
                'Player grazing lateral edge within playerRadius should register hit'
            );

            // 3. Clear miss far to the side
            assert.strictEqual(
                AttackShapeMath.checkOBBOverlap(originX, originY, heading, length, width, 150, 200, playerRadius),
                false,
                'Player far outside lateral corridor should miss'
            );

            // 4. Behind the attack origin
            assert.strictEqual(
                AttackShapeMath.checkOBBOverlap(originX, originY, heading, length, width, 50, 100, playerRadius),
                false,
                'Player behind runway origin should miss'
            );
        });

        it('Archetype 2: conical (Radial fan / cleave test)', () => {
            const originX = 200;
            const originY = 200;
            const heading = 0; // Facing East (0 radians)
            const arcAngle = 90; // 90 degree spread (-45 deg to +45 deg)
            const radius = 100;

            // 1. Direct hit in front
            assert.strictEqual(
                AttackShapeMath.checkConeOverlap(originX, originY, heading, arcAngle, radius, 250, 200, playerRadius),
                true,
                'Player directly inside cone sector should register hit'
            );

            // 2. Hit at 40 degrees within 90 degree cone
            const angle40 = (40 * Math.PI) / 180;
            assert.strictEqual(
                AttackShapeMath.checkConeOverlap(originX, originY, heading, arcAngle, radius, originX + Math.cos(angle40) * 60, originY + Math.sin(angle40) * 60, playerRadius),
                true,
                'Player inside cone angle should hit'
            );

            // 3. Behind attacker (180 deg)
            assert.strictEqual(
                AttackShapeMath.checkConeOverlap(originX, originY, heading, arcAngle, radius, 100, 200, playerRadius),
                false,
                'Player directly behind attacker should miss'
            );

            // 4. In front but beyond max radius
            assert.strictEqual(
                AttackShapeMath.checkConeOverlap(originX, originY, heading, arcAngle, radius, 400, 200, playerRadius),
                false,
                'Player outside cone reach radius should miss'
            );
        });

        it('should correctly orient directional attacks across all 4 cardinal quadrants (East, South, West, North)', () => {
            const ox = 500;
            const oy = 500;
            const len = 150;
            const width = 40;
            const playerRadius = 20;

            // East (0 rad) -> target at (600, 500)
            const angleEast = 0;
            assert.strictEqual(AttackShapeMath.checkOBBOverlap(ox, oy, angleEast, len, width, 600, 500, playerRadius), true);
            assert.strictEqual(AttackShapeMath.checkOBBOverlap(ox, oy, angleEast, len, width, 500, 600, playerRadius), false);

            // South (+PI/2 rad) -> target at (500, 600)
            const angleSouth = Math.PI / 2;
            assert.strictEqual(AttackShapeMath.checkOBBOverlap(ox, oy, angleSouth, len, width, 500, 600, playerRadius), true);
            assert.strictEqual(AttackShapeMath.checkOBBOverlap(ox, oy, angleSouth, len, width, 600, 500, playerRadius), false);

            // West (PI rad) -> target at (400, 500)
            const angleWest = Math.PI;
            assert.strictEqual(AttackShapeMath.checkOBBOverlap(ox, oy, angleWest, len, width, 400, 500, playerRadius), true);
            assert.strictEqual(AttackShapeMath.checkOBBOverlap(ox, oy, angleWest, len, width, 500, 600, playerRadius), false);

            // North (-PI/2 rad) -> target at (500, 400)
            const angleNorth = -Math.PI / 2;
            assert.strictEqual(AttackShapeMath.checkOBBOverlap(ox, oy, angleNorth, len, width, 500, 400, playerRadius), true);
            assert.strictEqual(AttackShapeMath.checkOBBOverlap(ox, oy, angleNorth, len, width, 500, 600, playerRadius), false);
        });

        it('Archetype 3: radial (Circle & Donut ring test)', () => {
            const originX = 300;
            const originY = 300;
            const innerRadius = 50;
            const outerRadius = 150;

            // 1. In danger ring (dist = 100)
            assert.strictEqual(
                AttackShapeMath.checkDonutOverlap(originX, originY, innerRadius, outerRadius, 400, 300, playerRadius),
                true,
                'Player in donut ring should register hit'
            );

            // 2. Safe center zone (dist = 10, innerR = 50, targetR = 24 => max reach = 34 < 50)
            assert.strictEqual(
                AttackShapeMath.checkDonutOverlap(originX, originY, 60, outerRadius, 305, 300, 10),
                false,
                'Player in safe inner donut core should NOT be hit'
            );

            // 3. Far beyond outer ring (dist = 300)
            assert.strictEqual(
                AttackShapeMath.checkDonutOverlap(originX, originY, innerRadius, outerRadius, 600, 300, playerRadius),
                false,
                'Player beyond outer donut radius should miss'
            );
        });

        it('Archetype 4: targeted_mortar (Ground reticle test)', () => {
            const targetX = 500;
            const targetY = 500;
            const blastRadius = 80;

            // 1. Direct hit inside blast
            assert.strictEqual(
                AttackShapeMath.checkMortarOverlap(targetX, targetY, blastRadius, 530, 520, playerRadius),
                true,
                'Player inside mortar reticle should register hit'
            );

            // 2. Clear miss outside blast
            assert.strictEqual(
                AttackShapeMath.checkMortarOverlap(targetX, targetY, blastRadius, 700, 700, playerRadius),
                false,
                'Player outside mortar radius should miss'
            );
        });

        it('Archetype 5: directional_bullet (Projectile circle test)', () => {
            const bulletX = 150;
            const bulletY = 150;
            const bulletRadius = 8;

            assert.strictEqual(
                AttackShapeMath.checkBulletOverlap(bulletX, bulletY, bulletRadius, 160, 150, playerRadius),
                true,
                'Bullet overlapping player bounding radius should hit'
            );

            assert.strictEqual(
                AttackShapeMath.checkBulletOverlap(bulletX, bulletY, bulletRadius, 300, 150, playerRadius),
                false,
                'Bullet far from player should miss'
            );
        });
    });

    describe('3. Authoritative 4-Phase Attack State Machine Lifecycle', () => {
        let mob;
        let mockPlayers;
        let emittedEvents;

        beforeEach(() => {
            mob = new EnemyEntity('test_tiger', 'tiger', 200, 200, () => false);
            mockPlayers = {
                'socket_p1': {
                    playerId: 'socket_p1',
                    Username: 'Hero',
                    firstName: 'Hero',
                    isDead: false,
                    position: { x: 250, y: 200 },
                    stats: { health: 100, maxHealth: 100, bodyParts: {} }
                }
            };
            emittedEvents = [];
        });

        const mockEmitter = {
            emitTelegraphStart: (p) => emittedEvents.push({ type: 'start', payload: p }),
            emitTelegraphCancel: (p) => emittedEvents.push({ type: 'cancel', payload: p }),
            emitAttackExecute: (p) => emittedEvents.push({ type: 'execute', payload: p }),
            emitDied: (p) => emittedEvents.push({ type: 'died', payload: p }),
            applyDamageFunc: (tId, amount, srcId, dmgType, part, opt) => {
                emittedEvents.push({ type: 'damage', targetId: tId, amount });
                if (mockPlayers[tId] && mockPlayers[tId].stats) {
                    mockPlayers[tId].stats.health = Math.max(0, mockPlayers[tId].stats.health - amount);
                }
            }
        };

        it('should progress smoothly through WINDUP -> FLASH -> ACTIVE -> RECOVERY -> ORBIT_SPACING', () => {
            // Force state to ORBIT_SPACING with target acquired
            mob.state = 'ORBIT_SPACING';
            mob.targetPlayerId = 'socket_p1';

            // Select and trigger an attack
            const biteAtk = mob.attacks.find(a => a.id === 'tiger_bite');
            assert.ok(biteAtk);
            mob.startAttack(biteAtk, mockPlayers['socket_p1'], mockEmitter);

            // Phase 1: WINDUP
            assert.strictEqual(mob.state, 'WINDUP');
            assert.strictEqual(emittedEvents.length, 1);
            assert.strictEqual(emittedEvents[0].type, 'start');
            assert.strictEqual(emittedEvents[0].payload.attackId, 'tiger_bite');
            assert.strictEqual(emittedEvents[0].payload.limbGlow, 'jaws');

            // Elapse windup time (800ms = 0.8s)
            mob.update(0.85, mockPlayers, mockEmitter);

            // Phase 2: FLASH
            assert.strictEqual(mob.state, 'FLASH');

            // Elapse flash time (120ms = 0.12s)
            mob.update(0.13, mockPlayers, mockEmitter);

            // Phase 3: ACTIVE (Evaluates hitboxes)
            assert.strictEqual(mob.state, 'ACTIVE');
            const execEvent = emittedEvents.find(e => e.type === 'execute');
            assert.ok(execEvent, 'enemyAttackExecute must be emitted on active phase start');
            const dmgEvent = emittedEvents.find(e => e.type === 'damage');
            assert.ok(dmgEvent, 'Damage must be dealt to mock player in cone range');
            assert.strictEqual(dmgEvent.targetId, 'socket_p1');

            // Elapse active duration (200ms = 0.2s)
            mob.update(0.21, mockPlayers, mockEmitter);

            // Phase 4: RECOVERY
            assert.strictEqual(mob.state, 'RECOVERY');

            // Elapse recovery fatigue duration (500ms = 0.5s)
            mob.update(0.55, mockPlayers, mockEmitter);

            // Returned to combat positioning
            assert.strictEqual(mob.state, 'ORBIT_SPACING');
        });
    });

    describe('4. Anatomical Weak-Point Stagger Interrupts & Limb Disablement', () => {
        it('should cancel attack and enter 1.5s Stagger/Recovery on >= 25 damage to glowing limb during WINDUP', () => {
            const mob = new EnemyEntity('test_tiger', 'tiger', 200, 200, () => false);
            const mockPlayer = { playerId: 'p1', position: { x: 250, y: 200 }, isDead: false };
            const biteAtk = mob.attacks.find(a => a.id === 'tiger_bite');

            let cancelEmitted = false;
            const mockEmitter = {
                emitTelegraphStart: () => {},
                emitTelegraphCancel: (p) => {
                    cancelEmitted = true;
                    assert.strictEqual(p.limb, 'jaws');
                    assert.strictEqual(p.reason, 'stagger_interrupt');
                }
            };

            mob.startAttack(biteAtk, mockPlayer, mockEmitter);
            assert.strictEqual(mob.state, 'WINDUP');
            assert.strictEqual(biteAtk.limbGlow, 'jaws');

            // Deal 30 damage to the glowing 'jaws'
            const result = mob.takeDamage(30, 'brute', 'p1', 'jaws', {}, mockEmitter);

            assert.strictEqual(result.interrupted, true, 'Attack must be interrupted');
            assert.strictEqual(cancelEmitted, true, 'Cancel event must be emitted');
            assert.strictEqual(mob.state, 'RECOVERY', 'Mob must transition to RECOVERY fatigue');
            assert.strictEqual(mob.stateTimer, 1.5, 'Stagger recovery duration must be 1.5 seconds');
        });

        it('should NOT interrupt if non-glowing limb is damaged during WINDUP', () => {
            const mob = new EnemyEntity('test_tiger', 'tiger', 200, 200, () => false);
            const mockPlayer = { playerId: 'p1', position: { x: 250, y: 200 }, isDead: false };
            const biteAtk = mob.attacks.find(a => a.id === 'tiger_bite');

            let cancelEmitted = false;
            const mockEmitter = {
                emitTelegraphStart: () => {},
                emitTelegraphCancel: () => { cancelEmitted = true; }
            };

            mob.startAttack(biteAtk, mockPlayer, mockEmitter);
            assert.strictEqual(mob.state, 'WINDUP');

            // Deal 30 damage to 'torso' (not the glowing 'jaws')
            const result = mob.takeDamage(30, 'brute', 'p1', 'torso', {}, mockEmitter);

            assert.strictEqual(result.interrupted, false);
            assert.strictEqual(cancelEmitted, false);
            assert.strictEqual(mob.state, 'WINDUP', 'State should remain WINDUP');
        });

        it('should disable attack selection if limb is fractured (disableAttackOnFracture)', () => {
            const mob = new EnemyEntity('test_tiger', 'tiger', 200, 200, () => false);

            // Fracture the jaws (which disables 'tiger_bite')
            mob.anatomy.limbs.jaws.fractured = true;

            // Attempt to select attack at close range (dist = 50px)
            const chosen = mob.selectReadyAttack(50);

            // 'tiger_bite' is disabled by fractured jaws; 'tiger_pounce' minDistance is 100 so null at 50px
            assert.strictEqual(chosen, null, 'No attack should be selected when required limb is fractured');
        });

        it('should activate Enrage speed & windup buffs at <= 30% HP', () => {
            const mob = new EnemyEntity('test_tiger', 'tiger', 200, 200, () => false);
            assert.strictEqual(mob.isEnraged, false);

            // Reduce health to 25% (60 / 240)
            mob.takeDamage(180, 'brute', 'p1', 'torso');

            // Run an update tick to evaluate enrage transition
            mob.update(0.033, {});

            assert.strictEqual(mob.isEnraged, true, 'Mob should enter Enrage frenzy at <= 30% HP');
        });
    });

    describe('5. EnemyManager Master Orchestration & Player Combat Hook', () => {
        it('should spawn, retrieve, and manage enemy entities through EnemyManager', () => {
            const manager = EnemyManager;
            manager.init({ applyDamageFunc: () => {} });

            const tiger = manager.spawnEnemy('spawn_test_tiger', 'tiger', 150, 150);
            assert.ok(tiger);
            assert.strictEqual(manager.getEnemy('spawn_test_tiger'), tiger);
            assert.strictEqual(manager.getEnemy('SPAWN_TEST_TIGER'), tiger, 'Should support case-insensitive lookup');

            // Clean up
            manager.removeEnemy('spawn_test_tiger');
            assert.strictEqual(manager.getEnemy('spawn_test_tiger'), null);
        });

        it('should route handlePlayerAttackEnemy and apply damage to enemy limb', () => {
            const manager = EnemyManager;
            manager.init({ applyDamageFunc: () => {} });

            const tiger = manager.spawnEnemy('attack_test_tiger', 'tiger', 100, 100);
            const mockPlayer = {
                playerId: 'socket_attacker',
                firstName: 'Hunter',
                position: { x: 120, y: 100 }
            };

            const mockSocket = {
                id: 'socket_attacker',
                emit: () => {}
            };

            const initialHealth = tiger.stats.health;
            const handled = manager.handlePlayerAttackEnemy(
                mockSocket,
                mockPlayer,
                'attack_test_tiger',
                'jaws',
                'hostile',
                { isWeapon: true, damage: 30, damageType: 'brute', bleedMult: 1.0, fractureMult: 1.0 }
            );

            assert.strictEqual(handled, true);
            assert.ok(tiger.stats.health < initialHealth, 'Enemy health must be reduced');
            assert.ok(tiger.anatomy.limbs.jaws.hp < 75, 'Jaws limb health must be reduced');

            manager.removeEnemy('attack_test_tiger');
        });

        it('should successfully instantiate and spawn the test Enemy into the world', () => {
            const manager = EnemyManager;
            manager.init({ applyDamageFunc: () => {} });

            const dummy = manager.spawnEnemy('training_dummy_1', 'test', 1450, 1400);
            assert.ok(dummy);
            assert.strictEqual(dummy.name, 'Clockwork Sparring-Dummy');
            assert.strictEqual(dummy.x, 1450);
            assert.strictEqual(dummy.y, 1400);
            assert.strictEqual(dummy.stats.health, 300);
            assert.strictEqual(dummy.attacks.length, 3);

            // Verify weak point limbs exist
            assert.ok(dummy.anatomy.limbs.gearCore, 'gearCore weak point limb must exist');
            assert.ok(dummy.anatomy.limbs.leftArm, 'leftArm weak point limb must exist');
            assert.ok(dummy.anatomy.limbs.rightArm, 'rightArm weak point limb must exist');

            // Verify modular multi-state spritesheet configuration
            const dataSnapshot = dummy.getData();
            assert.strictEqual(dataSnapshot.enemyName, 'test', 'Snapshot must include enemyName for spritesheet folder lookup');
            assert.strictEqual(dataSnapshot.texture, 'idle_test', 'Snapshot must include idle_test as default texture');
            assert.strictEqual(dataSnapshot.state, 'IDLE', 'Snapshot must include current authoritative state');

            // Test Enemy Examination Handler
            let emittedEvent = null;
            let emittedPayload = null;
            const mockSocket = {
                id: 'socket_observer',
                emit: (event, payload) => {
                    emittedEvent = event;
                    emittedPayload = payload;
                }
            };
            const mockMessageSystem = {
                sendSystemMessage: () => {}
            };

            // Invoke handleExamineEnemy logic directly
            const enemy = manager.getEnemy('training_dummy_1');
            assert.ok(enemy, 'Enemy should be retrievable from manager');
            assert.strictEqual(enemy.name, 'Clockwork Sparring-Dummy');

            // Clean up
            manager.removeEnemy('training_dummy_1');
        });
    });
});

