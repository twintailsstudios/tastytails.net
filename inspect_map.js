const fs = require('fs');
const path = 'src/client/assets/tilemaps/alpha_map.json';

try {
    const data = fs.readFileSync(path, 'utf8');
    const map = JSON.parse(data);

    if (map.tilesets) {
        console.log("Tilesets found:", map.tilesets.length);
        map.tilesets.forEach(ts => {
            if (ts.name === 'sheep' || ts.name.includes('animal')) {
                console.log("--- Sheep/Animal Tileset ---");
                console.log("Name:", ts.name);
                console.log("Image:", ts.image);
                console.log("Tile Count:", ts.tilecount);
                console.log("Tile Width/Height:", ts.tilewidth, ts.tileheight);
                console.log("First GID:", ts.firstgid);
                if (ts.tiles) {
                    console.log("Custom Properties on tiles:");
                    ts.tiles.forEach(t => {
                        console.log(`  Tile ID ${t.id}:`, t.properties);
                    });
                }
            }
        });
    } else {
        console.log("No tilesets found.");
    }

    if (map.layers) {
        const animalLayer = map.layers.find(l => l.name === 'animals');
        if (animalLayer) {
            console.log("\n--- Animals Layer ---");
            console.log("Type:", animalLayer.type);
            if (animalLayer.objects) {
                console.log("Objects in layer:", animalLayer.objects.length);
                animalLayer.objects.forEach(obj => {
                    console.log("Object:", obj);
                });
            }
        } else {
            console.log("\nAnimals layer not found.");
        }
    }

} catch (err) {
    console.error("Error reading file:", err);
}
