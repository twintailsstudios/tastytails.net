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

// NEW: Import our lightweight game loop!
const serverGame = require('./server-loop');

dotenv.config();

// --- Graceful Shutdown Logic ---
const gracefulShutdown = (reason, err) => {
  log.error(`CRITICAL ERROR (${reason}): Initiating graceful shutdown...`, err);

  // Notify connected clients (if possible)
  if (io) {
    log.important('Notifying players of critical server error...');
    io.emit('serverCriticalError', {
      message: 'The server has encountered a critical error and is restarting. Please reconnect in a moment.',
      reason: reason
    });
  }

  // Give the server a moment to send the email/logs/socket-events before dying
  setTimeout(() => {
    log.important('Exiting process now.');
    process.exit(1);
  }, 1000);
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
mongoose.connect(process.env.DB_CONNECT)
  .then(() => log.success('Successfully connected to MongoDB!'))
  .catch(err => gracefulShutdown('Database Connection Failed', err));

mongoose.connection.on('error', (err) => {
  log.error('Runtime MongoDB Error:', err);
  // Optional: Decide if every db error is fatal. For now, we assume yes if it's a connection error.
  // gracefulShutdown('Database Error', err); 
});

mongoose.connection.on('disconnected', () => {
  log.warn('MongoDB Disconnected!');
  // If we lose DB, the game state is likely invalid. Restarting is safer.
  gracefulShutdown('Database Disconnected', new Error('Connection to MongoDB lost'));
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
// Serve static files from the 'client' directory
app.use(express.static(path.join(__dirname, 'client')));

// --- Routes ---
const authRoute = require('./routes/auth');
const dbInterfaceRoute = require('./routes/dbInterface');
const indexRoute = require('./routes/index');
const editRoute = require('./routes/edit');
const playRoute = require('./routes/play');

// --- Global Middleware Error Handler ---
app.use((err, req, res, next) => {
  log.error(`Unhandled Express Error on path: ${req.path}`, err);
  res.status(500).send('Something broke!');
});

app.use('/api/user', authRoute);
app.use('/api/dbInterface', dbInterfaceRoute);
app.use('/', indexRoute);
app.use('/edit', editRoute);
app.use('/play', playRoute);

// --- Global Middleware Error Handler ---
app.use((err, req, res, next) => {
  log.error(`Unhandled Express Error on path: ${req.path}`, err);
  res.status(500).send('Something broke!');
});


// --- Game and Socket.io Logic ---

const MessageSystem = require('./classes/MessageSystem');
const messageSystem = new MessageSystem(io);

// Start the lightweight game loop. It will handle its own game-related socket events.
serverGame.start(io, messageSystem);

// Set up a separate listener for chat-related events.
io.on('connection', (socket) => {
  log.info(`A user connected for chat: ${socket.id}`);

  // Handle chat events
  // Use MessageSystem to handle all incoming chat messages.
  messageSystem.setupSocketListeners(socket);

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

