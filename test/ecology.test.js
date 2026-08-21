const assert = require('assert');
const ecologyDefs = require('../src/data/ecologyDefinitions');
const resourceNodeDefs = require('../src/data/resourceNodeData');
const itemData = require('../src/data/itemData');
const EcologyManager = require('../src/server/mechanics/EcologyManager');
const EnemyEntity = require('../src/server/mechanics/EnemyEntity');
const EnemyManager = require('../src/server/mechanics/EnemyManager');

describe('Ecology, Dynamic Flora Spawning & Dietary AI Framework', () => {

    describe('1. Ecology Definitions & Registries', () => {
        it('should define all required wild flora species with valid weights and harvest items', () => {
            const requiredSpecies = [
                'flora_tall_grass',
                'flora_clover',
                'flora_dandelion',
                'flora_flower_1',
                'flora_flower_2',
                'flora_flower_3',
                'flora_berry_bush'
            ];

            requiredSpecies.forEach(key => {
                const def = ecologyDefs.floraPool[key];
                assert.ok(def, `Missing flora definition: ${key}`);
                assert.ok(typeof def.weight === 'number' && def.weight > 0, `${key} should have positive weight`);
                assert.ok(def.maxCapacity >= 1, `${key} should have capacity >= 1`);
                assert.ok(def.harvestItem, `${key} should have harvestItem`);
                assert.ok(itemData[def.harvestItem], `harvestItem '${def.harvestItem}' should exist in itemData.js`);
                assert.ok(resourceNodeDefs[key], `${key} should be registered in resourceNodeData.js`);
            });
        });

        it('should define fauna pools for herbivores and carnivores', () => {
            assert.ok(ecologyDefs.faunaPools.herbivores, 'Should have herbivore fauna pool');
            assert.ok(ecologyDefs.faunaPools.carnivores, 'Should have carnivore fauna pool');
            assert.ok(ecologyDefs.faunaPools.herbivores.targetPopulation > 0);
            assert.ok(ecologyDefs.faunaPools.carnivores.targetPopulation > 0);
        });
    });

    describe('2. EcologyManager Zone Scanning & Spawning', () => {
        it('should parse plantZone, herbivoreZone, and carnivoreZone tile layers', () => {
            // Mock tilemap data (10x10 map)
            const mockTilemap = {
                width: 10,
                height: 10,
                tilewidth: 32,
                tileheight: 32,
                tilesets: [
                    {
                        firstgid: 100,
                        tiles: [
                            { id: 1, properties: [{ name: 'zone', value: 'plants' }] },
                            { id: 2, properties: [{ name: 'zone', value: 'herbivores' }] },
                            { id: 3, properties: [{ name: 'zone', value: 'carnivores' }] }
                        ]
                    }
                ],
                layers: [
                    {
                        name: 'plantZone',
                        type: 'tilelayer',
                        data: [
                            101, 101, 101, 101, 0, 0, 0, 0, 0, 0,
                            101, 101, 101, 101, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                        ]
                    },
                    {
                        name: 'herbivoreZone',
                        type: 'tilelayer',
                        data: [
                            0, 0, 0, 0, 102, 102, 102, 0, 0, 0,
                            0, 0, 0, 0, 102, 102, 102, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                        ]
                    },
                    {
                        name: 'carnivoreZone',
                        type: 'tilelayer',
                        data: [
                            0, 0, 0, 0, 0, 0, 0, 103, 103, 103,
                            0, 0, 0, 0, 0, 0, 0, 103, 103, 103,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                            0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                        ]
                    }
                ]
            };

            const activeResourceNodes = {};
            const worldItems = [];
            const addedGridItems = [];

            EcologyManager.init({
                tilemapData: mockTilemap,
                activeResourceNodes,
                worldItems,
                addItemToGrid: (item) => addedGridItems.push(item),
                removeItemFromGrid: () => {},
                enemyManager: EnemyManager
            });

            assert.strictEqual(EcologyManager.plantTiles.length, 8);
            assert.strictEqual(EcologyManager.herbivoreTiles.length, 6);
            assert.strictEqual(EcologyManager.carnivoreTiles.length, 6);
            assert.ok(Object.keys(EcologyManager.activeFlora).length > 0);
            assert.ok(worldItems.length > 0);
        });

        it('should roll weighted flora probabilistically', () => {
            const counts = {};
            for (let i = 0; i < 1000; i++) {
                const key = EcologyManager.rollWeightedFlora();
                counts[key] = (counts[key] || 0) + 1;
            }

            // Tall grass has weight 35%, so it should have the largest share
            assert.ok(counts.flora_tall_grass > 200, `Tall grass count (${counts.flora_tall_grass}) should be high`);
        });
    });

    describe('3. Dynamic Flora Depletion & Relocation Respawner', () => {
        it('should remove depleted flora and queue relocation respawn', () => {
            const activeResourceNodes = {};
            const worldItems = [];
            let removedCount = 0;

            EcologyManager.activeResourceNodes = activeResourceNodes;
            EcologyManager.worldItems = worldItems;
            EcologyManager.removeItemFromGrid = () => { removedCount++; };
            EcologyManager.pendingFloraRespawns = [];

            // Spawn a test flora node
            const node = EcologyManager.spawnFloraNode(100, 100, 'flora_dandelion');
            assert.ok(activeResourceNodes[node.uid]);
            assert.ok(EcologyManager.activeFlora[node.uid]);

            // Deplete the flora node
            EcologyManager.handleFloraDepleted(node.uid);

            // Verify removal
            assert.strictEqual(activeResourceNodes[node.uid], undefined);
            assert.strictEqual(EcologyManager.activeFlora[node.uid], undefined);
            assert.strictEqual(EcologyManager.pendingFloraRespawns.length, 1);

            // Fast-forward respawn timer
            const respawnTime = EcologyManager.pendingFloraRespawns[0].remainingSeconds;
            EcologyManager.update(respawnTime + 1);

            // Verify a new flora node has respawned
            assert.strictEqual(EcologyManager.pendingFloraRespawns.length, 0);
            assert.ok(Object.keys(EcologyManager.activeFlora).length >= 1);
        });
    });

    describe('4. Herbivore AI Integration with Dynamic Flora', () => {
        it('should locate dynamic flora nodes when hungry and graze them', () => {
            const bunny = new EnemyEntity('bunny_test', 'bunny', 100, 100);
            bunny.needs.hunger.current = 20; // Starving

            const floraNode = {
                uid: 'flora_test_node',
                id: 'flora_test_node',
                type: 'flora_clover',
                x: 120,
                y: 100,
                capacity: 1,
                maxCapacity: 1,
                isDynamicFlora: true
            };

            const envContext = {
                activeResourceNodes: { 'flora_test_node': floraNode },
                worldItems: [],
                removeItem: () => {}
            };

            // 1. Bunny evaluates hunger and transitions to SEEK_FOOD
            bunny.update(0.1, {}, {}, null, null, envContext);
            assert.strictEqual(bunny.state, 'SEEK_FOOD');
            assert.strictEqual(bunny.foodTarget.target, floraNode);

            // 2. Fast forward proximity to food
            bunny.x = 120;
            bunny.y = 100;
            bunny.update(0.1, {}, {}, null, null, envContext);
            assert.strictEqual(bunny.state, 'EATING');

            // 3. Complete eating state
            bunny.eatingTimer = 0.05;
            bunny.update(0.1, {}, {}, null, null, envContext);
            assert.strictEqual(bunny.state, 'IDLE');
            assert.strictEqual(bunny.needs.hunger.current, 100);
            assert.strictEqual(floraNode.capacity, 0);
        });
    });

    describe('5. Predator Carnivore AI (Tiger HUNT_WANDER & Herbivore Predation)', () => {
        it('should load sheep definition with diet herbivore and runner disposition', () => {
            const enemyDefs = require('../src/data/enemyDefinitions');
            assert.ok(enemyDefs.sheep, 'enemyDefinitions should have sheep');
            assert.strictEqual(enemyDefs.sheep.ai.diet, 'herbivore');
            assert.strictEqual(enemyDefs.sheep.ai.disposition, 'runner');
        });

        it('should transition to HUNT_WANDER when hungry and no prey is in local vicinity', () => {
            const tiger = new EnemyEntity('tiger_test', 'tiger', 100, 100);
            tiger.needs.hunger.current = 20; // Hungry

            const distantBunny = new EnemyEntity('bunny_far', 'bunny', 3000, 3000);

            const envContext = {
                activeEnemies: { 'tiger_test': tiger, 'bunny_far': distantBunny },
                activeAnimals: {},
                worldItems: [],
                herbivoreTiles: [{ x: 3000, y: 3000 }]
            };

            // Tiger evaluates hunger, local search radius cannot reach (3000, 3000), enters HUNT_WANDER
            tiger.update(0.1, {}, null, null, null, envContext);
            assert.strictEqual(tiger.state, 'HUNT_WANDER');
            assert.ok(tiger.huntTargetPos);
            assert.strictEqual(tiger.huntTargetPos.x, 3000);
            assert.strictEqual(tiger.huntTargetPos.y, 3000);
        });

        it('should prowl in HUNT_WANDER towards herbivore meadow and lock onto prey scent', () => {
            const tiger = new EnemyEntity('tiger_test', 'tiger', 1000, 1000);
            tiger.needs.hunger.current = 20;

            const bunny = new EnemyEntity('bunny_target', 'bunny', 1400, 1000);

            const envContext = {
                activeEnemies: { 'tiger_test': tiger, 'bunny_target': bunny },
                activeAnimals: {},
                worldItems: [],
                herbivoreTiles: [{ x: 1400, y: 1000 }]
            };

            // In HUNT_WANDER, tiger is within 1500px scent range of bunny (dist = 400px), immediately locks on to SEEK_FOOD
            tiger.state = 'HUNT_WANDER';
            tiger.update(0.1, {}, null, null, null, envContext);
            assert.strictEqual(tiger.state, 'SEEK_FOOD');
            assert.strictEqual(tiger.foodTarget.target, bunny);

            // Fast forward tiger reaching bunny (< 48px)
            tiger.x = 1380;
            tiger.y = 1000;

            const networkEmitter = {
                emitDied: () => {}
            };

            // Attack bunny
            tiger.update(0.1, {}, networkEmitter, null, null, envContext);
            assert.ok(bunny.stats.health < 50, 'Bunny should take damage');

            // Finish bunny off
            bunny.stats.health = 0;
            bunny.state = 'DEAD';
            tiger.update(0.1, {}, networkEmitter, null, null, envContext);
            assert.strictEqual(tiger.state, 'EATING');

            // Complete eating
            tiger.eatingTimer = 0.05;
            tiger.update(0.1, {}, networkEmitter, null, null, envContext);
            assert.strictEqual(tiger.state, 'IDLE');
            assert.strictEqual(tiger.needs.hunger.current, 100);
        });

        it('should target any entity where diet is herbivore (including sheep)', () => {
            const tiger = new EnemyEntity('tiger_test', 'tiger', 200, 200);
            tiger.needs.hunger.current = 15;

            const sheep = new EnemyEntity('sheep_test', 'sheep', 300, 200);

            const envContext = {
                activeEnemies: { 'tiger_test': tiger, 'sheep_test': sheep },
                activeAnimals: {},
                worldItems: []
            };

            assert.strictEqual(tiger.startSeekingFood(envContext), true);
            assert.strictEqual(tiger.foodTarget.target, sheep);
            assert.strictEqual(tiger.state, 'SEEK_FOOD');
        });
    });

    describe('6. Open-World Fauna Wandering', () => {
        it('should allow wild fauna to wander past 150px without artificial tethering', () => {
            const bunny = new EnemyEntity('bunny_wander', 'bunny', 1000, 1000);
            bunny.x = 1300; // 300px away from startX (1000)
            bunny.y = 1000;
            bunny.stateTimer = 0; // Trigger wander tick

            bunny.updateIdle(0.1, {});

            // Bunny should not be forced backwards to startX (1000) because it is wild fauna (not territorial)
            assert.ok(bunny.x >= 1290, 'Bunny should freely wander without 150px tether leash');
        });
    });
});

