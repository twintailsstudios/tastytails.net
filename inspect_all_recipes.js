const itemData = require('./src/data/itemData');
let recipes = {};

try {
    const recipesData = require('./src/data/recipes');
    recipes = { ...recipesData };

    Object.entries(itemData).forEach(([itemId, def]) => {
        if (def.recipe) {
            const station = def.recipe.station;
            if (!recipes[station]) recipes[station] = [];

            const recipeId = def.recipe.id || itemId;
            const exists = recipes[station].some(r => r.id === recipeId);

            if (!exists) {
                recipes[station].push({
                    id: recipeId,
                    name: def.name,
                    description: def.description || def.flavor || '',
                    ingredients: def.recipe.ingredients,
                    result: def.recipe.result || { itemId: itemId, count: def.recipe.count || 1 },
                    time: def.recipe.time || 3000,
                    icon: def.recipe.icon || def.icon || 'fa-solid fa-cube',
                    validateOnly: def.recipe.validateOnly || false,
                    customData: def.recipe.customData || undefined
                });
            }
        }
    });
    for (const [station, list] of Object.entries(recipes)) {
        console.log(`=== Recipes for ${station} ===`);
        list.forEach(r => {
            console.log(`- ${r.id} (${r.name}): ingredients: ${JSON.stringify(r.ingredients)}, result: ${JSON.stringify(r.result)}`);
        });
        console.log("");
    }
} catch (e) {
    console.error('Failed to load recipes', e);
}
