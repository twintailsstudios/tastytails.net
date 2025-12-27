/**
 * mapConfig.js
 * 
 * CENTRAL CONFIGURATION for the active map.
 * This file is shared/used by both the Server (to load collision data)
 * and the Client (to load visual tiles and objects).
 * 
 * To change the map:
 * 1. Ensure the new .json file is in 'src/client/assets/tilemaps/'
 * 2. Update 'mapFilename' below.
 * 3. Restart the server.
 */
module.exports = {
    // The filename of the current map file in src/client/assets/tilemaps/
    mapFilename: 'alpha_map.json'
};
