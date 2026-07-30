/**
 * @fileoverview Main Server Application Entry Point - TastyTails.net
 * 
 * @description
 * Primary application bootstrapper. Orchestrates the Express HTTP server,
 * Socket.IO real-time WebSocket server, Mongoose MongoDB connectivity,
 * security/compression middleware, REST routing, real-time chat routing,
 * and the core server-side game tick loop.
 * 
 * Triggered by: `npm start` / `node src/index.js`
 */

// Basic server and database requirements
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const jwt = require('jsonwebtoken');
const ObjectId = require('mongodb').ObjectID;

// Logging and Models
const log = require('./logger');
const Chats = require('./model/Chat');
const User = require('./model/User');
const monitoring = require('./server/monitoring');

// NEW: Import our lightweight game loop!
const serverGame = require('./server-loop');

dotenv.config();

// --- Graceful Shutdown Logic ---
let isShuttingDown = false;

/**
 * Initiates an idempotent, graceful shutdown of the server process.
 * Notifies connected Socket.IO clients of a critical server error before exiting.
 * 
 * @param {string} reason - The trigger reason (e.g. 'Uncaught Exception', 'Unhandled Rejection', 'Database Failure').
 * @param {Error} [err] - Optional error object causing the shutdown.
 */
const gracefulShutdown = (reason, err) => {
  log.error(`CRITICAL ERROR (${reason}): Initiating graceful shutdown...`, err);

  if (isShuttingDown) {
    return; // Guard against recursive shutdown calls
  }
  isShuttingDown = true;

  // Notify connected clients (if possible)
  if (io) {
    log.important('Notifying players of critical server error...');
    try {
      io.emit('serverCriticalError', {
        message: 'The server has encountered a critical error and is restarting. Please reconnect in a moment.',
        reason: reason
      });
    } catch (emitErr) {
      log.error('Failed to broadcast critical shutdown message:', emitErr);
    }
  }

  // Give the server a moment to send the email/logs/socket-events before dying
  setTimeout(() => {
    log.important('Exiting process now.');
    process.exit(1);
  }, 1000);

  // Force exit backup timer if event loop hangs
  setTimeout(() => {
    process.exit(1);
  }, 3000).unref();
};

// --- Global Error Handlers ---
process.on('uncaughtException', (err) => {
  gracefulShutdown('Uncaught Exception', err);
});

process.on('unhandledRejection', (err) => {
  gracefulShutdown('Unhandled Rejection', err);
});

// --- DEBUGGING BLOCK ---
// console.log("------------------------------------------------");
// console.log("🔍 DEBUGGING ENVIRONMENT VARIABLES:");
// console.log("1. Current Directory:", __dirname);
// console.log("2. DB_CONNECT is type:", typeof process.env.DB_CONNECT);
// if (process.env.DB_CONNECT) {
//   console.log("3. DB_CONNECT length:", process.env.DB_CONNECT.length);
//   console.log("4. DB_CONNECT starts with:", process.env.DB_CONNECT.substring(0, 15) + "...");
// } else {
//   console.log("3. DB_CONNECT is STRICTLY UNDEFINED");
// }
// console.log("------------------------------------------------");
// ---------------------------------

// --- Database Connection ---
const DatabaseResilience = require('./classes/DatabaseResilience');

mongoose.connect(process.env.DB_CONNECT)
  .then(() => log.success('Successfully connected to MongoDB!'))
  .catch(err => gracefulShutdown('Database Connection Failed', err));

mongoose.connection.on('error', (err) => {
  log.error('Runtime MongoDB Error:', err);
  // Optional: Decide if every db error is fatal. For now, we assume yes if it's a connection error.
  // gracefulShutdown('Database Error', err); 
});



// --- View Engine Setup ---
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.set('layout', 'layouts/layout');

// --- Middleware ---
// Security Middleware
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for now to prevent breaking inline scripts/assets
}));
// Compression Middleware
const compression = require('compression');
app.use(compression());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(expressLayouts);
// Serve static files from 'client' and 'public' directories
const ONE_HOUR_MS = 3600000;
app.use(express.static(path.join(__dirname, 'client'), { maxAge: ONE_HOUR_MS }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: ONE_HOUR_MS }));

// --- Routes ---
const authRoute = require('./routes/auth');
const dbInterfaceRoute = require('./routes/dbInterface');
const indexRoute = require('./routes/index');
const editRoute = require('./routes/edit');
const playRoute = require('./routes/play');



app.use('/api/user', authRoute);
app.use('/api/dbInterface', dbInterfaceRoute);
app.use('/', indexRoute);
app.use('/edit', editRoute);
app.use('/play', playRoute);
app.use('/api/chat-archives', require('./routes/chatArchives'));

// --- Monitoring Endpoint ---
app.get('/stats', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json(monitoring.getStats());
});

/**
 * GET /api/valid-point
 * Generates valid, non-colliding spawn coordinates within a quadrilateral bounding box.
 * 
 * @query {number} tlx, tly - Top-Left Quad coordinates
 * @query {number} trx, try - Top-Right Quad coordinates
 * @query {number} blx, bly - Bottom-Left Quad coordinates
 * @query {number} brx, bry - Bottom-Right Quad coordinates
 * @returns {Object} JSON object with { x, y, success: boolean }
 */
app.get('/api/valid-point', (req, res) => {
  const tlx = parseFloat(req.query.tlx);
  const tly = parseFloat(req.query.tly);
  const trx = parseFloat(req.query.trx);
  const try_ = parseFloat(req.query.try);
  const blx = parseFloat(req.query.blx);
  const bly = parseFloat(req.query.bly);
  const brx = parseFloat(req.query.brx);
  const bry = parseFloat(req.query.bry);

  if (isNaN(tlx) || isNaN(tly) || isNaN(trx) || isNaN(try_) || isNaN(blx) || isNaN(bly) || isNaN(brx) || isNaN(bry)) {
    return res.status(400).json({ error: 'Missing or invalid coordinate parameters.' });
  }

  // Bilinear interpolation validation loop
  let attempts = 0;
  const players = serverGame.getAllPlayers() || {};

  // Pre-extract immutable coordinate snapshots to prevent concurrency race conditions
  const playerPositions = [];
  for (const id in players) {
    const p = players[id];
    if (p && p.position && typeof p.position.x === 'number' && typeof p.position.y === 'number') {
      playerPositions.push({ x: p.position.x, y: p.position.y });
    }
  }

  while (attempts < 100) {
    const u = Math.random();
    const v = Math.random();
    const x = Math.round((1 - u) * (1 - v) * tlx + u * (1 - v) * trx + (1 - u) * v * blx + u * v * brx);
    const y = Math.round((1 - u) * (1 - v) * tly + u * (1 - v) * try_ + (1 - u) * v * bly + u * v * bry);

    if (!serverGame.checkPointCollision(x, y)) {
      let tooClose = false;
      for (let i = 0; i < playerPositions.length; i++) {
        const pos = playerPositions[i];
        const dx = pos.x - x;
        const dy = pos.y - y;
        if (dx * dx + dy * dy < 256) { // 16px minimum distance
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        return res.json({ x, y, success: true });
      }
    }
    attempts++;
  }

  // Fallback to center of the quad
  let centerX = Math.round((tlx + trx + blx + brx) / 4);
  let centerY = Math.round((tly + try_ + bly + bry) / 4);

  // If center collides, attempt a small 16px cardinal search to find a non-colliding fallback
  if (serverGame.checkPointCollision(centerX, centerY)) {
    const offsets = [[16, 0], [-16, 0], [0, 16], [0, -16]];
    for (const [ox, oy] of offsets) {
      if (!serverGame.checkPointCollision(centerX + ox, centerY + oy)) {
        centerX += ox;
        centerY += oy;
        break;
      }
    }
  }

  res.json({ x: centerX, y: centerY, success: false });
});

// --- Global Middleware Error Handler ---
app.use((err, req, res, next) => {
  log.error(`Unhandled Express Error on path: ${req.path}`, err);
  res.status(500).send('Something broke!');
});


// --- Game and Socket.io Logic ---

const MessageSystem = require('./classes/MessageSystem');
const messageSystem = new MessageSystem(io);

// Initialize Resilience Module with Mongoose, Shutdown Callback, and Socket.IO
// Moved here to ensure 'io' is defined.
DatabaseResilience.init(mongoose, gracefulShutdown, io);

// Start the lightweight game loop. It will handle its own game-related socket events.
serverGame.start(io, messageSystem);

// Set up a separate listener for chat-related events.
io.on('connection', (socket) => {
  log.info(`A user connected for chat: ${socket.id}`);

  // Handle chat events
  // Use MessageSystem to handle all incoming chat messages.
  messageSystem.setupSocketListeners(socket);

  // Allow test client bots to report action success/failure stats
  socket.on('reportAction', (data) => {
    if (data && data.actionType) {
      monitoring.recordAction(data.actionType, !!data.success);
    }
  });

  // The 'disconnect' event is handled by the server-loop for players,
  // but a generic log here is fine too.
  socket.on('disconnect', () => {
    log.info(`Socket ${socket.id} disconnected.`);
  });
});


// --- Server Startup ---
const port = process.env.PORT || 3000;
http.listen(port, () => {
  log.highlight('SERVER PORT', port);
  log.success(`Server is live and listening on port ${port}!`);
});


// --- HELPER FUNCTIONS for CHAT ---
// See src/classes/MessageSystem.js for chat logic.

