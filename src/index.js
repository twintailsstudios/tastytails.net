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
/*var spawnAreas = null;
var random_tile = null;
var spell0 = {Name:"Spell #0", Description:"This is the zeroth spell", Icon:"scroll2", x:"", y:"", Action:"action_0"};
var spell1 = {Name:"Spell #1", Description:"This is the first spell", Icon:"scroll2", x:"", y:"", Action:"action_1"};
var spell2 = {Name:"Spell #2", Description:"This is the second spell", Icon:"scroll2", x:"", y:"", Action:"action_2"};

var spells = [spell0, spell1, spell2];*/

const port = 3000

app.use('/', express.static(path.join(__dirname, 'client')))

const tilemap = require('./client/assets/tilemaps/level2.json');
//console.log(tilemap.layers);
let blockingLayer = {};
let spawningLayer = {};
let remainder = {};
let division = {};
let spawnLocation = [];

for (let i = 0; i < tilemap.layers.length; i++) {
  let layer = tilemap.layers[i];
  if (layer.name === 'blocked') {
    blockingLayer = layer;
  }
  if (layer.name === 'spawn') {
    spawningLayer = layer;
  }
}
for (let info = 0; info < spawningLayer.data.length; info++) {
  let spawnTile = spawningLayer.data[info];
  if (spawnTile > 0) {
    remainder = (Math.floor(Math.floor(info % 200) * 48));
    division = (Math.floor(Math.floor(Math.floor(info) / 200)) * 48);
    spawnLocation.push({ x: remainder + 24, y: division + 24 })
    //console.log('info = ', info, 'remainder = ', remainder, 'division = ', division, 'spawnTile = ', spawnTile);
  }
}
//console.log('spawnLocaiton: ', spawnLocation);

var spell0 = {Identifier:"spell", Name:"Spell #0", Description:"This is the zeroth spell", Icon:"scroll2", x:"", y:"", Action:"action_0"};
var spell1 = {Identifier:"spell", Name:"Spell #1", Description:"This is the first spell", Icon:"scroll2", x:"", y:"", Action:"action_1"};
var spell2 = {Identifier:"spell", Name:"Spell #2", Description:"This is the second spell", Icon:"scroll2", x:"", y:"", Action:"action_2"};

var spells = [spell0, spell1, spell2];
var random_tile = null;
  random_tile = Math.floor((Math.random() * spawnLocation.length))
    spells[0].x = spawnLocation[random_tile].x
    spells[0].y = spawnLocation[random_tile].y
    console.log('spells[0] = ', spells[0].x, spells[0].y);

  random_tile = Math.floor((Math.random() * spawnLocation.length))
    spells[1].x = spawnLocation[random_tile].x
    spells[1].y = spawnLocation[random_tile].y
    console.log('spells[1] = ', spells[1].x, spells[1].y);

  random_tile = Math.floor((Math.random() * spawnLocation.length))
    spells[2].x = spawnLocation[random_tile].x
    spells[2].y = spawnLocation[random_tile].y
    console.log('spells[2] = ', spells[2].x, spells[2].y);


io.on('connection', function (socket) {
  console.log('a user connected: ', socket.id);
  socket.on('join', (data)=>{
    socket.join(data.room);
    io.in(data.room).emit('message', `New User Joined ${data.room} root!`);
  });
  // create a new player and add it to our players object
  players[socket.id] = {
    Identifier:"player",
    playerId: socket.id,
    Username:"",
    Description:"",
    headColor:"",
    bodyColor:"",
    specialList:[],
    spellInventory:[],
    x: 4820,
    y: 5020,
  };


  // send the players object to the new player
  socket.emit('currentPlayers', players, spells);
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
  socket.on('movementLeft', function (playerId) {
    //console.log(playerId);
    if (playerId === players[socket.id].playerId) {
      var temporary = {
        x: players[socket.id].x,
        y: players[socket.id].y,
      };
      temporary.x = temporary.x - 2.5;
      //console.log(players[socket.id]);
      collision(players[socket.id].x, players[socket.id].y, temporary.x, temporary.y);
    }
  })
  socket.on('movementRight', function (playerId) {
    //console.log(playerId);
    if (playerId === players[socket.id].playerId) {
      var temporary = {
        x: players[socket.id].x,
        y: players[socket.id].y,
      };
      temporary.x = temporary.x + 2.5;
      //console.log(players[socket.id]);
      collision(players[socket.id].x, players[socket.id].y, temporary.x, temporary.y);
    }
  })
  socket.on('movementUp', function (playerId) {
    //console.log(playerId);
    if (playerId === players[socket.id].playerId) {
      var temporary = {
        x: players[socket.id].x,
        y: players[socket.id].y,
      };
      temporary.y = temporary.y - 2.5;
      //console.log(players[socket.id]);
      collision(players[socket.id].x, players[socket.id].y, temporary.x, temporary.y);
    }
  })
  socket.on('movementDown', function (playerId) {
    //console.log(playerId);
    if (playerId === players[socket.id].playerId) {
      var temporary = {
        x: players[socket.id].x,
        y: players[socket.id].y,
      };
      temporary.y = temporary.y + 2.5;
      //console.log(players[socket.id]);
      collision(players[socket.id].x, players[socket.id].y, temporary.x, temporary.y);
    }
  })

  function collision (x, y, tempX, tempY) {
    //console.log('collision function called');
    //console.log(x, y);
    //console.log('X: ', (Math.ceil(Math.ceil(x) / 200)) , 'Y: ', (Math.ceil(Math.ceil(y) / 200)));
    //console.log('blockingLayer', blockingLayer.data);
    //console.log('leingth', blockingLayer.data.length);
    //console.log('blockingLayer.data: ', blockingLayer.data[(Math.ceil(Math.ceil(Math.ceil(tempY) / 48)) * 200) + (Math.ceil(Math.ceil(tempX - 48) / 48))] - 1);
    if (blockingLayer.data[(Math.ceil(Math.ceil(Math.ceil(tempY) / 48)) * 200) + (Math.floor(Math.floor(tempX) / 48))] - 1 > 0) {
      //console.log('blocked');
      return;
    } else {
      players[socket.id].x = tempX
      players[socket.id].y = tempY
      io.sockets.emit('playerMoved', players[socket.id]);
    }
  }

  socket.on('examineClicked', function (clicked) {
    console.log('Examine clicked.Identifier = ', clicked.Identifier);
    if (clicked.Identifier === 'spell') {
      for (let i = 0; i < spells.length; i++) {
        if (clicked.Name === spells[i].Name)  {
          let examinedItem = spells[i];
          socket.emit('examinedInfo', examinedItem);
        }
      }
    }
    if (clicked.Identifier === 'player') {
      //console.log('clicked.playerId = ', clicked.playerId);
      //console.log('players = ', players);
      //console.log('Object.keys(players).length = ', Object.keys(players).length);
      Object.keys(players).forEach(function(p)  {
        if (clicked.playerId === players[p].playerId)  {
          let examinedItem = players[p];
          //console.log('examinedItem = ', examinedItem)
          socket.emit('examinedInfo', examinedItem);
        }
      });
    }
      //if (spellInfo.locationX - self.avatar.head.x >= -100 && spellInfo.locationX - self.avatar.head.x <= 100 && spellInfo.locationY - self.avatar.head.y >= -100 && spellInfo.locationY - self.avatar.head.y <= 100)
  })

  socket.on('pickUpClicked', function (clicked) {
    //console.log('Pick Up clicked.Identifier = ', clicked.Identifier);
    if (clicked.Identifier === 'spell') {
      for (let i = 0; i < spells.length; i++) {
        if (clicked.Name === spells[i].Name)  {
          let pickedUpItem = spells[i];
          if (pickedUpItem.x - players[socket.id].x >= -100 && pickedUpItem.x - players[socket.id].x <= 100 && pickedUpItem.y - players[socket.id].y >= -100 && pickedUpItem.y - players[socket.id].y <= 100) {
            console.log('in range to pick up item');
            players[socket.id].spellInventory.push(pickedUpItem);
            //console.log('players[socket.id].spellInventory = ', players[socket.id].spellInventory);
            socket.emit('pickedUpItem', players[socket.id].spellInventory);
          }else {
            console.log('NOT in range to pick up item');
            //socket.emit('examinedInfo', examinedItem);
          }
        }
      }
    }
    if (clicked.Identifier === 'player') {
      //console.log('clicked.playerId = ', clicked.playerId);
      //console.log('players = ', players);
      //console.log('Object.keys(players).length = ', Object.keys(players).length);
      Object.keys(players).forEach(function(p)  {
        if (clicked.playerId === players[p].playerId)  {
          let pickedUpItem = players[p];
          console.log('Attempting to pick up player = ', pickedUpItem.Username);
          //socket.emit('examinedInfo', examinedItem);
        }
      });
    }
      //if (spellInfo.locationX - self.avatar.head.x >= -100 && spellInfo.locationX - self.avatar.head.x <= 100 && spellInfo.locationY - self.avatar.head.y >= -100 && spellInfo.locationY - self.avatar.head.y <= 100)
  })

  socket.on('specialCreateBttnSelected', function (voreInfo){
    //console.log('voreInfo from player = ', voreInfo);
    players[socket.id].specialList.push(voreInfo);
    console.log('Addition to ', players[socket.id].Username, 's custom vore options = ', players[socket.id].specialList[players[socket.id].specialList.length -1]);
    socket.emit('newVoreAction', players[socket.id].specialList[players[socket.id].specialList.length -1]);
  })

  socket.on('voreActionClicked', function (clicked, voreAttempt) {
    console.log('Vore Action clicked.Identifier = ', clicked.Identifier);
    if (clicked.Identifier === 'player') {
      Object.keys(players).forEach(function(p)  {
        if (clicked.playerId === players[p].playerId)  {
          let preyAttempt = players[p];
          if (preyAttempt.x - players[socket.id].x >= -100 && preyAttempt.x - players[socket.id].x <= 100 && preyAttempt.y - players[socket.id].y >= -100 && preyAttempt.y - players[socket.id].y <= 100) {
            for (let i = 0; i < players[socket.id].specialList.length; i++) {
              //console.log('players[socket.id].specialList[i]', players[socket.id].specialList[i]);
              //console.log('voreAttempt', voreAttempt);
              if (players[socket.id].specialList[i].Name === voreAttempt.Name && players[socket.id].specialList[i].Verb === voreAttempt.Verb && players[socket.id].specialList[i].Descrip === voreAttempt.Descrip) {
                //console.log(players[socket.id].Username, ' is attempting to', players[socket.id].specialList[i].Verb, ' ', preyAttempt.Username, ' into their ', players[socket.id].specialList[i].Name);
                var msg = players[socket.id].Username + ' is attempting to ' + players[socket.id].specialList[i].Verb + ' ' + preyAttempt.Username + ' into their ' + players[socket.id].specialList[i].Name;
                console.log('msg = ', msg);
                io.sockets.emit('message', msg);
              }
            }
          } else {
            console.log('Too Far Away From Player: ', preyAttempt.Username, ' To Vore Them');
          }
        }
      });
    }
  })



  socket.on('avatarSelected', function (avatarSave) {
    players[socket.id].head = avatarSave.head;
    players[socket.id].body = avatarSave.body;
    players[socket.id].Username = avatarSave.username;
    players[socket.id].Description = avatarSave.descrip;
    players[socket.id].headColor = avatarSave.headColor;
    players[socket.id].bodyColor = avatarSave.bodyColor;
    console.log('Player ID: ', socket.id, 'has chosen: ', '\n', 'Username = ', players[socket.id].Username, '\n', 'Description = ', players[socket.id].Description, '\n', 'avatar.head = ', players[socket.id].head, '\n', 'avatar.body = ', players[socket.id].body,  '\n', 'Head Color = ', players[socket.id].headColor, '\n', 'Body Color =', players[socket.id].bodyColor);
    // emit a message to all players about the updated player avatar
    socket.broadcast.emit('avatarSelection', players[socket.id]);
  });

  socket.on('message', (data) => {
    //console.log('players variable = ', players);
    //console.log('socket.id variable = ', socket.id);
    //console.log('players[socket.id] variable = ', players[socket.id]);
    console.log(players[socket.id].Username);
    io.in(data.room).emit('message', data.msg, players[socket.id].Username);

    //let author = game.user.all[socket.id]
    //let type = (data.type === 'ooc' || data.type === 'rp' ? data.type : null)
    //game.chat.add(new Message(author, data.type, data.content))
  });
});

http.listen(port, () => console.log('Listening on port 3000!'))
