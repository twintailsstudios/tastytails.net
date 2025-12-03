export function createMap(scene) {
    //----- Loads the json  file and also the map tileset -----//
    const map = scene.make.tilemap({ key: 'demo_map' });
    const tileset = map.addTilesetImage('Demo_tileset', 'tileset');

    //----- Loads a Dynamic Tilemap Layer -----//
    const testTile = scene.add.sprite(3291, 4287, 'tilesetSprite', 8);
    testTile.depth = testTile.y - 92;
    console.log('testTile = ', testTile);

    //----- Creates "layers" of different map tiles to be placed on top of one another -----//
    const grass = map.createLayer('grass', tileset, 0, 0);
    const inside = map.createLayer('inside', tileset, 0, 0);
    const objects = map.createLayer('objects', tileset, 0, 0);
    const objects2 = map.createLayer('objects2', tileset, 0, 0);
    const outsideWallLayer = map.createLayer('outsideWallLayer', tileset, 0, 0);
    const bushes = map.createLayer('bushes', tileset, 0, 0);
    const trees = map.createLayer('trees', tileset, 0, 0);

    // Store layers for collision handling
    scene.mapLayers = [grass, inside, objects, objects2, outsideWallLayer, bushes, trees];

    // Enable collision for tiles with 'Blocked' property set to 'True'
    scene.mapLayers.forEach(layer => {
        if (layer) {
            layer.setCollisionByProperty({ Blocked: 'True' });
            const collidingTiles = layer.filterTiles(tile => tile.collides);
            console.log(`[Collision Setup] Layer ${layer.layer.name}: ${collidingTiles.length} colliding tiles found.`);
        }
    });

    // Set depths
    grass.depth = -6;
    // Other layers depth defaults to 0 or based on Y if needed, but here they seem to be 0 except grass.

    scene.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Static Objects
    createStaticObjects(scene);

    return map;
}

function createStaticObjects(scene) {
    // Cloth Shelves
    createStaticImage(scene, 10548, 4085, 'cloth_shelf_01', 169, 100, 0, 110);
    createStaticImage(scene, 10716, 4085, 'cloth_shelf_02', 169, 100, 0, 110);

    // Mirror
    createStaticImage(scene, 10848, 4082, 'mirror_01', 40, 51, 0, 100, 15);

    // Mannequins
    createStaticImage(scene, 11091, 4051, 'mannequin_00', 31, 25, 15.5, 138, 55);
    createStaticImage(scene, 10934, 4051, 'mannequin_01', 31, 25, 15.5, 138, 55);
    createStaticImage(scene, 11017, 4051, 'mannequin_02', 31, 25, 15.5, 138, 55);
    createStaticImage(scene, 10470, 4421, 'mannequin_00', 31, 25, 15.5, 138, 55);

    // Sewing Machine
    createStaticImage(scene, 11040, 4200, 'sewing_machine_01', 84, 40, 0, 97, 55);

    // Baskets
    createStaticImage(scene, 10472, 4272, 'cloth_roll_basket01', 52, 30, 0, 144, 55);
    createStaticImage(scene, 10486, 4368, 'yarn_basket_01', 61, 22, 0, 22);

    // Pub Tables and Stools
    // Bottom Right Table
    createStaticImage(scene, 10485, 3251, 'pub_table', 218, 33, 0, 68);
    createStaticImage(scene, 10550, 3300, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10485, 3300, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10420, 3300, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10550, 3200, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10485, 3200, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10420, 3200, 'pub_stool', 35, 24, 0, 24);

    // Top Right Table
    createStaticImage(scene, 10485, 3050, 'pub_table', 218, 33, 0, 68);
    createStaticImage(scene, 10550, 3100, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10485, 3100, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10420, 3100, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10550, 3000, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10485, 3000, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10420, 3000, 'pub_stool', 35, 24, 0, 24);

    // Bottom Left Table
    createStaticImage(scene, 10135, 3251, 'pub_table', 218, 33, 0, 68);
    createStaticImage(scene, 10200, 3300, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10135, 3300, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10070, 3300, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10200, 3200, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10135, 3200, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10070, 3200, 'pub_stool', 35, 24, 0, 24);

    // Top Left Table
    createStaticImage(scene, 10135, 3050, 'pub_table', 218, 33, 0, 68);
    createStaticImage(scene, 10200, 3100, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10135, 3100, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10070, 3100, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10200, 3000, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10135, 3000, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 10070, 3000, 'pub_stool', 35, 24, 0, 24);

    // Card Tables
    createStaticImage(scene, 9830, 2750, 'card_table', 153, 130, 0, 25, 35);
    createStaticImage(scene, 9925, 3050, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9885, 3130, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9785, 3130, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9725, 3050, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9885, 2970, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9785, 2970, 'pub_stool', 35, 24, 0, 24);

    createStaticImage(scene, 9830, 3050, 'card_table', 153, 130, 0, 25, 35);
    createStaticImage(scene, 9925, 2750, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9885, 2830, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9785, 2830, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9725, 2750, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9885, 2670, 'pub_stool', 35, 24, 0, 24);
    createStaticImage(scene, 9785, 2670, 'pub_stool', 35, 24, 0, 24);

    // Bar Front
    createStaticImage(scene, 10432, 2848, 'bar_front', 768, 34, 0, 94, 35);

    // Tall Stools
    createStaticImage(scene, 10100, 2900, 'pub_stool_tall', 35, 33, 0, 33, 25);
    createStaticImage(scene, 10200, 2900, 'pub_stool_tall', 35, 33, 0, 33, 25);
    createStaticImage(scene, 10300, 2900, 'pub_stool_tall', 35, 33, 0, 33, 25);
    createStaticImage(scene, 10400, 2900, 'pub_stool_tall', 35, 33, 0, 33, 25);
    createStaticImage(scene, 10500, 2900, 'pub_stool_tall', 35, 33, 0, 33, 25);
    createStaticImage(scene, 10600, 2900, 'pub_stool_tall', 35, 33, 0, 33, 25);
    createStaticImage(scene, 10700, 2900, 'pub_stool_tall', 35, 33, 0, 33, 25);

    // Spa Massage Beds
    createStaticImage(scene, 9290, 275, 'spa_massage_bed', 211, 60, 0, 41, 25);
    createStaticImage(scene, 9802, 275, 'spa_massage_bed', 211, 60, 0, 41, 25);
    createStaticImage(scene, 10314, 275, 'spa_massage_bed', 211, 60, 0, 41, 25);
    createStaticImage(scene, 10826, 275, 'spa_massage_bed', 211, 60, 0, 41, 25);

    // Doors
    createDoor(scene, 6430, 5565, 'door_clothing_store', 80, 130, 0, 'door_clothing_store_open');
    createDoor(scene, 4315, 4095, 'door_pub', 80, 130, 0, 'door_pub_open');
    createDoor(scene, 3557, 4317, 'door_spa', 80, 130, 0, 'door_spa_open');

    // Exit Rugs
    const clothing_store_exit_rug = scene.physics.add.sprite(10577, 4517, 'clothing_store_exit_rug', 0);
    scene.physics.add.overlap(scene.players, clothing_store_exit_rug, useDoor, null, scene);
    clothing_store_exit_rug.setOffset(0, 55);

    const pub_exit_rug = scene.physics.add.sprite(10833, 3333, 'pub_exit_rug', 0);
    scene.physics.add.overlap(scene.players, pub_exit_rug, useDoor, null, scene);
    pub_exit_rug.setOffset(0, 55);
}

function createStaticImage(scene, x, y, key, width, height, offsetX, offsetY, depthOffset = 0) {
    const image = scene.physics.add.image(x, y, key);
    image.depth = image.y + depthOffset;
    image.setSize(width, height);
    image.setOffset(offsetX, offsetY);
    image.setImmovable(true);
    scene.physics.add.collider(scene.players, image);
    return image;
}

function createDoor(scene, x, y, key, width, height, offset, animKey) {
    const door = scene.physics.add.sprite(x, y, key, 0);
    scene.physics.add.overlap(scene.players, door, useDoor, null, scene);
    door.setSize(width, height);
    scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(key, { start: 1, end: 0 }),
        frameRate: 6
    });
}

function useDoor(players, door) {
    console.log('door.key = ', door.frame.texture.key);
    if (door.frame.texture.key === 'door_clothing_store') {
        console.log('Clothing Store door was used');
        door.play('door_clothing_store_open');
    }
    if (door.frame.texture.key === 'door_pub') {
        console.log('Pub door was used');
        door.play('door_pub_open');
    }
    if (door.frame.texture.key === 'door_spa') {
        console.log('Spa door was used');
        door.play('door_spa_open');
    }
}
