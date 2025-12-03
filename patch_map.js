const fs = require('fs');
const path = require('path');

const mapPath = 'c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/client/assets/tilemaps/Demo_Map.json';
const tilesetPath = 'c:/Users/kkmcl/Documents/GitHub/tastytails.net/Map_Testing/Demo_tileset.json';

try {
    const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const tilesetData = JSON.parse(fs.readFileSync(tilesetPath, 'utf8'));

    // 1. Find hillHome IDs from the source tileset
    const hillHomeIds = new Set();
    if (tilesetData.tiles) {
        tilesetData.tiles.forEach(tile => {
            if (tile.properties) {
                const prop = tile.properties.find(p => p.name === 'hillHome');
                if (prop && prop.value === 'True') {
                    hillHomeIds.add(tile.id);
                }
            }
        });
    }

    console.log(`Found ${hillHomeIds.size} hillHome tiles in source tileset.`);

    // 2. Find the embedded tileset in the map
    const embeddedTileset = mapData.tilesets.find(t => t.name === 'Demo_tileset');
    if (!embeddedTileset) {
        console.error('Could not find embedded tileset "Demo_tileset" in map.');
        process.exit(1);
    }

    if (!embeddedTileset.tiles) {
        embeddedTileset.tiles = [];
    }

    // 3. Patch the embedded tileset
    let patchedCount = 0;
    hillHomeIds.forEach(id => {
        let tile = embeddedTileset.tiles.find(t => t.id === id);

        if (!tile) {
            // Create new tile entry if it doesn't exist
            tile = {
                id: id,
                properties: []
            };
            embeddedTileset.tiles.push(tile);
        }

        if (!tile.properties) {
            tile.properties = [];
        }

        const existingProp = tile.properties.find(p => p.name === 'hillHome');
        if (!existingProp) {
            tile.properties.push({
                name: 'hillHome',
                type: 'string',
                value: 'True'
            });
            patchedCount++;
        }
    });

    // Sort tiles by ID to keep it tidy (optional but good for diffs)
    embeddedTileset.tiles.sort((a, b) => a.id - b.id);

    console.log(`Patched ${patchedCount} tiles in Demo_Map.json.`);

    // 4. Write back
    fs.writeFileSync(mapPath, JSON.stringify(mapData, null, 1)); // Using 1 space indent to match original style roughly
    console.log('Successfully updated Demo_Map.json');

} catch (err) {
    console.error('Error patching map:', err);
}
