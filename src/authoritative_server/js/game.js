// const express = require('express');
// const app = express()
// const jwt = require('jsonwebtoken');
//
// app.use(express.json());

var players = {};
var spell0 = {Identifier:"spell", Name:"Spell #0", Description:"This is the zeroth spell", Icon:"scroll2", x:"", y:"", Action:"action_0"};
var spell1 = {Identifier:"spell", Name:"Spell #1", Description:"This is the first spell", Icon:"scroll2", x:"", y:"", Action:"action_1"};
var spell2 = {Identifier:"spell", Name:"Spell #2", Description:"This is the second spell", Icon:"scroll2", x:"", y:"", Action:"action_2"};

var spells = [spell0, spell1, spell2];
let spawnLocations = [
  {x: 5064, y: 4824},
  { x: 5112, y: 4824 },
  { x: 4584, y: 4872 },
  { x: 5064, y: 4872 },
  { x: 5112, y: 4872 },
  { x: 4728, y: 5016 },
  { x: 4920, y: 5016 },
  { x: 5064, y: 5016 },
  { x: 5112, y: 5016 },
  { x: 4728, y: 5064 },
  { x: 4776, y: 5064 },
  { x: 4824, y: 5064 },
  { x: 4872, y: 5064 },
  { x: 4920, y: 5064 },
  { x: 5064, y: 5064 },
  { x: 5112, y: 5064 },
  { x: 4632, y: 5208 },
  { x: 4680, y: 5208 },
  { x: 4728, y: 5208 },
  { x: 4920, y: 5208 },
  { x: 4632, y: 5256 },
  { x: 4680, y: 5256 },
  { x: 4728, y: 5256 },
  { x: 4632, y: 5304 },
  { x: 4680, y: 5304 },
  { x: 4728, y: 5304 },
  { x: 4632, y: 5352 },
  { x: 4680, y: 5352 },
  { x: 4728, y: 5352 }
];
let blockingLayers = [
  0, 0, 21100, 0
];
//console.log('spawnLocations = ', spawnLocations);

var random_tile = null;
  random_tile = Math.floor((Math.random() * spawnLocations.length))
    spells[0].x = spawnLocations[random_tile].x
    spells[0].y = spawnLocations[random_tile].y
    console.log('spells[0] = ', spells[0].x, spells[0].y);

  random_tile = Math.floor((Math.random() * spawnLocations.length))
    spells[1].x = spawnLocations[random_tile].x
    spells[1].y = spawnLocations[random_tile].y
    console.log('spells[1] = ', spells[1].x, spells[1].y);

  random_tile = Math.floor((Math.random() * spawnLocations.length))
    spells[2].x = spawnLocations[random_tile].x
    spells[2].y = spawnLocations[random_tile].y
    console.log('spells[2] = ', spells[2].x, spells[2].y);

const config = {
  autoFocus: false,
  type: Phaser.HEADLESS,
  parent: 'phaser-example',
  width: 800,
  height: 930,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

console.log('ServerSide Authoritative Phaser Instance is Running...');

function preload() {
  console.log('Preloading Assets Serverside...');
  //this.load.image('spritesheet', './assets/images/spritesheet.png');
  this.load.image('tileset', './assets/tilemaps/tileset.png');
  this.load.image('scroll', './assets/images/Scroll_01.png')
  this.load.image('scroll2', './assets/images/Scroll_02.png')

  this.load.spritesheet('empty', './assets/spritesheets/empty.png', {frameWidth: 109, frameHeight: 220});
  this.load.spritesheet('head_01', './assets/spritesheets/head_01.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('head_02', './assets/spritesheets/head_02.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('head_03', './assets/spritesheets/head_03.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('body_01', './assets/spritesheets/body_01.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('tail_01', './assets/spritesheets/tail_01.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('hair_01', './assets/spritesheets/hair_01.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('ear_01', './assets/spritesheets/ear_01.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('eyes_01', './assets/spritesheets/eyes_01.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('eyes_02', './assets/spritesheets/eyes_02.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('secondaryBody_01', './assets/spritesheets/secondaryBody_01.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('secondaryBody_02', './assets/spritesheets/secondaryBody_02.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('secondaryBody_03', './assets/spritesheets/secondaryBody_03.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('secondaryHead_01', './assets/spritesheets/secondaryHead_01.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('secondaryHead_02', './assets/spritesheets/secondaryHead_02.png', {frameWidth: 182, frameHeight: 190});
  this.load.spritesheet('secondaryHead_03', './assets/spritesheets/secondaryHead_03.png', {frameWidth: 182, frameHeight: 190});
  //This loads the map json file that says what coordinates have what pictures
  // this.load.tilemapTiledJSON('level_2', './assets/tilemaps/level2.json');
  this.load.tilemapTiledJSON('tastytails_v01', './assets/tilemaps/tastytails_v01.json');

  this.load.image('cloth_shelf_01', './assets/tilemaps/cloth_shelf_01.png');
  this.load.image('cloth_shelf_02', './assets/tilemaps/cloth_shelf_02.png');
  this.load.image('mirror_01', './assets/tilemaps/mirror_01.png');
  this.load.image('mannequin_00', './assets/tilemaps/mannequin_00.png');
  this.load.image('mannequin_01', './assets/tilemaps/mannequin_01.png');
  this.load.image('mannequin_02', './assets/tilemaps/mannequin_02.png');
  this.load.image('sewing_machine_01', './assets/tilemaps/sewing_machine_01.png');
  this.load.image('cloth_roll_basket01', './assets/tilemaps/cloth_roll_basket01.png');
  this.load.image('yarn_basket_01', './assets/tilemaps/yarn_basket_01.png');


  //----- Doors -----//
  this.load.spritesheet('door_clothing_store', './assets/spritesheets/door_clothing_store.png', {frameWidth: 197, frameHeight: 255});
  this.load.image('clothing_store_exit_rug', './assets/tilemaps/clothing_store_exit_rug.png');

  this.load.spritesheet('door_pub', './assets/spritesheets/door_pub.png', {frameWidth: 197, frameHeight: 255});
  this.load.image('pub_exit_rug', './assets/tilemaps/pub_exit_rug.png');
  this.load.image('door_spa', './assets/spritesheets/door_spa.png');
  console.log('Serverside Preloading Complete!');
}

function create() {
  //----- This creates the world map for the players to spawn in -----//
  // const map = this.make.tilemap({key: 'level_2'});
  const map = this.make.tilemap({key: 'tastytails_v01'});
  //const tileset = map.addTilesetImage('spritesheet');
  const tileset = map.addTilesetImage('tileset');

  //----- Creates "layers" of different map tiles to be placed on top of one another. These layers are named inside Tiled editor -----//
  // const roof2_layer = map.createStaticLayer('roof2', tileset, 0, 0);
  // const roof_layer = map.createStaticLayer('roof', tileset, 0, 0);
  // const grass_layer = map.createStaticLayer('grass', tileset, 0, 0);
  // const background_layer = map.createStaticLayer('background', tileset, 0, 0);
  // const background2_layer = map.createStaticLayer('background2', tileset, 0, 0);
  // const background3_layer = map.createStaticLayer('background3', tileset, 0, 0);
  // const ground_layer = map.createStaticLayer('blocked', tileset, 0, 0);
  // const ground2_layer = map.createStaticLayer('blocked2', tileset, 0, 0);
  // const spawn_layer = map.createStaticLayer('spawn', tileset, 0, 0);
  const spawn = map.createStaticLayer('spawn', tileset, 0, 0);
  const shadows = map.createStaticLayer('shadows', tileset, 0, 0);
  const blocked_tiles = map.createStaticLayer('blocked_tiles', tileset, 0, 0);
  const buildings2 = map.createStaticLayer('buildings_2', tileset, 0, 0);
  const trees = map.createStaticLayer('trees', tileset, 0, 0);
  const obj_spawning = map.createStaticLayer('obj_spawning', tileset, 0, 0);
  const water = map.createStaticLayer('water', tileset, 0, 0);
  const paths = map.createStaticLayer('paths', tileset, 0, 0);
  const grass = map.createStaticLayer('grass', tileset, 0, 0);

  //----- Defines the height that each map layer is displayed at and what tile IDs player can collide with -----//
  // roof2_layer.depth = 4;
  // roof_layer.depth = 3;
  // grass_layer.depth = 2;
  // ground_layer.depth = 0;
  // ground_layer.setCollisionByExclusion(-1, true);
  spawn.depth = 0;
  //spawn.setCollision(-1);
  shadows.depth = -1;
  //shadows.setCollision(-1);
  blocked_tiles.depth = -1;
  //blocked_tiles.setCollision(-1);
  //blocked_tiles.setCollisionByProperty({collide: true });
  // blocked_tiles.setCollisionByExclusion(-1, true);
  blocked_tiles.setCollisionByProperty({ collides: true });
  buildings2.depth = -1;
  trees.depth = -1;
  //trees.setCollision(-1);
  obj_spawning.depth = -1;
  obj_spawning.setCollisionByExclusion(-1, true);
  //obj_spawning.setCollision(-1);
  water.depth = -1;
  paths.depth = -2;
  //paths.setCollision(-1);
  grass.depth = -3;
  //grass.setCollision(-1);


  // var cloth_shelf_02 = this.physics.add.image(3000, 4250, 'cloth_shelf_02');
  // cloth_shelf_02.setSize(169, 100);
  // cloth_shelf_02.setOffset(0, 110);
  // cloth_shelf_02.setImmovable(true);

  // ----- This adds physics to the players group defined at the top of this file ----- //
  const self = this;
  this.players = this.physics.add.group();
  // this.physics.add.collider(this.players, ground_layer);
  this.physics.add.collider(this.players, blocked_tiles);
  this.physics.add.collider(this.players, obj_spawning);

  var cloth_shelf_01 = this.physics.add.image(10548, 4085, 'cloth_shelf_01');
  cloth_shelf_01.depth = (cloth_shelf_01.y);
  cloth_shelf_01.setSize(169, 100);
  cloth_shelf_01.setOffset(0, 110);
  cloth_shelf_01.setImmovable(true);
  this.physics.add.collider(this.players, cloth_shelf_01);

  var cloth_shelf_02 = this.physics.add.image(10716, 4085, 'cloth_shelf_02');
  cloth_shelf_02.depth = (cloth_shelf_02.y);
  cloth_shelf_02.setSize(169, 100);
  cloth_shelf_02.setOffset(0, 110);
  cloth_shelf_02.setImmovable(true);
  this.physics.add.collider(this.players, cloth_shelf_02);

  var mirror_01 = this.physics.add.image(10848, 4082, 'mirror_01');
  mirror_01.depth = (mirror_01.y+15);
  mirror_01.setSize(40, 51);
  mirror_01.setOffset(0, 100);
  mirror_01.setImmovable(true);
  this.physics.add.collider(this.players, mirror_01);

  var mannequin_00 = this.physics.add.image(11091, 4051, 'mannequin_00');
  mannequin_00.depth = (mannequin_00.y+55);
  mannequin_00.setSize(31, 25);
  mannequin_00.setOffset(15.5, 138);
  mannequin_00.setImmovable(true);
  this.physics.add.collider(this.players, mannequin_00);

  var mannequin_01 = this.physics.add.image(10934, 4051, 'mannequin_01');
  mannequin_01.depth = (mannequin_01.y+55);
  mannequin_01.setSize(31, 25);
  mannequin_01.setOffset(15.5, 138);
  mannequin_01.setImmovable(true);
  this.physics.add.collider(this.players, mannequin_01);

  var mannequin_02 = this.physics.add.image(11017, 4051, 'mannequin_02');
  mannequin_02.depth = (mannequin_02.y+55);
  mannequin_02.setSize(31, 25);
  mannequin_02.setOffset(15.5, 138);
  mannequin_02.setImmovable(true);
  this.physics.add.collider(this.players, mannequin_02);

  var mannequin_03 = this.physics.add.image(10470, 4421, 'mannequin_00');
  mannequin_03.depth = (mannequin_03.y+55);
  mannequin_03.setSize(31, 25);
  mannequin_03.setOffset(15.5, 138);
  mannequin_03.setImmovable(true);
  this.physics.add.collider(this.players, mannequin_03);

  var sewing_machine_01 = this.physics.add.image(11040, 4200, 'sewing_machine_01');
  sewing_machine_01.depth = (sewing_machine_01.y+55);
  sewing_machine_01.setSize(84, 40);
  sewing_machine_01.setOffset(0, 97);
  sewing_machine_01.setImmovable(true);
  this.physics.add.collider(this.players, sewing_machine_01);

  var cloth_roll_basket01 = this.physics.add.image(10472, 4272, 'cloth_roll_basket01');
  cloth_roll_basket01.depth = (cloth_roll_basket01.y+55);
  cloth_roll_basket01.setSize(52, 30);
  cloth_roll_basket01.setOffset(0, 144);
  cloth_roll_basket01.setImmovable(true);
  this.physics.add.collider(this.players, cloth_roll_basket01);

  var yarn_basket_01 = this.physics.add.image(10486, 4368, 'yarn_basket_01');
  yarn_basket_01.depth = (yarn_basket_01.y);
  yarn_basket_01.setSize(61, 22);
  yarn_basket_01.setOffset(0, 22);
  yarn_basket_01.setImmovable(true);
  this.physics.add.collider(this.players, yarn_basket_01);






  var door_clothing_store = this.physics.add.sprite(6430, 5565, 'door_clothing_store', 0);
  this.physics.add.overlap(self.players, door_clothing_store, useDoor, null, this);
  door_clothing_store.setSize(80, 130);

  var clothing_store_exit_rug = this.physics.add.image(10577, 4517, 'clothing_store_exit_rug', 0);
  clothing_store_exit_rug.setOffset(0, 55);
  this.physics.add.overlap(self.players, clothing_store_exit_rug, useDoor, null, this);

  var door_pub = this.physics.add.sprite(4320, 4095, 'door_pub', 0);
  this.physics.add.overlap(self.players, door_pub, useDoor, null, this);
  door_pub.setSize(80, 130);

  var pub_exit_rug = this.physics.add.sprite(10833, 3333, 'pub_exit_rug', 0);
  this.physics.add.overlap(self.players, pub_exit_rug, useDoor, null, this);
  pub_exit_rug.setOffset(0, 55);

  var door_spa = this.physics.add.sprite(3557, 4317, 'door_spa', 0);
  this.physics.add.overlap(self.players, door_spa, useDoor, null, this);
  door_spa.setSize(80, 130);




  function useDoor(zoomer, door) {
    //console.log('use door function called');
    // console.log('door_clothing_store = ', door_clothing_store);
    // console.log('door = ', door);
    // console.log('zoomer = ', zoomer.texture.key);
    // if(door == door_clothing_store) {
      // console.log('Clothing Store door was used');
      //console.log('door_clothing_store', door_clothing_store);
      // console.log('standing in door');
      // console.log('door.playerId = ', door.playerId);
      // console.log('playerContainer.playerId = ', playerContainer.playerId);

      if (door.playerId === playerContainer.playerId) {
        // console.log('playerId verified');
        //console.log(players[playerContainer.playerId]);
        playerContainer.door = zoomer.texture.key;
      }
    // }
  }

  //----- This is called whenever a player connects to the URL for the game -----//
  io.on('connection', function (socket) {
    console.log('a user connected: ', socket.id);
    socket.on('join', (data)=>{
      socket.join(data.room);
      io.in(data.room).emit('message', `New User Joined ${data.room} root!`);
    });

    //----- Creates a new player and defines it's properties before adding it to our players object defined at the top of this file -----//
    players[socket.id] = {
      Identifier:"player",
      playerId: socket.id,
      Username:"",
      Description:"",
      head: {
        sprite: 'head_01',
        color: '0xe0e0e0',
        secondarySprite: 'empty',
        secondaryColor: '0xffffff',
        accentSprite: 'empty',
        accentColor: '0x636363'
      },
      body: {
        sprite: 'body_01',
        color: '0xe0e0e0',
        secondarySprite: 'empty',
        secondaryColor: '0xffffff',
        accentSprite: 'empty',
        accentColor: '0x636363'
      },
      hands: {
        sprite: 'empty',
        color: '0xe0e0e0',
      },
      feet: {
        sprite: 'empty',
        color: '0xe0e0e0',
      },
      tail: {
        sprite: 'tail_01',
        color: '0xe0e0e0',
        secondarySprite: 'empty',
        secondaryColor: '0xffffff',
        accentSprite: 'empty',
        accentColor: '0x636363'
      },
      eyes: {
        outer: 'eyes_01',
        iris: 'eyes_02',
        color: '0xfcf2f2'
      },
      hair: {
        sprite: 'empty',
        color: '0x636363'
      },
      ear: {
        outerSprite: 'empty',
        innerSprite: 'empty',
        outerColor: '0xe0e0e0',
        innerColor: '0x636363'
      },
      genitles:{
        sprite: 'empty',
        secondarySprite: 'empty'
      },
      voreTypes:[],
      spellInventory:[],
      consumedBy:null,
      // x: 4820,
      // y: 5020,
      x: 3291,
      y: 4287,
      input: {
        left: false,
        right: false,
        up: false,
        down: false
      },
      rotation: 0,
      isMoving: false
    };

    //Create function to send status
    sendStatus = function(s){
      socket.emit('status', s);
    }

    //Get chats from mongo colletion

    // client.db("test").collection("chats").find().sort({_id:1}).toArray(function(err, res){
    //   if(err){
    //     throw err;
    //   }
    //   //Emit the messages
    //   socket.emit('output', res);
    // });

    //----- Calls a function to add the newly connected player into the server side instance of Phaser -----//
    //addPlayer(self, players[socket.id]);

    // send the players object to the new player
    socket.emit('currentPlayers', players, spells);

    // when a player disconnects, remove them from our players object
    socket.on('disconnect', function () {
      //----- Below Function is called to remove the player object from the Serverside instance of Phaser -----//
      removePlayer(self, socket.id);
      console.log('user disconnected: ', socket.id);
      //----- Below removes the disconnecting player from the local "players" array -----//
      delete players[socket.id];
      //----- Emit a message to all players to remove this player from their respective games -----//
      io.emit('message', 'User Disconnected');
      //io.emit('disconnect', socket.id);
      io.emit('removePlayer', socket.id);
    });

    socket.on('sendCharProfile', function () {

    });

    socket.on('playerInput', function (inputData) {
      handlePlayerInput(self, socket.id, inputData);
    });

    // socket.on('doorOpened', function (playerInfo, door) {
    //   handleDoorTransport(self, socket.id, door);
    // })





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
      players[socket.id].voreTypes.push(voreInfo);
      console.log('Addition to ', players[socket.id].Username, 's custom vore options = ', players[socket.id].voreTypes[players[socket.id].voreTypes.length -1]);
      socket.emit('newVoreAction', players[socket.id].voreTypes[players[socket.id].voreTypes.length -1]);
    })

    socket.on('voreContextMenuClicked', function (clicked, attemptedVoreActionName) {
      console.log('Vore Action clicked.Identifier = ', clicked.Identifier);
      if (clicked.Identifier === 'player') {
        Object.keys(players).forEach(function(p)  {
          if (clicked.playerId === players[p].playerId)  {
            let preyAttempt = players[p];
            if (preyAttempt._id != players[socket.id]._id) {
              if (preyAttempt.x - players[socket.id].x >= -100 && preyAttempt.x - players[socket.id].x <= 100 && preyAttempt.y - players[socket.id].y >= -100 && preyAttempt.y - players[socket.id].y <= 100) {
                console.log('players[socket.id]', players[socket.id]);
                console.log('attemptedVoreActionName', attemptedVoreActionName);
                for (let i = 0; i < players[socket.id].voreTypes.length; i++) {
                  //console.log('players[socket.id].voreTypes[i]', players[socket.id].voreTypes[i]);
                  //console.log('attemptedVoreActionName', attemptedVoreActionName);
                  if (players[socket.id].voreTypes[i].destination === attemptedVoreActionName) {
                    //console.log(players[socket.id].Username, ' is attempting to', players[socket.id].voreTypes[i].Verb, ' ', preyAttempt.Username, ' into their ', players[socket.id].voreTypes[i].Name);
                    var msg = players[socket.id].firstName + ' is attempting to ' + players[socket.id].voreTypes[i].verb + ' ' + preyAttempt.firstName + ' into their ' + players[socket.id].voreTypes[i].destination;
                    var pred = players[socket.id];
                    var prey = preyAttempt;
                    console.log('msg = ', msg);
                    io.sockets.emit('message', msg);
                    io.sockets.emit('playerConsumed', pred, prey);
                    players[p].consumedBy = pred;
                    players[p].x = 0;
                    players[p].y = 0;
                  }
                }
              } else {
                console.log('Too Far Away From Player: ', preyAttempt.firstName, ' to Vore Them');
              }
            } else {
              console.log(players[socket.id].firstName, ' Is a dumbass who is trying to eat themselves');
            }
          }
        });
      }
    })




    //----- This function is used whenever a player clicks "apply" to update the settings of one of their vore chambers -----//
    socket.on('voreUpdate', function (voreUpdate, cookie){
      console.log('Settings for Vore Chamber Updated: ', voreUpdate, '\n', 'cookie = ', cookie);
      //players[socket.id] = ;
      players[socket.id].voreTypes
      for (let i = 0; i < players[socket.id].voreTypes.length; i++) {
        if(voreUpdate.voreFormId == players[socket.id].voreTypes[i]._id) {
          players[socket.id].voreTypes[i].digestionTimer = voreUpdate.digestionTimer;
          players[socket.id].voreTypes[i].animation = voreUpdate.animation;
        }
      }

      const token = cookie.replace('TastyTails=','');
      console.log('token = ', token)
      // const verified = jwt.verify(token, process.env.TOKEN_SECRET);

      socket.emit('updateMongo', cookie);

      // try {
      //   const updateChar = await User.updateOne({_id: verified._id}, {$set: {"characters": {
      //     "firstName": req.body.firstName,
      //     "lastName": req.body.lastName,
      //     "nickName": req.body.nickName,
      //     "speciesName": req.body.speciesName,
      //     "pronouns": req.body.pronouns,
      //     "icDescrip": req.body.icDescrip,
      //     "oocDescrip": req.body.oocDescrip,
      //     "ratings": ratings,
      //     "voreTypes": voreTypes,
      //     "head": head,
      //     "body": body,
      //     "tail": tail,
      //     "eyes": eyes,
      //     "hair": hair,
      //     "ear": ear,
      //     "genitles": genitles,
      //     "hands": hands,
      //     "feet": feet
      //   }}});
      //
      //   res.redirect('/character-bank');
      // } catch(err){
      //   res.status(400).send(err);
      // }
    })




    //----- These functions are used during the character creation process to update the sprite preview -----//

    socket.on('characterUpdate', function (pushedInfo) {
      players[socket.id] = pushedInfo;
      //----- Calls a function to add the newly connected player into the server side instance of Phaser -----//
      addPlayer(self, players[socket.id]);
      console.log('updating character...');
      // update all other players of the new player
      socket.broadcast.emit('newPlayer', players[socket.id]);
      socket.emit('characterUpdated', players[socket.id]);

    });

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




    //----- Function for Sending Messages in Chat -----//
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

}
// this.players.getChildren().forEach((player) => {
//   console.log('player input = ', players[player.playerId].input);
//   console.log('player = ', players[player.playerId]);
// });
function update() {
  this.players.getChildren().forEach((otherContainer) => {
    const input = players[otherContainer.playerId].input;
     //console.log('this.container.playerId = ', this.container.playerId);
     //console.log('players[player.playerId].playerId = ', players[player.playerId].playerId);
     //console.log('zeep = ', player.playerId)
    // if (otherContainer.playerId === players[player.playerId].playerId) {
      //console.log('found the correct self.container');
      if (input.left) {
        //console.log('player = ', player);
        otherContainer.body.setVelocityX(-250);
        // console.log('otherContainer = ', otherContainer);
        //console.log('zim =', players[player.playerId]);
        //console.log('zam = ', this.container);
        //console.log('zoom = ', player);
          //console.log('player = ', players[player.playerId].playerId, '\n', 'input = ', players[player.playerId].input, '\n', 'whole player object = ', players[player.playerId]);
          players[otherContainer.playerId].rotation = 1;
          players[otherContainer.playerId].isMoving = true;
           // console.log(players[player.playerId].firstName,"'s X coordinate is: ", this.container.body.x);
           // console.log(players[player.playerId].firstName,"'s Y coordinate is: ", this.container.body.y);
      } else if (input.right) {
        otherContainer.body.setVelocityX(250);
        players[otherContainer.playerId].rotation = 2;
        players[otherContainer.playerId].isMoving = true;
        // console.log(players[player.playerId].firstName,"'s X coordinate is: ", this.container.body.x);
        // console.log(players[player.playerId].firstName,"'s Y coordinate is: ", this.container.body.y);
      } else {
        otherContainer.body.setVelocityX(0);
      }

      if (input.up) {
        otherContainer.body.setVelocityY(-250);
        players[otherContainer.playerId].rotation = 3;
        players[otherContainer.playerId].isMoving = true;
        // console.log(players[player.playerId].firstName,"'s X coordinate is: ", this.container.body.x);
        // console.log(players[player.playerId].firstName,"'s Y coordinate is: ", this.container.body.y);
      } else if (input.down) {
        otherContainer.body.setVelocityY(250);
        players[otherContainer.playerId].rotation = 4;
        players[otherContainer.playerId].isMoving = true;
        // console.log(players[player.playerId].firstName,"'s X coordinate is: ", this.container.body.x);
        // console.log(players[player.playerId].firstName,"'s Y coordinate is: ", this.container.body.y);
      } else {
        otherContainer.body.setVelocityY(0);
      }
      // console.log(otherContainer.body.velocity.x);
      // console.log(otherContainer.body.velocity.y);
      if(otherContainer.body.velocity.y == 0 && otherContainer.body.velocity.x == 0) {
        players[otherContainer.playerId].isMoving = false;
      }

      if(otherContainer.door) {
        if(otherContainer.door == 'door_clothing_store') {
          console.log('player in door status: ', otherContainer.door);
          otherContainer.body.x = 10544;
          otherContainer.body.y = 4529;
          players[otherContainer.playerId].x = otherContainer.body.x;
          players[otherContainer.playerId].y = otherContainer.body.y;
          otherContainer.door = '';
        }
        if(otherContainer.door == 'clothing_store_exit_rug') {
          console.log('player in door status: ', otherContainer.door);
          otherContainer.body.x = 6398;
          otherContainer.body.y = 5632;
          players[otherContainer.playerId].x = otherContainer.body.x;
          players[otherContainer.playerId].y = otherContainer.body.y;
          otherContainer.door = '';
        }
        if (otherContainer.door == 'door_pub') {
          console.log('player in door status: ', otherContainer.door);
          otherContainer.body.x = 10806;
          otherContainer.body.y = 3337;
          players[otherContainer.playerId].x = otherContainer.body.x;
          players[otherContainer.playerId].y = otherContainer.body.y;
          otherContainer.door = '';
        }
        if (otherContainer.door == 'pub_exit_rug') {
          console.log('player in door status: ', otherContainer.door);
          otherContainer.body.x = 4292;
          otherContainer.body.y = 4165;
          players[otherContainer.playerId].x = otherContainer.body.x;
          players[otherContainer.playerId].y = otherContainer.body.y;
          otherContainer.door = '';
        }
        if (otherContainer.door == 'door_spa') {
          console.log('player in door status: ', otherContainer.door);
          otherContainer.body.x = 10266;
          otherContainer.body.y = 973;
          players[otherContainer.playerId].x = otherContainer.body.x;
          players[otherContainer.playerId].y = otherContainer.body.y;
          otherContainer.door = '';
        }
      } else {
        players[otherContainer.playerId].x = otherContainer.body.x;
        players[otherContainer.playerId].y = otherContainer.body.y;
        // console.log('Player X Position: ', players[otherContainer.playerId].x);
        // console.log('Player Y Position: ', players[otherContainer.playerId].y);
      }
      //players[player.playerId].rotation = player.rotation;
    // }
    // console.log('player = ', players[player.playerId].playerId, 'input = ', players[player.playerId].input);
  });

  io.emit('playerUpdates', players);
}

//----- This is called whenever a player connects via socket.io -----//
function addPlayer(self, playerInfo) {
  //const player = self.physics.add.image(playerInfo.x, playerInfo.y, 'body').setOrigin(0.5, 0.5);
  playerContainer = self.add.container(playerInfo.x, playerInfo.y).setInteractive();
  self.physics.world.enable(playerContainer);
  //----- the 30, -87 defines the placement of the sprite in the container -----//
  const playerContainerhead = self.add.sprite(30, -87, playerInfo.head.sprite);
  playerContainerhead.setTint(playerInfo.head.color);
  const playerContainersecondaryHead = self.add.sprite(30, -87, playerInfo.head.secondarySprite);
  playerContainersecondaryHead.setTint(playerInfo.head.secondaryColor);
  const playerContaineraccentHead = self.add.sprite(30, -87, playerInfo.head.accentSprite);
  playerContaineraccentHead.setTint(playerInfo.head.accentColor);

  const playerContainerbody = self.add.sprite(30, -87, playerInfo.body.sprite);
  playerContainerbody.setTint(playerInfo.body.color);
  const playerContainersecondaryBody = self.add.sprite(30, -87, playerInfo.body.secondarySprite);
  playerContainersecondaryBody.setTint(playerInfo.body.secondaryColor);
  const playerContaineraccentBody = self.add.sprite(30, -87, playerInfo.body.accentSprite);
  playerContaineraccentBody.setTint(playerInfo.body.accentColor);

  const playerContainertail = self.add.sprite(30, -87, playerInfo.tail.sprite);
  playerContainertail.setTint(playerInfo.tail.color);
  const playerContainersecondaryTail = self.add.sprite(30, -87, playerInfo.tail.secondarySprite);
  playerContainersecondaryTail.setTint(playerInfo.tail.secondaryColor);
  const playerContaineraccentTail = self.add.sprite(30, -87, playerInfo.tail.accentSprite);
  playerContaineraccentTail.setTint(playerInfo.tail.accentColor);

  const playerContainerhair = self.add.sprite(30, -87, playerInfo.hair.sprite);
  playerContainerhair.setTint(playerInfo.hair.color);

  const playerContainerear = self.add.sprite(30, -87, playerInfo.ear.outerSprite);
  playerContainerear.setTint(playerInfo.ear.outerColor);

  const playerContainereyes = self.add.sprite(30, -87, playerInfo.eyes.outer);
  const playerContaineriris = self.add.sprite(30, -87, playerInfo.eyes.iris);
  playerContaineriris.setTint(playerInfo.eyes.color);

  const playerContainergenitles = self.add.sprite(30, -87, playerInfo.genitles.sprite);
  //self.genitles.setTint(playerInfo.genitles.color);


  playerContainer.add([
    playerContainertail,
    playerContainersecondaryTail,
    playerContaineraccentTail,
    playerContainerbody,
    playerContainersecondaryBody,
    playerContaineraccentBody,
    playerContainerhead,
    playerContainerear,
    playerContainersecondaryHead,
    playerContaineraccentHead,
    playerContainereyes,
    playerContaineriris,
    playerContainerhair,
    playerContainergenitles
  ]);
  playerContainer.sendToBack(self.tail);
  // playerContainer.bringToTop(self.tail);
  // playerContainer.moveDown(self.tail);
  // playerContainer.moveTo(self.tail);
  // playerContainer.moveUp(self.tail);

  playerContainer.playerId = playerInfo.playerId;
  self.players.add(playerContainer);


  playerContainer.body.setSize(60, 15);
  //playerContainer.body.setOffset(-30, -90);
  //playerContainer.body.setCollideWorldBounds(true);

  //playerContainer.setInteractive();
  console.log(playerInfo.firstName, ' added to Serverside Phaser Instance successfully!');
  //console.log('playerContainer = ', playerContainer);
  console.log('self.players.playerId = ', self.players.playerId);
  //console.log('player coordinates are: X= ', playerInfo.x, 'Y= ', playerInfo.y);
}

//----- This is called whenever a player disconnects via socket.io -----//
function removePlayer(self, playerId) {
  self.players.getChildren().forEach((player) => {
    if (playerId === player.playerId) {
      console.log('player ID match found...Destroying player.');
      player.destroy();
    }
  });
}

//----- This is called whenever socket.io sends a player input message indicating that the state of the directional keys has changed for that player -----//
function handlePlayerInput(self, playerId, input) {
  self.players.getChildren().forEach((playerContainer) => {
    if (playerId === playerContainer.playerId) {
      players[playerContainer.playerId].input = input;
    }
  });
}

//----- This is called whenever a player enters a door in game -----//
function handleDoorTransport(self, playerId, door) {
  console.log('standing in door');
  if (playerId === playerContainer.playerId) {
    console.log('playerId verified');
    console.log(players[playerContainer.playerId]);
    players[playerContainer.playerId].x = 10561;
    players[playerContainer.playerId].y = 4499
  }
}

//----- Saves the Phaser Configuration and then tells the server that Phaser has finished loading -----//
const game = new Phaser.Game(config);
window.gameLoaded();
