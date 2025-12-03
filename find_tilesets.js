const fs = require('fs');
const path = require('path');

const mapPath = 'c:/Users/kkmcl/Documents/GitHub/tastytails.net/Map_Testing/Demo_Map.json';
const content = fs.readFileSync(mapPath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('"tilesets"')) {
        console.log(`Found "tilesets" at line ${index + 1}`);
    }
});
