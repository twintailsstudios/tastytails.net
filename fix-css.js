const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'client', 'css', 'crafting.css');
const appendPath = path.join(__dirname, 'src', 'client', 'css', 'crafting-pause.css');

try {
    const data = fs.readFileSync(cssPath, 'utf8');

    // Find the known last valid rule end
    // .theme-seamstress .restore-btn:hover { ... background: #e91e63; }

    const searchString = '.theme-seamstress .restore-btn:hover {';
    const index = data.lastIndexOf(searchString);

    if (index === -1) {
        console.error('Could not find anchor string!');
        process.exit(1);
    }

    // Search forward from there for the closing brace
    const closeBraceIndex = data.indexOf('}', index);

    if (closeBraceIndex === -1) {
        console.error('Could not find closing brace!');
        process.exit(1);
    }

    // Truncate everything after the closing brace
    const cleanContent = data.substring(0, closeBraceIndex + 1);

    // Read the new pause css
    const pauseCss = fs.readFileSync(appendPath, 'utf8');

    // Combine
    const finalContent = cleanContent + '\n' + pauseCss;

    // Write back
    fs.writeFileSync(cssPath, finalContent, 'utf8');

    console.log('Successfully repaired crafting.css');

} catch (err) {
    console.error('Error:', err);
    process.exit(1);
}
