require('babel-register')
const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const path = require('path')

const game = require('./managers/game').default

//const PlayerCharacter = require('./entities/player-character').default
const Message = require('./entities/message').default

var players = {};
var spawnAreas = null;
var random_tile = null;

const port = 3000

app.use('/', express.static(path.join(__dirname, 'client')))


io.on('connection', function (socket) {
  console.log('a user connected: ', socket.id);
  socket.on('join', (data)=>{
    socket.join(data.room);
    io.in(data.room).emit('message', `New User Joined ${data.room} root!`);
  });
  // create a new player and add it to our players object
  players[socket.id] = {
    x: 4820,
    y: 5020,
    playerId: socket.id,
    //username: null,
  };
  // asks player for map tile coordinates

  if (spawnAreas == null) {
    console.log('spawnAreas is empty');
    socket.emit('getMapData', spawnAreas);
    socket.on('sendMapData', function (tiles) {
      spawnAreas = tiles;
      //console.log('Spawn Areas = ', spawnAreas);
      random_tile = Math.floor((Math.random() * spawnAreas.length))
      //console.log('random_tile = ', spawnAreas[random_tile]);
      socket.emit('spawnLocation', spawnAreas, random_tile);
    });
  }else{
    //console.log('spawnAreas is not empty = ', spawnAreas);
    socket.emit('spawnLocation', spawnAreas, random_tile);
  }

  // send the players object to the new player
  socket.emit('currentPlayers', players);
  // update all other players of the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // when a player disconnects, remove them from our players object
  socket.on('disconnect', function () {
    console.log('user disconnected: ', socket.id);
    delete players[socket.id];
    // emit a message to all players to remove this player
    io.emit('message', 'User Disconnected');
    io.emit('disconnect', socket.id);
  });

  // when a player moves, update the player data
  socket.on('playerMovement', function (movementData) {
    players[socket.id].x = movementData.x;
    players[socket.id].y = movementData.y;
    console.log('Player ID: ', socket.id, '     X: ', Math.round(players[socket.id].x), '     Y: ', Math.round(players[socket.id].y));
    // emit a message to all players about the player that moved
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });

  socket.on('avatarSelected', function (avatarSave) {
    players[socket.id].head = avatarSave.head;
    players[socket.id].body = avatarSave.body;
    players[socket.id].username = avatarSave.username;
    players[socket.id].descrip = avatarSave.descrip;
    players[socket.id].headColor = avatarSave.headColor;
    players[socket.id].bodyColor = avatarSave.bodyColor;
    console.log('Player ID: ', socket.id, 'has chosen: ', '\n', 'username = ', players[socket.id].username, '\n', 'avatar.head = ', players[socket.id].head, '\n', 'avatar.body = ', players[socket.id].body,  '\n', 'Head Color = ', players[socket.id].headColor, '\n', 'Body Color =', players[socket.id].bodyColor, '\n', 'Description = ', players[socket.id].descrip);
    // emit a message to all players about the updated player avatar
    socket.broadcast.emit('avatarSelection', players[socket.id]);
  });

  socket.on('message', (data) => {
    //console.log('players variable = ', players);
    //console.log('socket.id variable = ', socket.id);
    //console.log('players[socket.id] variable = ', players[socket.id]);
    console.log(players[socket.id].username);
  io.in(data.room).emit('message', data.msg, players[socket.id].username);

  //let author = game.user.all[socket.id]
  //let type = (data.type === 'ooc' || data.type === 'rp' ? data.type : null)
  //game.chat.add(new Message(author, data.type, data.content))
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
