const fs = require('fs');
try {
    require('./server-loop');
    console.log('PASS: server-loop syntax');
    require('./sockets/inventoryHandlers');
    console.log('PASS: inventoryHandlers syntax');
    require('./sockets/voreHandlers');
    console.log('PASS: voreHandlers syntax');
    require('./sockets/interactionHandlers');
    console.log('PASS: interactionHandlers syntax');
} catch (e) {
    console.error('FAIL:', e);
    process.exit(1);
}
