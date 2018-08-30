require('babel-register')
const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const path = require('path')

const game = require('./managers/game').default

const PlayerCharacter = require('./entities/player-character').default
const Message = require('./entities/message').default

var players = {};

const port = 3000

app.use('/', express.static(path.join(__dirname, 'client')))


io.on('connection', function (socket) {
  console.log('a user connected: ', socket.id);
  // create a new player and add it to our players object
  players[socket.id] = {
    x: Math.floor(Math.random() * 700) + 50,
    y: Math.floor(Math.random() * 500) + 50,
    playerId: socket.id,
  };
  // send the players object to the new player
  socket.emit('currentPlayers', players);
  // update all other players of the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // when a player disconnects, remove them from our players object
  socket.on('disconnect', function () {
    console.log('user disconnected: ', socket.id);
    delete players[socket.id];
    // emit a message to all players to remove this player
    io.emit('disconnect', socket.id);
  });

  // when a player moves, update the player data
  socket.on('playerMovement', function (movementData) {
    players[socket.id].x = movementData.x;
    players[socket.id].y = movementData.y;
    // emit a message to all players about the player that moved
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });
  socket.on('message', (data) => {
  let author = game.user.all[socket.id]
  let type = (data.type === 'ooc' || data.type === 'rp' ? data.type : null)
  game.chat.add(new Message(author, data.type, data.content))
});

});

/*io.on('connection', socket => {
  console.log('user connected', socket.id)
  let user = game.user.add(socket.id)
  socket.broadcast.emit('player join', {id: socket.id, skin: user.character.skin, position: user.character.position})



  socket.on('update velocity', (data) => {
    if (!!data.velocity) {
      console.log('character moved! data.velocity = ', data.velocity);
      user.character.velocity = data.velocity
      socket.broadcast.emit('update velocity', {id: socket.id, velocity: data.velocity})
    }
  })

  socket.on('update position', (data) => {
    if (!!data.position) {
      // ...
    }
  })

  socket.on('disconnect', () => {
    io.emit('user disconnected')
    console.log('user disconnected', socket.id)
  })
})*/

http.listen(port, () => console.log('Listening on port 3000!'))
