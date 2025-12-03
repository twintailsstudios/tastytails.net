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

// --- Database Connection ---
mongoose.connect(process.env.DB_CONNECT, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => log('Successfully connected to MongoDB!'))
  .catch(err => console.error('Database connection error:', err));

// --- View Engine Setup ---
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.set('layout', 'layouts/layout');

// --- Middleware ---
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

app.use('/api/user', authRoute);
app.use('/api/dbInterface', dbInterfaceRoute);
app.use('/', indexRoute);
app.use('/edit', editRoute);
app.use('/play', playRoute);


// --- Game and Socket.io Logic ---

// Start the lightweight game loop. It will handle its own game-related socket events.
serverGame.start(io);

// Set up a separate listener for chat-related events.
io.on('connection', (socket) => {
  log(`A user connected for chat: ${socket.id}`);

  // Handle chat events
  socket.on('getAllChats', (data) => getAllChats(data, socket));
  socket.on('input', (data) => addMessage(data, socket));
  socket.on('inputEdit', (data) => editMessage(data, socket));
  socket.on('deleteMessage', (data) => deleteMessage(data, socket));
  socket.on('sendSpoilEdit', (data) => changeSpoilerLabel(data, socket));
  socket.on('getOlderChats', (data) => getOlderChats(data, socket));
  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data);
  });

  // The 'disconnect' event is handled by the server-loop for players,
  // but a generic log here is fine too.
  socket.on('disconnect', () => {
    log(`Socket ${socket.id} disconnected.`);
  });
});


// --- Server Startup ---
const port = process.env.PORT || 3000;
http.listen(port, () => {
  log(`Server is live and listening on port ${port}!`);
});


// --- HELPER FUNCTIONS for CHAT ---
// NOTE: It's good practice to move these into their own module (e.g., 'chat-handler.js')

async function getAllChats(data, socket) {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const chats = await Chats.find({
      "message.time": { $gte: oneDayAgo }
    })
      .sort({ 'message.time': -1 })
      .limit(50);

    const allMsgs = chats.map(chat => ({
      _id: chat._id,
      name: chat.name,
      message: chat.message,
      spoiler: chat.spoiler,
      deleted: chat.deleted,
      identifier: chat.identifier.character
    }));
    socket.emit('output', allMsgs.reverse());
  } catch (e) {
    log('Error fetching all chats:', e);
  }
}

async function getOlderChats(data, socket) {
  try {
    const beforeTime = new Date(data.beforeTime);
    const chats = await Chats.find({
      "message.time": { $lt: beforeTime }
    })
      .sort({ 'message.time': -1 })
      .limit(50);

    const olderMsgs = chats.map(chat => ({
      _id: chat._id,
      name: chat.name,
      message: chat.message,
      spoiler: chat.spoiler,
      deleted: chat.deleted,
      identifier: chat.identifier.character
    }));
    socket.emit('olderChatsOutput', olderMsgs.reverse());
  } catch (e) {
    log('Error fetching older chats:', e);
  }
}

async function addMessage(data, socket) {
  function removeTags(str) {
    if (!str) return '';
    return str.toString().replace(/(<([^>]+)>)/ig, '');
  }

  const charCount = removeTags(data.message).length;
  if (charCount > 10000) {
    return socket.emit('tooManyChars', charCount, data.message);
  }

  try {
    const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);
    const result = new Chats({
      name: data.name,
      message: [{ content: urlify(data.message), time: new Date().toUTCString() }],
      spoiler: { status: data.spoiler, votes: { watersports: 0, disposal: 0, gore: 0 } },
      deleted: { status: false, deletionTime: null },
      identifier: { account: verified._id, character: data.charId }
    });
    await result.save();
    const clientMsg = {
      _id: result._id,
      name: result.name,
      message: result.message,
      spoiler: result.spoiler,
      deleted: result.deleted,
      identifier: result.identifier.character
    };
    io.emit('output', [clientMsg]);
  } catch (e) {
    log('Error adding message:', e);
  }
}

async function editMessage(data, socket) {
  try {
    const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);
    const result = await Chats.findById(data._id);

    if (result && result.identifier.account == verified._id && result.identifier.character == data.charId) {
      result.message.push({
        content: urlify(data.message),
        time: new Date().toUTCString()
      });
      await result.save();
      io.emit('editOutput', result);
    } else {
      log('Attempt to edit unauthorized message denied.');
    }
  } catch (e) {
    log('Error editing message:', e);
  }
}

async function deleteMessage(data, socket) {
  try {
    const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);
    const result = await Chats.findById(data._id);

    if (result && result.identifier.account == verified._id && result.identifier.character == data.charId) {
      result.deleted = {
        status: true,
        deletionTime: new Date().toUTCString()
      };
      await result.save();
      io.emit('editOutput', result);
    } else {
      log('Attempt to delete unauthorized message denied.');
    }
  } catch (e) {
    log('Error deleting message:', e);
  }
}

async function changeSpoilerLabel(data, socket) {
  try {
    const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);
    const result = await Chats.findById(data._id);

    if (result && result.identifier.account == verified._id && result.identifier.character == data.charId) {
      result.spoiler.status = data.spoiler;
      await result.save();
      io.emit('editSpoilerOutput', result);
    } else {
      log('Spoiler vote/change from unauthorized user.');
    }
  } catch (e) {
    log('Error changing spoiler label:', e);
  }
}

function urlify(text) {
  if (!text) return '';
  var urlRegex = /((?:(http|https|Http|Https|rtsp|Rtsp):\/\/(?:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,64}(?:\:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,25})?\@)?)?((?:(?:[a-zA-Z0-9][a-zA-Z0-9\-]{0,64}\.)+(?:(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])|(?:biz|b[abdefghijmnorstvwyz])|(?:cat|com|coop|c[acdfghiklmnoruvxyz])|d[ejkmoz]|(?:edu|e[cegrstu])|f[ijkmor]|(?:gov|g[abdefghilmnpqrstuwy])|h[kmnrtu]|(?:info|int|i[delmnoqrst])|(?:jobs|j[emop])|k[eghimnrwyz]|l[abcikrstuvy]|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])|(?:name|net|n[acefgilopruz])|(?:org|om)|(?:pro|p[aefghklmnrstwy])|qa|r[eouw]|s[abcdeghijklmnortuvyz]|(?:tel|travel|t[cdfghjklmnoprtvwz])|u[agkmsyz]|v[aceginu]|w[fs]|y[etu]|z[amw]))|(?:(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[0-9])))(?:\:\d{1,5})?)(\/(?:(?:[a-zA-Z0-9\;\/\?\:\@\&\=\#\~\-\.\+\!\*\'\(\)\,\_])|(?:\%[a-fA-F0-9]{2}))*)?(?:\b|$)+/gi;
  return text.replace(urlRegex, function (url) {
    const r = new RegExp('^(?:[a-z]+:)?//', 'i');
    if (r.test(url)) {
      return `<a href="${url}" target="_blank">${url}</a>`;
    } else {
      return `<a href="//${url}" target="_blank">${url}</a>`;
    }
  });
}

