const assert = require('assert');
const EnemyEntity = require('../src/server/mechanics/EnemyEntity');
const EnemyManager = require('../src/server/mechanics/EnemyManager');
const enemyDefinitions = require('../src/data/enemyDefinitions');
const Animal = require('../src/server/mechanics/Animal');

describe('NPC Enemy Disposition & Dietary Ecology Framework', () => {

    describe('1. Declarative Schema and Registry Loading', () => {
        it('should load canonical enemies with declarative dispositions and diets', () => {
            assert.strictEqual(enemyDefinitions.test.ai.disposition, 'neutral');
            assert.strictEqual(enemyDefinitions.bunny.ai.disposition, 'runner');
            assert.strictEqual(enemyDefinitions.tiger.ai.disposition, 'aggressive');

            assert.strictEqual(enemyDefinitions.test.ai.diet, 'none');
            assert.strictEqual(enemyDefinitions.bunny.ai.diet, 'herbivore');
            assert.strictEqual(enemyDefinitions.tiger.ai.diet, 'carnivore');
        });

        it('should instantiate EnemyEntity with matching disposition and diet attributes', () => {
            const tiger = new EnemyEntity('tiger_1', 'tiger', 100, 100);
            assert.strictEqual(tiger.disposition, 'aggressive');
            assert.strictEqual(tiger.diet, 'carnivore');
            assert.strictEqual(tiger.needs.enableHunger, true);

            const dummy = new EnemyEntity('dummy_1', 'test', 100, 100);
            assert.strictEqual(dummy.disposition, 'neutral');
            assert.strictEqual(dummy.diet, 'none');
            assert.strictEqual(dummy.needs.enableHunger, false);

            const bunny = new EnemyEntity('bunny_1', 'bunny', 100, 100);
            assert.strictEqual(bunny.disposition, 'runner');
            assert.strictEqual(bunny.diet, 'herbivore');
            assert.strictEqual(bunny.needs.enableHunger, true);
            const bunnyData = bunny.getData();
            assert.strictEqual(bunnyData.enemyName, 'bunny');
            assert.strictEqual(bunnyData.texture, 'idle_bunny');
        });
    });

    describe('2. Disposition: Aggressive (Wild Tiger)', () => {
        it('should detect living players within aggroRadius and enter combat orbit spacing', () => {
            const tiger = new EnemyEntity('tiger_test', 'tiger', 100, 100);
            const players = {
                'p1': { id: 'p1', playerId: 'p1', position: { x: 200, y: 100 }, stats: { health: 100, maxHealth: 100 }, isDead: false }
            };

            tiger.update(0.1, players);
            assert.strictEqual(tiger.state, 'ORBIT_SPACING');
            assert.strictEqual(tiger.targetPlayerId, 'p1');
        });

        it('should prioritize wounded / bleeding players when multiple targets are present', () => {
            const tiger = new EnemyEntity('tiger_test', 'tiger', 100, 100);
            const players = {
                'p_healthy': { id: 'p_healthy', playerId: 'p_healthy', position: { x: 150, y: 100 }, stats: { health: 100, maxHealth: 100 }, isDead: false },
                'p_wounded': { id: 'p_wounded', playerId: 'p_wounded', position: { x: 160, y: 100 }, stats: { health: 25, maxHealth: 100 }, isDead: false }
            };

            tiger.update(0.1, players);
            assert.strictEqual(tiger.targetPlayerId, 'p_wounded');
        });
    });

    describe('3. Disposition: Neutral (Test Automaton)', () => {
        it('should remain IDLE despite player standing close nearby', () => {
            const dummy = new EnemyEntity('dummy_test', 'test', 500, 500);
            const players = {
                'p1': { id: 'p1', playerId: 'p1', position: { x: 520, y: 500 }, stats: { health: 100, maxHealth: 100 }, isDead: false }
            };

            dummy.update(0.1, players);
            assert.strictEqual(dummy.state, 'IDLE');
            assert.strictEqual(dummy.targetPlayerId, null);
        });

        it('should engage player when attacked and log threat in threatTable', () => {
            const dummy = new EnemyEntity('dummy_test', 'test', 500, 500);
            dummy.takeDamage(20, 'brute', 'p1');

            assert.strictEqual(dummy.state, 'ORBIT_SPACING');
            assert.strictEqual(dummy.targetPlayerId, 'p1');
            assert.ok(dummy.threatTable['p1'] > 0);
        });

        it('should trigger social pack defense alerting nearby allies of same species within 300px', () => {
            EnemyManager.activeEnemies = {};
            const dummy1 = EnemyManager.spawnEnemy('dummy_lead', 'test', 500, 500);
            const dummy2 = EnemyManager.spawnEnemy('dummy_ally', 'test', 600, 500);
            const tiger = EnemyManager.spawnEnemy('tiger_other', 'tiger', 550, 500);

            // Attack leader
            EnemyManager.handlePlayerAttackEnemy(
                null,
                { playerId: 'p_attacker', Username: 'Hero', position: { x: 520, y: 500 } },
                'dummy_lead',
                'torso',
                'hostile',
                { isWeapon: true, damage: 30 }
            );

            assert.strictEqual(dummy1.state, 'ORBIT_SPACING');
            assert.strictEqual(dummy1.targetPlayerId, 'p_attacker');

            // Ally dummy should be alerted and engage
            assert.strictEqual(dummy2.state, 'ORBIT_SPACING');
            assert.strictEqual(dummy2.targetPlayerId, 'p_attacker');

            // Other species should not join
            assert.strictEqual(tiger.state, 'IDLE');
        });
    });

    describe('4. Disposition: Runner (Bunny)', () => {
        it('should enter FLEEING with inverted repulsion vector away from player threat', () => {
            const bunny = new EnemyEntity('bunny_test', 'bunny', 500, 500);
            const players = {
                'p1': { id: 'p1', playerId: 'p1', position: { x: 450, y: 500 }, stats: { health: 100, maxHealth: 100 }, isDead: false }
            };

            bunny.update(0.1, players);
            assert.strictEqual(bunny.state, 'FLEEING');
            assert.ok(bunny.x > 500);
        });

        it('should exit FLEEING and return to IDLE after threat has moved far away and timer expires', () => {
            const bunny = new EnemyEntity('bunny_test', 'bunny', 500, 500);
            bunny.state = 'FLEEING';
            bunny.fleeTimer = 0.05;

            const players = {
                'p1': { id: 'p1', playerId: 'p1', position: { x: 1000, y: 500 }, stats: { health: 100, maxHealth: 100 }, isDead: false }
            };

            bunny.update(0.1, players);
            assert.strictEqual(bunny.state, 'IDLE');
        });
    });

    describe('5. Dietary Ecology: Carnivore & Herbivore Foraging', () => {
        it('carnivore (tiger) should hunt domestic animals when hungry and eat carcass upon kill', () => {
            const tiger = new EnemyEntity('tiger_hunter', 'tiger', 500, 500);
            tiger.needs.hunger.current = 20;

            const sheep = new Animal('sheep_1', 520, 500, { health: 30, maxHealth: 60 });

            const envContext = {
                worldItems: [],
                activeResourceNodes: {},
                activeAnimals: { 'sheep_1': sheep },
                activeEnemies: {},
                removeItem: () => {}
            };

            const found = tiger.startSeekingFood(envContext);
            assert.strictEqual(found, true);
            assert.strictEqual(tiger.state, 'SEEK_FOOD');
            assert.strictEqual(tiger.foodTarget.type, 'prey');

            // Tiger reaches sheep and attacks it
            tiger.update(0.1, {}, null, null, null, envContext);
            assert.ok(sheep.health < 30);

            // Finish killing prey -> enters EATING
            sheep.health = 0;
            sheep.isDead = true;
            tiger.update(0.1, {}, null, null, null, envContext);
            assert.strictEqual(tiger.state, 'EATING');

            // Complete eating -> replenishes hunger to 100%
            tiger.eatingTimer = 0.05;
            tiger.update(0.1, {}, null, null, null, envContext);
            assert.strictEqual(tiger.needs.hunger.current, 100);
            assert.strictEqual(tiger.state, 'IDLE');
        });

        it('herbivore (bunny) should forage harvestable flora nodes and restore hunger', () => {
            const bunny = new EnemyEntity('bunny_grazer', 'bunny', 200, 200);
            bunny.needs.hunger.current = 15;

            const floraNode = {
                id: 'tree_orange_1',
                type: 'tree_orange',
                x: 220,
                y: 200,
                capacity: 5
            };

            const envContext = {
                worldItems: [],
                activeResourceNodes: { 'tree_orange_1': floraNode },
                activeAnimals: {},
                activeEnemies: {},
                removeItem: () => {}
            };

            const found = bunny.startSeekingFood(envContext);
            assert.strictEqual(found, true);
            assert.strictEqual(bunny.state, 'SEEK_FOOD');
            assert.strictEqual(bunny.foodTarget.type, 'node');

            // Bunny reaches flora node -> enters EATING
            bunny.update(0.1, {}, null, null, null, envContext);
            assert.strictEqual(bunny.state, 'EATING');

            // Complete eating -> capacity decreases by 1, hunger restored to 100%
            bunny.eatingTimer = 0.05;
            bunny.update(0.1, {}, null, null, null, envContext);
            assert.strictEqual(floraNode.capacity, 4);
            assert.strictEqual(bunny.needs.hunger.current, 100);
            assert.strictEqual(bunny.state, 'IDLE');
        });
    });

    describe('6. Anatomical Health Regeneration with Fracture Limits', () => {
        it('should passively regenerate 2% HP per second after 5.0 seconds of peace', () => {
            const tiger = new EnemyEntity('tiger_regen', 'tiger', 100, 100);
            tiger.stats.health = 100;
            tiger.stats.maxHealth = 240;
            tiger.peaceTimer = 5.0;

            tiger.update(1.0, {});
            assert.ok(tiger.stats.health > 100);
            assert.ok(Math.abs(tiger.stats.health - (100 + (0.02 * 240))) < 1.0);
        });

        it('should cap passive health regeneration proportionally when limbs are fractured', () => {
            const tiger = new EnemyEntity('tiger_fracture', 'tiger', 100, 100);
            tiger.stats.health = 50;
            tiger.stats.maxHealth = 240;

            tiger.anatomy.limbs.torso.fractured = true;
            tiger.anatomy.limbs.jaws.fractured = true;

            let totalMax = 0;
            let unbrokenMax = 0;
            for (const limb of Object.values(tiger.anatomy.limbs)) {
                totalMax += (limb.maxHp || 100);
                if (!limb.fractured) unbrokenMax += (limb.maxHp || 100);
            }
            const expectedCap = Math.round((unbrokenMax / totalMax) * tiger.stats.maxHealth);

            tiger.peaceTimer = 5.0;
            for (let i = 0; i < 200; i++) {
                tiger.update(0.5, {});
            }

            assert.strictEqual(tiger.stats.health, expectedCap);
            assert.ok(tiger.stats.health < tiger.stats.maxHealth);
        });
    });

    describe('7. Network Snapshot & DTO Serialization', () => {
        it('should export disposition, diet, and hunger metrics in getData()', () => {
            const tiger = new EnemyEntity('tiger_dto', 'tiger', 100, 100);
            const dto = tiger.getData();

            assert.strictEqual(dto.id, 'tiger_dto');
            assert.strictEqual(dto.disposition, 'aggressive');
            assert.strictEqual(dto.diet, 'carnivore');
            assert.strictEqual(dto.hunger, 100);
            assert.strictEqual(dto.maxHunger, 100);
            assert.strictEqual(dto.enableHunger, true);
        });
    });
});


