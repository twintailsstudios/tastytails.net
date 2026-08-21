/**
 * @fileoverview test_npc_hydration.js - Automated Test Suite for NPC Hydration & Pathfinding
 * @subsystem NPC AI, WaterSourceRegistry, Pathfinder & NeedsManager
 * @description
 * Comprehensive verification script testing:
 * 1. WaterSourceRegistry parsing of alpha_map.json water tiles.
 * 2. A* Pathfinder obstacle avoidance and corner-cutting safeguards.
 * 3. NeedsManager biological decay and desire urgency thresholds.
 * 4. Animal FSM end-to-end lifecycle (Wander -> Thirst -> Pathfinding -> Drinking -> Satisfied).
 * 
 * Run with: node scripts/test_npc_hydration.js
 */

const fs = require('fs');
const path = require('path');
const WaterSourceRegistry = require('../src/server/mechanics/WaterSourceRegistry');
const Pathfinder = require('../src/server/mechanics/Pathfinder');
const NeedsManager = require('../src/server/mechanics/NeedsManager');
const Animal = require('../src/server/mechanics/Animal');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passedTests++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failedTests++;
    }
}

console.log('════════════════════════════════════════════════════════════');
console.log('║     NPC HYDRATION & A* PATHFINDING VERIFICATION SUITE    ║');
console.log('════════════════════════════════════════════════════════════\n');

// =========================================================================
// TEST SUITE 1: WaterSourceRegistry Tile Ingestion & Queries
// =========================================================================
console.log('[Suite 1] Testing WaterSourceRegistry & alpha_map.json Parsing...');
try {
    const mapPath = path.join(__dirname, '../src/client/assets/tilemaps/alpha_map.json');
    const tilemapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

    WaterSourceRegistry.initFromMap(tilemapData, 32);
    const totalWater = WaterSourceRegistry.getTotalWaterTiles();

    assert(totalWater > 0, `Successfully parsed water tiles from alpha_map.json (Found: ${totalWater} tiles)`);
    assert(totalWater === 4570, `Detected exactly the 4,570 true waterSource tiles in alpha_ground_set (Got: ${totalWater})`);
    assert(!WaterSourceRegistry.waterGids.has(1351), `Base dirt/meadow tile (GID 1351) is NOT registered as water`);
    assert(WaterSourceRegistry.waterGids.has(1491) && WaterSourceRegistry.waterGids.has(1497) && WaterSourceRegistry.waterGids.has(1503), `True water GIDs [1491, 1497, 1503] are correctly indexed`);

    // Test nearest water query from a sample position
    const sampleX = 3000;
    const sampleY = 4000;
    const nearest = WaterSourceRegistry.findNearestWaterSource(sampleX, sampleY);

    assert(nearest !== null, `Found nearest water source from (${sampleX}, ${sampleY})`);
    assert(nearest && nearest.waterTile && typeof nearest.waterTile.worldX === 'number', `Water tile has valid world coordinates`);
    assert(nearest && nearest.standingSpot && typeof nearest.standingSpot.worldX === 'number', `Computed valid standing spot for water approach`);
    assert(nearest && nearest.waterTile.gid !== 1351, `Target water tile GID is a true water GID (${nearest ? nearest.waterTile.gid : ''})`);
    assert(nearest && !WaterSourceRegistry.isWaterTile(nearest.standingSpot.tx, nearest.standingSpot.ty), `Standing spot (${nearest ? nearest.standingSpot.tx : ''}, ${nearest ? nearest.standingSpot.ty : ''}) is on dry land`);
} catch (err) {
    assert(false, `WaterSourceRegistry test threw exception: ${err.message}`);
}

// =========================================================================
// TEST SUITE 2: A* Grid Pathfinder & Obstacle Avoidance
// =========================================================================
console.log('\n[Suite 2] Testing Pathfinder A* Algorithm & Collision Grid...');
try {
    // Construct a 20x20 test collision map (0 = empty, 1 = solid wall)
    const testMap = Array(20).fill(null).map(() => Array(20).fill(0));

    // Create a vertical wall at x = 5 from y = 2 to y = 8 with a gap at y = 9
    for (let y = 2; y <= 8; y++) {
        testMap[y][5] = 1;
    }

    // Straight path in open area
    const straightPath = Pathfinder.findGridPath(1, 1, 4, 1, testMap);
    assert(straightPath !== null && straightPath.length === 4, `A* straight path found with 4 steps`);

    // Path navigating around the wall
    const pathAroundWall = Pathfinder.findGridPath(2, 5, 8, 5, testMap);
    assert(pathAroundWall !== null, `A* navigated around vertical wall barrier`);
    if (pathAroundWall) {
        const hitsWall = pathAroundWall.some(step => testMap[step.ty][step.tx] === 1);
        assert(!hitsWall, `A* path contains zero blocked wall tiles`);
    }

    // World path conversion
    const worldPath = Pathfinder.findWorldPath(64, 64, 256, 160, testMap, 32);
    assert(worldPath !== null && worldPath.length > 0, `findWorldPath returned ${worldPath ? worldPath.length : 0} pixel waypoints`);
} catch (err) {
    assert(false, `Pathfinder test threw exception: ${err.message}`);
}

// =========================================================================
// TEST SUITE 3: NeedsManager Biological Decay & Desire Tiers
// =========================================================================
console.log('\n[Suite 3] Testing NeedsManager Hydration Decay & Thirst Triggers...');
try {
    const needs = new NeedsManager({
        initialHydration: 100,
        hydrationDecayRate: 1.0, // 1 point/sec for fast test
        thirstThreshold: 40,
        parchedThreshold: 15,
        drinkSpeed: 50
    });

    assert(needs.hydration.current === 100, `Initial hydration is 100%`);
    assert(!needs.isThirsty(), `Initial state is not thirsty`);

    // Simulate 40 seconds of decay
    needs.update(40);
    assert(needs.hydration.current === 60, `Hydration decayed from 100 to 60 over 40s`);
    assert(!needs.isThirsty(), `Hydration 60 is above 40% thirst threshold`);

    // Simulate another 25 seconds of decay (current = 35)
    needs.update(25);
    assert(needs.hydration.current === 35, `Hydration reached 35%`);
    assert(needs.isThirsty(), `isThirsty() correctly triggered at 35%`);
    assert(!needs.isParched(), `isParched() is false at 35% (parched threshold = 15%)`);

    const desire = needs.getStrongestDesire();
    assert(desire.need === 'hydration', `getStrongestDesire() identifies 'hydration'`);
    assert(desire.score > 0.6, `Desire score reflects thirst intensity (${desire.score.toFixed(2)})`);

    // Simulate critical decay (current = 10)
    needs.update(25);
    assert(needs.isParched(), `isParched() triggered when hydration drops to 10%`);

    // Test drinking replenishment
    needs.drink(1.0); // 50 points restored in 1 second
    assert(needs.hydration.current === 60, `Drinking restored hydration to 60%`);

    needs.satisfyHydration();
    assert(needs.hydration.current === 100, `satisfyHydration() restored hydration to 100%`);
    assert(!needs.isThirsty(), `NPC is fully quenched`);
} catch (err) {
    assert(false, `NeedsManager test threw exception: ${err.message}`);
}

// =========================================================================
// TEST SUITE 4: End-to-End Animal FSM Lifecycle (Wander -> Drink -> Satisfy)
// =========================================================================
console.log('\n[Suite 4] Testing Animal End-to-End Desires & Water Pathfinding Lifecycle...');
try {
    // Find a known water tile location from WaterSourceRegistry
    const waterSample = WaterSourceRegistry.waterTileList[0];
    const spawnX = waterSample ? waterSample.worldX - 250 : 100;
    const spawnY = waterSample ? waterSample.worldY : 100;

    // Spawn animal 250px away from water with low hydration (30% -> Thirsty)
    const animal = new Animal(
        'sheep_test_1',
        spawnX,
        spawnY,
        {
            initialHydration: 30,
            hydrationDecayRate: 0.05,
            thirstThreshold: 40,
            parchedThreshold: 15,
            moveSpeed: 80,
            drinkingDuration: 0.5,
            drinkSpeed: 200
        },
        () => false, // Open collision for test path
        WaterSourceRegistry
    );

    assert(animal.needs.isThirsty(), `Spawned Animal starts with thirsty hydration (${animal.needs.hydration.current}%)`);
    assert(animal.state === 'SEEK_WATER', `Animal automatically transitioned to 'SEEK_WATER' state in constructor`);
    assert(animal.currentPath.length > 0, `Animal computed A* path with ${animal.currentPath.length} waypoints`);

    // Simulate animal traversing the path towards water
    let tickCount = 0;
    const maxTicks = 200;
    let reachedDrinking = false;

    while (tickCount < maxTicks) {
        animal.update(0.1, WaterSourceRegistry);
        if (animal.state === 'DRINKING') {
            reachedDrinking = true;
        }
        if (reachedDrinking && animal.state === 'IDLE' && animal.needs.hydration.current >= 100) {
            break;
        }
        tickCount++;
    }

    assert(reachedDrinking, `Animal successfully reached water and entered 'DRINKING' state`);
    assert(animal.needs.hydration.current === 100, `Animal fully replenished hydration to 100%`);
    assert(animal.state === 'IDLE', `Animal transitioned back to 'IDLE' state after drinking`);

    const data = animal.getData();
    assert(data.hydration === 100, `animal.getData() snapshot contains hydration: 100`);
    assert(data.state === 'IDLE', `animal.getData() snapshot contains state: 'IDLE'`);
} catch (err) {
    assert(false, `Animal lifecycle test threw exception: ${err.message}`);
}

// =========================================================================
// TEST SUITE 5: EnemyEntity Desires & Hydration Lifecycle
// =========================================================================
console.log('\n[Suite 5] Testing EnemyEntity (Mob) Hydration & Thirst Lifecycle...');
try {
    const EnemyEntity = require('../src/server/mechanics/EnemyEntity');
    const waterSample = WaterSourceRegistry.waterTileList[0];
    const spawnX = waterSample ? waterSample.worldX - 100 : 100;
    const spawnY = waterSample ? waterSample.worldY : 100;

    const enemy = new EnemyEntity('tiger_test_1', 'tiger', spawnX, spawnY, () => false);
    assert(enemy.needs !== undefined, `EnemyEntity successfully instantiated with NeedsManager`);
    assert(enemy.needs.hydration.current === 100, `EnemyEntity starts with 100% hydration`);

    // Force enemy hydration to 30%
    enemy.needs.hydration.current = 30;
    assert(enemy.needs.isThirsty(), `EnemyEntity isThirsty() is true at 30%`);

    // Tick update to initiate water pathfinding
    enemy.update(0.1, {}, null, WaterSourceRegistry);
    assert(enemy.state === 'SEEK_WATER', `EnemyEntity transitioned to 'SEEK_WATER' state`);
    assert(enemy.currentPath.length > 0, `EnemyEntity computed A* waypoints to water`);

    // Simulate enemy stepping to water and drinking
    let tickCount = 0;
    const maxTicks = 200;
    let reachedDrinking = false;

    while (tickCount < maxTicks) {
        enemy.update(0.1, {}, null, WaterSourceRegistry);
        if (enemy.state === 'DRINKING') {
            reachedDrinking = true;
        }
        if (reachedDrinking && enemy.state === 'IDLE' && enemy.needs.hydration.current >= 100) {
            break;
        }
        tickCount++;
    }

    assert(reachedDrinking, `EnemyEntity reached water and entered 'DRINKING' state`);
    assert(enemy.needs.hydration.current === 100, `EnemyEntity fully replenished hydration to 100%`);
    assert(enemy.state === 'IDLE', `EnemyEntity returned to 'IDLE' after drinking`);

    const enemyData = enemy.getData();
    assert(enemyData.hydration === 100, `enemy.getData() includes hydration: 100`);
    assert(typeof enemyData.thirstThreshold === 'number', `enemy.getData() includes thirstThreshold: ${enemyData.thirstThreshold}`);
    assert(typeof enemyData.hydrationDecayRate === 'number', `enemy.getData() includes hydrationDecayRate: ${enemyData.hydrationDecayRate}`);
} catch (err) {
    assert(false, `EnemyEntity hydration test threw exception: ${err.message}`);
}

console.log('\n════════════════════════════════════════════════════════════');
console.log(`║ TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED               ║`);
console.log('════════════════════════════════════════════════════════════');

if (failedTests > 0) {
    process.exit(1);
}
