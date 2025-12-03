const fs = require('fs');
const path = require('path');

const tilesetPath = 'c:/Users/kkmcl/Documents/GitHub/tastytails.net/Map_Testing/Demo_tileset.json';
const tilesetData = JSON.parse(fs.readFileSync(tilesetPath, 'utf8'));

const hillHomeIds = [];
if (tilesetData.tiles) {
    tilesetData.tiles.forEach(tile => {
        if (tile.properties) {
            const prop = tile.properties.find(p => p.name === 'hillHome');
            if (prop) {
                hillHomeIds.push({ id: tile.id, value: prop.value });
            }
        }
    });
}

console.log('HillHome Tile IDs:', JSON.stringify(hillHomeIds, null, 2));
