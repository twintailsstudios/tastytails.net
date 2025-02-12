
const express = require('express');
const app = express();
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectID;
const cookieParser = require('cookie-parser');
const jsdom = require('jsdom');
const Chats = require('./model/Chat');
const User = require('./model/User');
const jwt = require('jsonwebtoken');

const log = require('./logger');

const phaserOnNodejs = require('@geckos.io/phaser-on-nodejs');
const Phaser = require('phaser');


const DatauriParser = require('datauri/parser');
const datauri = new DatauriParser();
const { JSDOM } = jsdom;

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.set('layout', 'layouts/layout');

//Import Routes
const authRoute = require('./routes/auth');
const dbInterfaceRoute = require('./routes/dbInterface');
const indexRoute = require('./routes/index');
const editRoute = require('./routes/edit');
const playRoute = require('./routes/play');

dotenv.config();

const {
  testFunction,
  getDebugGraphics
} = require('./gameFunctions');

log('testFunction = ', testFunction());
//connect to DB
log('DB_CONNECT = ', process.env.DB_CONNECT);
mongoose.connect(process.env.DB_CONNECT, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(
    log('connected')
  // messageReceived();
  )
  .catch(err => console.error(err));


const db = mongoose.connection
db.on('error', error => console.error(error))
db.once('open', () => log('Connected to DB'))
// log('db = ', db.collection('chats'));

var playgop = [];

async function messageReceived(){
  try{
    const chat = new Chats({name: 'Kyle'});
    await chat.save();
    log('Chat Saved');
    log(chat);
  } catch(err){
    log(err);
  }
}

io.on('connection', function (socket) {
  log('a user connected: ', socket.id);
  socket.on('join', (data)=>{
    socket.join(data.room);
    io.in(data.room).emit('message', `New User Joined ${data.room} root!`);
  });
  log('does this even work??');
});



// databasesList = db().admin().listDatabases();
// log("Databases:");
// databasesList.databases.forEach(db => log(` - ${db.name}`));

// main().catch(err => log(err));


// async function main() {
//   const uri = process.env.DB_CONNECT;
//   // const uri = "mongodb+srv://kimbunny:kipkit11254@tastytails-01.lruhd.gcp.mongodb.net/?retryWrites=true&w=majority";
//   const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
//   try {
//     // Connect to the MongoDB cluster
//     await client.connect();
//     log('client.db() = ', client.db());
//     log('Connected to DB');
//     // Make the appropriate DB calls
//     await listDatabases(client);
//     } catch (e) {
//       console.error(e);
//     };
// }
//
// async function listDatabases(client){
//   databasesList = await client.db().admin().listDatabases();
//   log("Databases:");
//   databasesList.databases.forEach(db => log(` - ${db.name}`));
// };

//Middlewares
app.use(express.json());
app.use(expressLayouts);
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser());

//Route Middlewares
app.use('/api/user', authRoute);
app.use('/api/dbInterface', dbInterfaceRoute);
app.use('/', indexRoute);
app.use('/edit', editRoute);
app.use('/play', playRoute);




const port = 3000

app.use('/', express.static(path.join(__dirname, 'client')))






//----- Authoritative Phaser Server -----//

const tilemap = require('./client/assets/tilemaps/level2.json');
//log(tilemap.layers);
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
    //log('info = ', info, 'remainder = ', remainder, 'division = ', division, 'spawnTile = ', spawnTile);
  }
}
//log('spawnLocaiton: ', spawnLocation);
//log('blockingLayer: ', blockingLayer);




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
//log('spawnLocations = ', spawnLocations);

var random_tile = null;
  random_tile = Math.floor((Math.random() * spawnLocations.length))
    spells[0].x = spawnLocations[random_tile].x
    spells[0].y = spawnLocations[random_tile].y
    log('spells[0] = ', spells[0].x, spells[0].y);

  random_tile = Math.floor((Math.random() * spawnLocations.length))
    spells[1].x = spawnLocations[random_tile].x
    spells[1].y = spawnLocations[random_tile].y
    log('spells[1] = ', spells[1].x, spells[1].y);

  random_tile = Math.floor((Math.random() * spawnLocations.length))
    spells[2].x = spawnLocations[random_tile].x
    spells[2].y = spawnLocations[random_tile].y
    log('spells[2] = ', spells[2].x, spells[2].y);

const config = {
  autoFocus: false,
  type: Phaser.HEADLESS,
  parent: 'phaser-example',
  width: 800,
  height: 930,
  banner: false,
  audio: false,
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

log('ServerSide Authoritative Phaser Instance is Running...');

function preload() {
  log('Preloading Assets Serverside...');
  //this.load.image('spritesheet', './assets/images/spritesheet.png');
  this.load.image('tileset', path.join(__dirname, 'client/assets/tilemaps/tileset.png'));
  this.load.image('scroll', path.join(__dirname, 'client/assets/images/Scroll_01.png'));
  this.load.image('scroll2', path.join(__dirname, 'client/assets/images/Scroll_02.png'));

  // Body Sprites
  this.load.spritesheet('body_01', path.join(__dirname, 'client/assets/spritesheets/body_01.png'), {frameWidth: 215, frameHeight: 198});

  // Secondary Body Sprites
  this.load.spritesheet('body_01-secondary_01', path.join(__dirname, 'client/assets/spritesheets/body_01-secondary_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('body_01-secondary_02', path.join(__dirname, 'client/assets/spritesheets/body_01-secondary_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('body_01-secondary_03', path.join(__dirname, 'client/assets/spritesheets/body_01-secondary_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('body_01-secondary_04', path.join(__dirname, 'client/assets/spritesheets/body_01-secondary_04.png'), {frameWidth: 215, frameHeight: 198});

  // Accent Body Sprites
  this.load.spritesheet('body_01-accent-01', path.join(__dirname, 'client/assets/spritesheets/body_01-accent_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('body_01-accent-02', path.join(__dirname, 'client/assets/spritesheets/body_01-accent_02.png'), {frameWidth: 215, frameHeight: 198});

  // Ear Sprites
  this.load.spritesheet('ears_01-outer', path.join(__dirname, 'client/assets/spritesheets/ears_01-outer.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('ears_01-inner', path.join(__dirname, 'client/assets/spritesheets/ears_01-inner.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('ears_04-outer', path.join(__dirname, 'client/assets/spritesheets/ears_04-outer.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('ears_04-inner', path.join(__dirname, 'client/assets/spritesheets/ears_04-inner.png'), {frameWidth: 215, frameHeight: 198});

  // Eyes Sprites
  this.load.spritesheet('eyes_02', path.join(__dirname, 'client/assets/spritesheets/eyes_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('eyes_01', path.join(__dirname, 'client/assets/spritesheets/eyes_01.png'), {frameWidth: 215, frameHeight: 198});
  
  // Head Sprites
  this.load.spritesheet('head_01', path.join(__dirname, 'client/assets/spritesheets/head_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_02', path.join(__dirname, 'client/assets/spritesheets/head_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_03', path.join(__dirname, 'client/assets/spritesheets/head_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_04', path.join(__dirname, 'client/assets/spritesheets/head_04.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_05', path.join(__dirname, 'client/assets/spritesheets/head_05.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_06', path.join(__dirname, 'client/assets/spritesheets/head_06.png'), {frameWidth: 215, frameHeight: 198});

  // Secondary Head Sprites for head_01
  this.load.spritesheet('head_01-secondary_01', path.join(__dirname, 'client/assets/spritesheets/head_01-secondary_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_01-secondary_02', path.join(__dirname, 'client/assets/spritesheets/head_01-secondary_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_01-secondary_03', path.join(__dirname, 'client/assets/spritesheets/head_01-secondary_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_01-secondary_04', path.join(__dirname, 'client/assets/spritesheets/head_01-secondary_04.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_01-secondary_05', path.join(__dirname, 'client/assets/spritesheets/head_01-secondary_05.png'), {frameWidth: 215, frameHeight: 198});

  // Secondary Head Sprites for head_02
  this.load.spritesheet('head_02-secondary_01', path.join(__dirname, 'client/assets/spritesheets/head_02-secondary_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_02-secondary_02', path.join(__dirname, 'client/assets/spritesheets/head_02-secondary_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_02-secondary_03', path.join(__dirname, 'client/assets/spritesheets/head_02-secondary_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_02-secondary_04', path.join(__dirname, 'client/assets/spritesheets/head_02-secondary_04.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_02-secondary_05', path.join(__dirname, 'client/assets/spritesheets/head_02-secondary_05.png'), {frameWidth: 215, frameHeight: 198});

  // Secondary Head Sprites for head_03
  this.load.spritesheet('head_03-secondary_01', path.join(__dirname, 'client/assets/spritesheets/head_03-secondary_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_03-secondary_02', path.join(__dirname, 'client/assets/spritesheets/head_03-secondary_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_03-secondary_03', path.join(__dirname, 'client/assets/spritesheets/head_03-secondary_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_03-secondary_04', path.join(__dirname, 'client/assets/spritesheets/head_03-secondary_04.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_03-secondary_05', path.join(__dirname, 'client/assets/spritesheets/head_03-secondary_05.png'), {frameWidth: 215, frameHeight: 198});

  // Secondary Head Sprites for head_04
  this.load.spritesheet('head_04-secondary_01', path.join(__dirname, 'client/assets/spritesheets/head_04-secondary_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_04-secondary_02', path.join(__dirname, 'client/assets/spritesheets/head_04-secondary_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_04-secondary_03', path.join(__dirname, 'client/assets/spritesheets/head_04-secondary_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_04-secondary_04', path.join(__dirname, 'client/assets/spritesheets/head_04-secondary_04.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_04-secondary_05', path.join(__dirname, 'client/assets/spritesheets/head_04-secondary_05.png'), {frameWidth: 215, frameHeight: 198});

  // Secondary Head Sprites for head_05
  this.load.spritesheet('head_05_beak', path.join(__dirname, 'client/assets/spritesheets/head_05_beak.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_05-secondary_01', path.join(__dirname, 'client/assets/spritesheets/head_05-secondary_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_05-secondary_02', path.join(__dirname, 'client/assets/spritesheets/head_05-secondary_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_05-secondary_03', path.join(__dirname, 'client/assets/spritesheets/head_05-secondary_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_05-secondary_04', path.join(__dirname, 'client/assets/spritesheets/head_05-secondary_04.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_05-secondary_05', path.join(__dirname, 'client/assets/spritesheets/head_05-secondary_05.png'), {frameWidth: 215, frameHeight: 198});

  // Secondary Head Sprites for head_06
  this.load.spritesheet('head_06-secondary_01', path.join(__dirname, 'client/assets/spritesheets/head_06-secondary_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_06-secondary_02', path.join(__dirname, 'client/assets/spritesheets/head_06-secondary_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_06-secondary_03', path.join(__dirname, 'client/assets/spritesheets/head_06-secondary_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_06-secondary_04', path.join(__dirname, 'client/assets/spritesheets/head_06-secondary_04.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('head_06-secondary_05', path.join(__dirname, 'client/assets/spritesheets/head_06-secondary_05.png'), {frameWidth: 215, frameHeight: 198});

  // Tail Sprites
  this.load.spritesheet('tail_01', path.join(__dirname, 'client/assets/spritesheets/tail_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('tail_02', path.join(__dirname, 'client/assets/spritesheets/tail_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('tail_03', path.join(__dirname, 'client/assets/spritesheets/tail_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('tail_04', path.join(__dirname, 'client/assets/spritesheets/tail_04.png'), {frameWidth: 215, frameHeight: 198});

  // Secondary Tail Sprites
  this.load.spritesheet('tail_01-secondary_02', path.join(__dirname, 'client/assets/spritesheets/tail_01-secondary_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('tail_01-secondary_03', path.join(__dirname, 'client/assets/spritesheets/tail_01-secondary_03.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('tail_01-secondary_04', path.join(__dirname, 'client/assets/spritesheets/tail_01-secondary_04.png'), {frameWidth: 215, frameHeight: 198});

  // Hair Sprites
  this.load.spritesheet('hair-front_01', path.join(__dirname, 'client/assets/spritesheets/hair-front_01.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('hair-front_02', path.join(__dirname, 'client/assets/spritesheets/hair-front_02.png'), {frameWidth: 215, frameHeight: 198});
  this.load.spritesheet('hair-front_03', path.join(__dirname, 'client/assets/spritesheets/hair-front_03.png'), {frameWidth: 215, frameHeight: 198});

  //This loads the map json file that says what coordinates have what pictures
  // this.load.tilemapTiledJSON('level_2', './assets/tilemaps/level2.json');
  this.load.tilemapTiledJSON('tastytails_v01', path.join(__dirname, 'client/assets/tilemaps/tastytails_v01.json'));

  this.load.image('cloth_shelf_01', path.join(__dirname, 'client/assets/tilemaps/cloth_shelf_01.png'));
  this.load.image('cloth_shelf_02', path.join(__dirname, 'client/assets/tilemaps/cloth_shelf_02.png'));
  this.load.image('mirror_01', path.join(__dirname, 'client/assets/tilemaps/mirror_01.png'));
  this.load.image('mannequin_00', path.join(__dirname, 'client/assets/tilemaps/mannequin_00.png'));
  this.load.image('mannequin_01', path.join(__dirname, 'client/assets/tilemaps/mannequin_01.png'));
  this.load.image('mannequin_02', path.join(__dirname, 'client/assets/tilemaps/mannequin_02.png'));
  this.load.image('sewing_machine_01', path.join(__dirname, 'client/assets/tilemaps/sewing_machine_01.png'));
  this.load.image('cloth_roll_basket01', path.join(__dirname, 'client/assets/tilemaps/cloth_roll_basket01.png'));
  this.load.image('yarn_basket_01', path.join(__dirname, 'client/assets/tilemaps/yarn_basket_01.png'));


  //----- Doors -----//
  this.load.spritesheet('door_clothing_store', path.join(__dirname, 'client/assets/spritesheets/door_clothing_store.png'), {frameWidth: 197, frameHeight: 255});
  this.load.image('clothing_store_exit_rug', path.join(__dirname, 'client/assets/tilemaps/clothing_store_exit_rug.png'));

  this.load.spritesheet('door_pub', path.join(__dirname, 'client/assets/spritesheets/door_pub.png'), {frameWidth: 197, frameHeight: 255});
  this.load.image('pub_exit_rug', path.join(__dirname, 'client/assets/tilemaps/pub_exit_rug.png'));
  this.load.image('door_spa', path.join(__dirname, 'client/assets/spritesheets/door_spa.png'));
  log('Serverside Preloading Complete!');
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
  const spawn = map.createLayer('spawn', tileset, 0, 0);
  const shadows = map.createLayer('shadows', tileset, 0, 0);
  const blocked_tiles = map.createLayer('blocked_tiles', tileset, 0, 0);
  const buildings2 = map.createLayer('buildings_2', tileset, 0, 0);
  const trees = map.createLayer('trees', tileset, 0, 0);
  const obj_spawning = map.createLayer('obj_spawning', tileset, 0, 0);
  const water = map.createLayer('water', tileset, 0, 0);
  const paths = map.createLayer('paths', tileset, 0, 0);
  const grass = map.createLayer('grass', tileset, 0, 0);

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
    //log('use door function called');
    // log('door_clothing_store = ', door_clothing_store);
    // log('door = ', door);
    // log('zoomer = ', zoomer.texture.key);
    // if(door == door_clothing_store) {
      // log('Clothing Store door was used');
      //log('door_clothing_store', door_clothing_store);
      // log('standing in door');
      // log('door.playerId = ', door.playerId);
      // log('playerContainer.playerId = ', playerContainer.playerId);

      if (door.playerId === playerContainer.playerId) {
        // log('playerId verified');
        //log(players[playerContainer.playerId]);
        playerContainer.door = zoomer.texture.key;
      }
    // }
  }

  //----- This is called whenever a player connects to the URL for the game -----//
  io.on('connection', function (socket) {
    // log('socket = ', socket);
    log('a user connected: ', socket.id);
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
      spellList:[],
      consumedBy:null,
      position: {
        x: 3291,
        y: 4287,
        time: null
      },
      input: {
        left: false,
        right: false,
        up: false,
        down: false
      },
      rotation: 0,
      isMoving: false,
      locationHistory:[],
      debug: {
        x: null,
        y: null,
        width: null,
        height: null
      }
    };




    //requesting latest messages
    socket.on('getAllChats', function(data) {
      getAllChats(data, socket);
    });
    //Handle input events
    socket.on('input', function(data) {
      let name = data.name;
      let message = data.message;
      let spoiler = data.spoiler;

      //Check for name and messages
      if(name == '' || message == ''){
        //Send Error status
        sendStatus('Please enter a name and message');
      } else {
        //Insert Message
        log('server received message');

        //----- Checkes if starts with command -----//
        if (data.message.startsWith('/me', 0)){
          log('message started with /me');
        }

        log('spoiler status is = ',data.spoiler);
        addMessage(data, socket);
      }
    });
    socket.on('inputEdit', function(data){
      log('inputEdit Called');
      editMessage(data, socket)
    })
    socket.on('deleteMessage', function(data){
      deleteMessage(data, socket)
    })
    socket.on('sendSpoilEdit', function(data){
      changeSpoilerLabel(data, socket)
    })

    // Handle Clear
    socket.on('clear', function(data){
      //Remove all chats from collection
      client.db("test").collection("chats").deleteMany({}, function(){
        //Emit cleared
        socket.emit('cleared');
      });
    });

    //----- Calls a function to add the newly connected player into the server side instance of Phaser -----//
    //addPlayer(self, players[socket.id]);

    // send the players object to the new player
    socket.emit('currentPlayers', players, spells);

    // when a player disconnects, remove them from our players object
    socket.on('disconnect', function () {
      //----- Below Function is called to remove the player object from the Serverside instance of Phaser -----//
      removePlayer(self, socket.id);
      log('user disconnected: ', socket.id);
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

    socket.on('getDebugBounds', function () {
      let var1 = getDebugGraphics(blocked_tiles);
      // log('var1 = ', var1);
      socket.emit('sendDebugBounds', var1);
    })





    socket.on('examineClicked', function (clicked) {
      log('Examine clicked.Identifier = ', clicked.Identifier);
      if (clicked.Identifier === 'spell') {
        for (let i = 0; i < spells.length; i++) {
          if (clicked.Name === spells[i].Name)  {
            let examinedItem = spells[i];
            socket.emit('examinedInfo', examinedItem);
          }
        }
      }
      if (clicked.Identifier === 'player') {
        //log('clicked.playerId = ', clicked.playerId);
        //log('players = ', players);
        //log('Object.keys(players).length = ', Object.keys(players).length);
        // Object.keys(players).forEach(function(p)  {
        //   if (clicked.playerId === players[p].playerId)  {
        //     let examinedItem = players[p];
        //     //log('examinedItem = ', examinedItem)
        //     socket.emit('examinedInfo', examinedItem);
        //   }
        // });
        examiningPlayer(clicked, socket);
      }
        //if (spellInfo.locationX - self.avatar.head.x >= -100 && spellInfo.locationX - self.avatar.head.x <= 100 && spellInfo.locationY - self.avatar.head.y >= -100 && spellInfo.locationY - self.avatar.head.y <= 100)
    })

    socket.on('pickUpClicked', function (clicked) {
      //log('Pick Up clicked.Identifier = ', clicked.Identifier);
      if (clicked.Identifier === 'spell') {
        for (let i = 0; i < spells.length; i++) {
          if (clicked.Name === spells[i].Name)  {
            let pickedUpItem = spells[i];
            if (pickedUpItem.x - players[socket.id].position.x >= -100 && pickedUpItem.x - players[socket.id].position.x <= 100 && pickedUpItem.y - players[socket.id].position.y >= -100 && pickedUpItem.y - players[socket.id].position.y <= 100) {
              log('in range to pick up item');
              players[socket.id].spellList.push(pickedUpItem);
              //log('players[socket.id].spellList = ', players[socket.id].spellList);
              socket.emit('pickedUpItem', players[socket.id].spellList);
            }else {
              log('NOT in range to pick up item');
              //socket.emit('examinedInfo', examinedItem);
            }
          }
        }
      }
      if (clicked.Identifier === 'player') {
        //log('clicked.playerId = ', clicked.playerId);
        //log('players = ', players);
        //log('Object.keys(players).length = ', Object.keys(players).length);
        Object.keys(players).forEach(function(p)  {
          if (clicked.playerId === players[p].playerId)  {
            let pickedUpItem = players[p];
            log('Attempting to pick up player = ', pickedUpItem.Username);
            //socket.emit('examinedInfo', examinedItem);
          }
        });
      }
        //if (spellInfo.locationX - self.avatar.head.x >= -100 && spellInfo.locationX - self.avatar.head.x <= 100 && spellInfo.locationY - self.avatar.head.y >= -100 && spellInfo.locationY - self.avatar.head.y <= 100)
    })

    socket.on('grabClicked', function (clicked) {
      players[socket.id].locationHistory = [];
      // log('grabber socket.id = ', socket.id);
      // log('players[socket.id] = ', players[socket.id].playerId);
      players[socket.id].locationHistory.push({ x: players[socket.id].position.x, y: players[socket.id].position.y});
      log('grab clicked.Identifier = ', clicked.Identifier);
      // log('grab clicked = ', clicked);
      if (clicked.Identifier === 'player') {
        // log('players = ', players)
        grabbingPlayer(clicked, socket);
      }
        //if (spellInfo.locationX - self.avatar.head.x >= -100 && spellInfo.locationX - self.avatar.head.x <= 100 && spellInfo.locationY - self.avatar.head.y >= -100 && spellInfo.locationY - self.avatar.head.y <= 100)
    })

    

    socket.on('gripFirmly', function(clicked) {
      // log('grippedFirmly happened.');
      // log('gripFirmly clicked = ', clicked);
      let charId = clicked._id;
      players[clicked.playerId].grippedFirmlyBy = players[socket.id].playerId;
      players[socket.id].isGripping = players[clicked.playerId].playerId;

      console.group('\n\n gripFirmly function called: \n');
        if(players[clicked.playerId].heldBy === players[socket.id].playerId){
          players[clicked.playerId].heldBy = null;
          players[socket.id].isHolding = null;
          grippedFirmlyPlayer = players[clicked.playerId];
          console.table([
          {
            'Gripping Plyr firstName: ': players[socket.id].firstName,
            'Gripping Plyr lastName: ': players[socket.id].lastName,
            'Gripping Plyr Mongo._id': players[socket.id]._id,
            'Gripping Plyr Socket.id': players[socket.id].playerId,
            'Gripping Plyr Identifier': players[socket.id].Identifier,
            'Gripping Plyr Gripped Firmly By': players[socket.id].grippedFirmlyBy,
            'Gripping Plyr is Holding': players[socket.id].isGripping,
            'Gripping Plyr X': players[socket.id].position.x,
            'Gripping Plyr Y': players[socket.id].position.y
          }
        ]);

        log('\n\n');

        console.table([
          {
            'Gripped Plyr firstName: ': grippedFirmlyPlayer.firstName,
            'Gripped Plyr lastName: ': grippedFirmlyPlayer.lastName,
            'Gripped Plyr Mongo._id': grippedFirmlyPlayer._id,
            'Gripped Plyr Socket.id': grippedFirmlyPlayer.playerId,
            'Gripped Plyr Identifier': grippedFirmlyPlayer.Identifier,
            'Gripped Plyr Gripped Firmly By': grippedFirmlyPlayer.grippedFirmlyBy,
            'Gripped Plyr is Gripping': grippedFirmlyPlayer.isGripping,
            'Gripped Plyr X': grippedFirmlyPlayer.position.x,
            'Gripped Plyr Y': grippedFirmlyPlayer.position.y
          }
        ]);
      console.groupEnd();
      socket.emit('grippedFirmlyInfo', grippedFirmlyPlayer);        
      } else {
        var error = 'You are not holding this player';
        log('Error Message: ', error);
      }
    })

    socket.on('playerRightClicked', function(info){
      // log('info = ', info);
      var clickedList = [];

      log('\n', 'playerRightClicked function called', '\n');
      log('Mongo._id of requesting player = ', players[socket.id]._id);
      log('Socket.id of requesting player = ', players[socket.id].playerId);
      log('Requesting players name = ', players[socket.id].firstName);

      log('just to make sense of it = ', info.rightClickedList[0]);

      log('Mongo._id of clicked player = ', players[info.rightClickedList[0].playerId]._id);
      log('Socket.id of clicked player = ', players[info.rightClickedList[0].playerId].playerId);
      log('clicked players name = ', players[info.rightClickedList[0].playerId].firstName);

      var playerList = {
        name: players[info.rightClickedList[0].playerId].firstName,
        playerId: players[info.rightClickedList[0].playerId].playerId,
        Identifier: players[info.rightClickedList[0].playerId].Identifier,
        heldBy: players[info.rightClickedList[0].playerId].heldBy,
        grippedFirmlyBy: players[info.rightClickedList[0].playerId].grippedFirmlyBy
      };
      clickedList.push(playerList);

      socket.emit('playerRightClickedResponse', clickedList);
    })



    socket.on('specialCreateBttnSelected', function (voreInfo){
      //log('voreInfo from player = ', voreInfo);
      players[socket.id].voreTypes.push(voreInfo);
      log('Addition to ', players[socket.id].Username, 's custom vore options = ', players[socket.id].voreTypes[players[socket.id].voreTypes.length -1]);
      socket.emit('newVoreAction', players[socket.id].voreTypes[players[socket.id].voreTypes.length -1]);
    })

    socket.on('voreContextMenuClicked', function (clicked, attemptedVoreActionName) {
      log('Vore Action clicked.Identifier = ', clicked.Identifier);
      if (clicked.Identifier === 'player') {
        Object.keys(players).forEach(function(p)  {
          if (clicked.playerId === players[p].playerId)  {
            let preyAttempt = players[p];
            if (preyAttempt._id != players[socket.id]._id) {
              if (preyAttempt.x - players[socket.id].position.x >= -100 && preyAttempt.position.x - players[socket.id].position.x <= 100 && preyAttempt.position.y - players[socket.id].position.y >= -100 && preyAttempt.position.y - players[socket.id].position.y <= 100) {
                log('players[socket.id]', players[socket.id]);
                log('attemptedVoreActionName', attemptedVoreActionName);
                for (let i = 0; i < players[socket.id].voreTypes.length; i++) {
                  //log('players[socket.id].voreTypes[i]', players[socket.id].voreTypes[i]);
                  //log('attemptedVoreActionName', attemptedVoreActionName);
                  if (players[socket.id].voreTypes[i].destination === attemptedVoreActionName) {
                    //log(players[socket.id].Username, ' is attempting to', players[socket.id].voreTypes[i].Verb, ' ', preyAttempt.Username, ' into their ', players[socket.id].voreTypes[i].Name);
                    var msg = players[socket.id].firstName + ' is attempting to ' + players[socket.id].voreTypes[i].verb + ' ' + preyAttempt.firstName + ' into their ' + players[socket.id].voreTypes[i].destination;
                    var pred = players[socket.id];
                    var prey = preyAttempt;
                    log('msg = ', msg);
                    io.sockets.emit('message', msg);
                    io.sockets.emit('playerConsumed', pred, prey);
                    players[p].consumedBy = pred;
                    players[p].position.x = 0;
                    players[p].position.y = 0;
                  }
                }
              } else {
                log('Too Far Away From Player: ', preyAttempt.firstName, ' to Vore Them');
              }
            } else {
              log(players[socket.id].firstName, ' Is a dumbass who is trying to eat themselves');
            }
          }
        });
      }
    })




    //----- This function is used whenever a player clicks "apply" to update the settings of one of their vore chambers -----//
    socket.on('voreUpdate', function (voreUpdate, cookie){
      log('Settings for Vore Chamber to Update: ', voreUpdate, '\n', 'cookie = ', cookie);
      //players[socket.id] = ;
      voreChamberUpdate(voreUpdate, cookie, socket);
    })




    //----- These functions are used during the character creation process to update the sprite preview -----//

    socket.on('characterUpdate', function (pushedInfo) {
      players[socket.id] = pushedInfo;
      
      //----- Calls a function to add the newly connected player into the server side instance of Phaser -----//
      addPlayer(self, players[socket.id]);
      
      log('updating character...');
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
      log('Player ID: ', socket.id, 'has chosen: ', '\n', 'Username = ', players[socket.id].Username, '\n', 'Description = ', players[socket.id].Description, '\n', 'avatar.head = ', players[socket.id].head, '\n', 'avatar.body = ', players[socket.id].body,  '\n', 'Head Color = ', players[socket.id].headColor, '\n', 'Body Color =', players[socket.id].bodyColor);
      // emit a message to all players about the updated player avatar
      socket.broadcast.emit('avatarSelection', players[socket.id]);
    });




    //----- Function for Sending Messages in Chat -----//
    socket.on('message', (data) => {
      //log('players variable = ', players);
      //log('socket.id variable = ', socket.id);
      //log('players[socket.id] variable = ', players[socket.id]);
      log(players[socket.id].Username);
      io.in(data.room).emit('message', data.msg, players[socket.id].Username);

      //let author = game.user.all[socket.id]
      //let type = (data.type === 'ooc' || data.type === 'rp' ? data.type : null)
      //game.chat.add(new Message(author, data.type, data.content))
    });
  });

}
// this.players.getChildren().forEach((player) => {
//   log('player input = ', players[player.playerId].input);
//   log('player = ', players[player.playerId]);
// });
function update() {
  this.players.getChildren().forEach((otherContainer) => {
    const input = players[otherContainer.playerId].input;
    if(players[otherContainer.playerId].grabbedBy) {
      // log(players[otherContainer.playerId].firstName, 'is being held');
      const grabbedBy = players[otherContainer.playerId].grabbedBy;
      if(players[otherContainer.playerId].position.x > (players[grabbedBy].position.x + 30)){
        // log('grabbed player is to the right of grabber');
        otherContainer.body.setVelocityX(-250);
        players[otherContainer.playerId].rotation = 1;
        players[otherContainer.playerId].isMoving = true;
        if(players[otherContainer.playerId].position.y > (players[grabbedBy].position.y)) {
          log('moving left and grabbed player Y is below grabber');
          log('Grabber Y = ', players[grabbedBy].position.y,  '\n', 'Grabbed Y = ', players[otherContainer.playerId].position.y);
          // otherContainer.body.setVelocityY(-125);
          otherContainer.body.position.y = (players[grabbedBy].position.y);
        } else if(players[otherContainer.playerId].position.y < (players[grabbedBy].position.y)) {
          log('moving left and grabbed player Y is above grabber');
          log('Grabber Y = ', players[grabbedBy].position.y,  '\n', 'Grabbed Y = ', players[otherContainer.playerId].position.y);
          // otherContainer.body.setVelocityY(125);
          otherContainer.body.position.y = (players[grabbedBy].position.y);
        }  else {
          log('moving left and grabbed player Y equal to grabber');
          log('Grabber Y = ', players[grabbedBy].position.y,  '\n', 'Grabbed Y = ', players[otherContainer.playerId].position.y);
          otherContainer.body.setVelocityY(0);
        }
      } else if(players[otherContainer.playerId].position.x < (players[grabbedBy].position.x - 30)){
        // log('grabbed player is to the left of grabber');
        otherContainer.body.setVelocityX(250);
        players[otherContainer.playerId].rotation = 2;
        players[otherContainer.playerId].isMoving = true;
        if(players[otherContainer.playerId].y > (players[grabbedBy].y)) {
          log('moving right and grabbed player Y is below grabber');
          log('Grabber Y = ', players[grabbedBy].y,  '\n', 'Grabbed Y = ', players[otherContainer.playerId].y);
          // otherContainer.body.setVelocityY(-125);
          otherContainer.body.y = (players[grabbedBy].y);
        } else if(players[otherContainer.playerId].y < (players[grabbedBy].y)) {
          log('moving right and grabbed player Y is above grabber');
          log('Grabber Y = ', players[grabbedBy].y,  '\n', 'Grabbed Y = ', players[otherContainer.playerId].y);
          // otherContainer.body.setVelocityY(125);
          otherContainer.body.y = (players[grabbedBy].y);
        } else if(players[otherContainer.playerId].y == (players[grabbedBy].y)) {
          log('moving right and grabbed player Y equal to grabber');
          log('Grabber Y = ', players[grabbedBy].y,  '\n', 'Grabbed Y = ', players[otherContainer.playerId].y);
          otherContainer.body.setVelocityY(0);
          // otherContainer.body.y = (players[grabbedBy].y);
        }
      } else {
        otherContainer.body.setVelocityX(0);
      }

      if(players[otherContainer.playerId].y > (players[grabbedBy].y + 60)){
        log('grabbed player is below the grabber');
        otherContainer.body.setVelocityY(-250);
        // otherContainer.body.y = (players[grabbedBy].y);
        players[otherContainer.playerId].rotation = 3;
        players[otherContainer.playerId].isMoving = true;
        if(players[otherContainer.playerId].position.x > (players[grabbedBy].position.x)) {
          log('moving down and grabbed player X to the left of grabber');
          log('Grabber X = ', players[grabbedBy].position.x,  '\n', 'Grabbed X = ', players[otherContainer.playerId].position.x);
          // otherContainer.body.setVelocityX(-125);
          otherContainer.body.position.x = (players[grabbedBy].position.x);
        } else if(players[otherContainer.playerId].position.x < (players[grabbedBy].position.x)) {
          log('moving down and grabbed player X to the right of grabber');
          log('Grabber X = ', players[grabbedBy].position.x,  '\n', 'Grabbed X = ', players[otherContainer.playerId].position.x);
          // otherContainer.body.setVelocityX(125);
          otherContainer.body.x = (players[grabbedBy].position.x);
        }  else if(players[otherContainer.playerId].position.x == (players[grabbedBy].position.x)) {
          log('moving down and grabbed player X equal to grabber');
          log('Grabber X = ', players[grabbedBy].position.x,  '\n', 'Grabbed X = ', players[otherContainer.playerId].position.x);
          otherContainer.body.setVelocityX(0);
        }
      } else if(players[otherContainer.playerId].y < (players[grabbedBy].y - 60)){
        log('grabbed player is above the grabber');
        otherContainer.body.setVelocityY(250);
        // otherContainer.body.y = (players[grabbedBy].y);
        players[otherContainer.playerId].rotation = 4;
        players[otherContainer.playerId].isMoving = true;
        if(players[otherContainer.playerId].position.x > (players[grabbedBy].position.x)) {
          log('moving up and grabbed player X is to the right of grabber');
          log('Grabber X = ', players[grabbedBy].position.x,  '\n', 'Grabbed X = ', players[otherContainer.playerId].position.x);
          // otherContainer.body.setVelocityX(-125);
          otherContainer.body.x = (players[grabbedBy].position.x);
        } else if(players[otherContainer.playerId].position.x < (players[grabbedBy].position.x)) {
          log('moving up and grabbed player X is to the left of grabber');
          log('Grabber X = ', players[grabbedBy].x,  '\n', 'Grabbed X = ', players[otherContainer.playerId].x);
          // otherContainer.body.setVelocityX(125);
          otherContainer.body.x = (players[grabbedBy].position.x);
        } else if(players[otherContainer.playerId].position.x == (players[grabbedBy].position.x)) {
          log('moving up and grabbed player X equal to grabber');
          log('Grabber X = ', players[grabbedBy].x,  '\n', 'Grabbed x = ', players[otherContainer.playerId].position.x);
          otherContainer.body.setVelocityX(0);
          // otherContainer.body.position.x = (players[grabbedBy].position.x);
        }
      } else {
        otherContainer.body.setVelocityY(0);
      }

      if(otherContainer.body.velocity.y == 0 && otherContainer.body.velocity.x == 0) {
        players[otherContainer.playerId].isMoving = false;
      }
      if(input.left || input.right || input.up || input.down) {
        players[otherContainer.playerId].grabbedBy = null;
      }
    } else {
      if (input.left) {
        //log('player = ', player);
        otherContainer.body.setVelocityX(-250);
        // log('otherContainer = ', otherContainer);
        //log('zim =', players[player.playerId]);
        //log('zam = ', this.container);
        //log('zoom = ', player);
          //log('player = ', players[player.playerId].playerId, '\n', 'input = ', players[player.playerId].input, '\n', 'whole player object = ', players[player.playerId]);
          players[otherContainer.playerId].rotation = 1;
          players[otherContainer.playerId].isMoving = true;


          // log('players[otherContainer.playerId] = ', players[otherContainer.playerId]);
          // log('otherContainer.body = ', otherContainer.body.y);
          // log('players[otherContainer.playerId].debug = ', players[otherContainer.playerId].debug);
          players[otherContainer.playerId].debug.x = otherContainer.body.x;
          players[otherContainer.playerId].debug.y = otherContainer.body.y;
          players[otherContainer.playerId].debug.width = otherContainer.body.width;
          players[otherContainer.playerId].debug.height = otherContainer.body.height;
          // log('debug moving left = ', players[otherContainer.playerId].debug.x);


           // log(players[player.playerId].firstName,"'s X coordinate is: ", this.container.body.x);
           // log(players[player.playerId].firstName,"'s Y coordinate is: ", this.container.body.y);
      } else if (input.right) {
        otherContainer.body.setVelocityX(250);
        players[otherContainer.playerId].rotation = 2;
        players[otherContainer.playerId].isMoving = true;
        // log(players[player.playerId].firstName,"'s X coordinate is: ", this.container.body.x);
        // log(players[player.playerId].firstName,"'s Y coordinate is: ", this.container.body.y);
      } else {
        otherContainer.body.setVelocityX(0);
      }

      if (input.up) {
        otherContainer.body.setVelocityY(-250);
        players[otherContainer.playerId].rotation = 3;
        players[otherContainer.playerId].isMoving = true;
        // log(players[player.playerId].firstName,"'s X coordinate is: ", this.container.body.x);
        // log(players[player.playerId].firstName,"'s Y coordinate is: ", this.container.body.y);
      } else if (input.down) {
        otherContainer.body.setVelocityY(250);
        players[otherContainer.playerId].rotation = 4;
        players[otherContainer.playerId].isMoving = true;
        // log(players[player.playerId].firstName,"'s X coordinate is: ", this.container.body.x);
        // log(players[player.playerId].firstName,"'s Y coordinate is: ", this.container.body.y);
      } else {
        otherContainer.body.setVelocityY(0);
      }
      // log(otherContainer.body.velocity.x);
      // log(otherContainer.body.velocity.y);
      if(otherContainer.body.velocity.y == 0 && otherContainer.body.velocity.x == 0) {
        players[otherContainer.playerId].isMoving = false;
      }
    }
    

      if(otherContainer.door) {
        if(otherContainer.door == 'door_clothing_store') {
          log('player in door status: ', otherContainer.door);
          otherContainer.body.x = 10544;
          otherContainer.body.y = 4529;
          players[otherContainer.playerId].position.x = otherContainer.body.position.x;
          players[otherContainer.playerId].position.y = otherContainer.body.position.y;
          otherContainer.door = '';
        }
        if(otherContainer.door == 'clothing_store_exit_rug') {
          log('player in door status: ', otherContainer.door);
          otherContainer.body.position.x = 6398;
          otherContainer.body.position.y = 5632;
          players[otherContainer.playerId].position.x = otherContainer.body.position.x;
          players[otherContainer.playerId].position.y = otherContainer.body.position.y;
          otherContainer.door = '';
        }
        if (otherContainer.door == 'door_pub') {
          log('player in door status: ', otherContainer.door);
          otherContainer.body.x = 10806;
          otherContainer.body.y = 3337;
          players[otherContainer.playerId].position.x = otherContainer.body.position.x;
          players[otherContainer.playerId].y = otherContainer.body.y;
          otherContainer.door = '';
        }
        if (otherContainer.door == 'pub_exit_rug') {
          log('player in door status: ', otherContainer.door);
          otherContainer.body.x = 4292;
          otherContainer.body.y = 4165;
          players[otherContainer.playerId].position.x = otherContainer.body.x;
          players[otherContainer.playerId].position.y = otherContainer.body.y;
          otherContainer.door = '';
        }
        if (otherContainer.door == 'door_spa') {
          log('player in door status: ', otherContainer.door);
          otherContainer.body.x = 10266;
          otherContainer.body.y = 973;
          players[otherContainer.playerId].position.x = otherContainer.body.x;
          players[otherContainer.playerId].position.y = otherContainer.body.y
          otherContainer.door = '';
        }
      } else {
        players[otherContainer.playerId].position.x = otherContainer.body.x;
        players[otherContainer.playerId].position.y = otherContainer.body.y;
        // log('Player X Position: ', players[otherContainer.playerId].position.x);
        // log('Player Y Position: ', players[otherContainer.playerId].position.y);
      }
      //players[player.playerId].rotation = player.rotation;
    // }
    // log('player = ', players[player.playerId].playerId, 'input = ', players[player.playerId].input);
  });

  io.emit('playerUpdates', players);
}

//----- This is called whenever a player connects via socket.io -----//
function addPlayer(self, playerInfo) {
  let playerContainer = self.physics.add.sprite(playerInfo.position.x, playerInfo.position.y, playerInfo.head.sprite);
  playerContainer.setOrigin(1, 1); // Set anchor point to top-left corner
  playerContainer.setSize(60, 15);
  


  
  playerContainer.playerId = playerInfo.playerId;
  self.players.add(playerContainer);



  log(playerInfo.firstName, ' added to Serverside Phaser Instance successfully!');
  // log('playerContainer = ', playerContainer);
  // log('self.players.playerId = ', self.players.playerId);
  // log('coordinatesX = ', playerContainer.x, 'coordinates Y = ', playerContainer.y);
  // log('player coordinates are: X= ', playerInfo.position.x, 'Y= ', playerInfo.position.y);
}

//----- This is called whenever a player disconnects via socket.io -----//
function removePlayer(self, playerId) {
  self.players.getChildren().forEach((player) => {
    if (playerId === player.playerId) {
      log('player ID match found...Destroying player.');
      player.destroy();
    }
  });
}

//----- This is called whenever socket.io sends a player input message indicating that the state of the directional keys has changed for that player -----//
function handlePlayerInput(self, playerId, input) {
  self.players.getChildren().forEach((playerContainer) => {
    if (playerId === playerContainer.playerId) {
      // log('coordinatesX = ', players[playerContainer.playerId].position.x, 'coordinates Y = ', players[playerContainer.playerId].position.y);
      players[playerContainer.playerId].input = input;
    }
  });
}

//----- This is called whenever a player enters a door in game -----//
function handleDoorTransport(self, playerId, door) {
  log('standing in door');
  if (playerId === playerContainer.playerId) {
    log('playerId verified');
    log(players[playerContainer.playerId]);
    players[playerContainer.playerId].position.x = 10561;
    players[playerContainer.playerId].position.y = 4499
  }
}

async function examiningPlayer(clicked, socket){
  let charId = clicked._id;
  log('character ID = ', charId);
  try{
    // const result = await User.find(ObjectId(charId));
    const result = await User.find({"characters._id":  charId});
    // const result = await User.match(ObjectId(charId));
    // log('Result = ', result[0]);
    for (let i = 0; i < result[0].characters.length; i++) {
      // log('Result = ', result.characters[i]);
      if(result[0].characters[i]._id == charId) {
        log('successfully found character!!!');
        // log('Result = ', result.characters[i]);
        var examinedItem = {
          firstName: result[0].characters[i].firstName,
          lastName: result[0].characters[i].lastName,
          speciesName: result[0].characters[i].speciesName,
          icDescrip: result[0].characters[i].icDescrip,
          oocDescrip: result[0].characters[i].oocDescrip,
          Identifier: 'player'
        }
      }
    }
    // await result.save();
    socket.emit('examinedInfo', examinedItem);
  } catch(e){
    log('Error in attempting to find Examined Player. Error message: ', e);
  }
}



async function voreChamberUpdate(voreUpdate, cookie, socket){
  players[socket.id].voreTypes
  let id = voreUpdate.voreFormId;
  let token = voreUpdate.token.replace('TastyTails=','');;
  let charId = voreUpdate.charId;
  // const token = cookie.replace('TastyTails=','');
  // log('token = ', token)
  let chamberSettings = voreUpdate.chamberSettings;
  let digestionTimer = voreUpdate.digestionTimer;
  let leavesRemains = voreUpdate.leavesRemains;
  let remainsType = voreUpdate.remainsType;
  let remainsExit = voreUpdate.remainsExit;
  let soulInteraction = voreUpdate.soulInteraction;

  const verified = jwt.verify(token, process.env.TOKEN_SECRET);
  log('player ID = ', verified);
  log('character ID = ', charId);
  log('Vore Chamber ID to Edit: ', id);


  try{
    const result = await User.findById(ObjectId(verified._id));
    // log('Result = ', result.characters);
    for (let i = 0; i < result.characters.length; i++) {
      // log('Result = ', result.characters[i]);
      if(result.characters[i]._id == charId) {
        log('successfully found character!!!');
        // log('Result = ', result.characters[i]);
        for (let n = 0; n < result.characters[i].voreTypes.length; n++) {
          // log(result.characters[i].voreTypes[n]._id);
          result.characters[i].voreTypes[n]._id == id;
          if(result.characters[i].voreTypes[n]._id == id) {
            log('successfully found Vore Chamber to Edit!!!');
            log('Vore Chamber ID to Edit: ', id);
            log('Vore Chamber Details: ', result.characters[i].voreTypes[n]);
            result.characters[i].voreTypes[n].chamberSettings = chamberSettings;
            result.characters[i].voreTypes[n].digestionTimer = digestionTimer;
            result.characters[i].voreTypes[n].leavesRemains = leavesRemains;
            result.characters[i].voreTypes[n].remainsType = remainsType;
            result.characters[i].voreTypes[n].remainsExit = remainsExit;
            result.characters[i].voreTypes[n].soulInteraction = soulInteraction;

            await result.save();
            socket.emit('chamberSettingsUpdate');
          }
        }
      }
    }
  } catch(e){
    log('Error updating Vore Chamber Settings. Error message: ', e);
  }
}

async function listDatabases(client){
  databasesList = await client.db().admin().listDatabases();
  log("Databases:");
  databasesList.databases.forEach(db => log(` - ${db.name}`));
};

//Get chats from mongo colletion
async function getAllChats(data, socket){
  let token = data.token;
  let charId = data.charId;
  const verified = jwt.verify(token, process.env.TOKEN_SECRET);

  try {
    const chats = await Chats.find().sort({'message.time': -1}).limit(5);
    const allMsgs = [];
    for (let i = 0; i < chats.length; i++) {
      let message = {
        _id: chats[i]._id,
        name: chats[i].name,
        message: chats[i].message,
        spoiler: chats[i].spoiler,
        deleted: chats[i].deleted,
        identifier: chats[i].identifier.character
      }
      allMsgs.push(message);
    }
    // log('chats = ', allMsgs);
    socket.emit('output', allMsgs.reverse());
  } catch (e){
    log('error getting all chats. Error Message = ', e);
  }
}

async function addMessage(data, socket){
  var urlifiedMessage = urlify(data.message);
  log('messageVersions = ', urlifiedMessage);
  let name = data.name;
  let message = urlifiedMessage;
  let spoilerStatus = {
    status: data.spoiler,
    votes: {
      watersports: 0,
      disposal: 0,
      gore: 0
    }
  }
  let time = new Date().toUTCString();
  let messageVersions = [
    message = {
      content:message,
      time:time
    }
  ]
  let removal = {
    status: false,
    deletionTime: null
  }
  let token = data.token;
  let charId = data.charId;

  const verified = jwt.verify(token, process.env.TOKEN_SECRET);
  log('player ID = ', verified);
  log('character ID = ', charId);


  function removeTags(str) {
    if ((str===null) || (str===''))
        return false;
    else
        str = str.toString();
    // Regular expression to identify HTML tags in
    // the input string. Replacing the identified
    // HTML tag with a null string.
    return str.replace( /(<([^>]+)>)/ig, '');
  }
  let charCount = removeTags(data.message).length;
  // data.message.length;
  log('charCount = ', charCount);
  if(charCount > 10000){
    socket.emit('tooManyChars', charCount, data.message);
  } else{
    try{
      const result = new Chats({
        name: name,
        message: messageVersions,
        spoiler: spoilerStatus,
        deleted: removal,
        identifier: {
          account: verified,
          character: charId
        }
      });
      await result.save();
      // log(result);
      // log('post time = ', result.message[result.message.length-1].time);
      const clientMsg = {
        _id: result._id,
        name: result.name,
        message: result.message,
        spoiler: result.spoiler,
        deleted: result.deleted,
        identifier: result.identifier.character
      }
      log('post content = ', result.message[result.message.length-1].content);
      io.emit('output', [clientMsg]);
    } catch(e){
      log('error sending message to MongoDB. Error Message: ', e);
    }
    // const result = await client.db("test").collection("chats").insertOne({name: name, message: messageVersions, spoiler: spoilerStatus, deleted: removal});
    // log('new message saved with the following info: \n', result.insertedId, '\n', result.name, '\n', result.message);
    // log(result);
    // const success = await client.db("test").collection("chats").findOne({_id: result.insertedId});
    // log(success);
    // log('post time = ', success.message[success.message.length-1].time);
    // log('post content = ', success.message[success.message.length-1].content);

    // io.emit('output', [success]);
    //Send status object
  }
}

async function editMessage(data, socket){
  log('edited data.message (before urlify) =', data.message);
  var urlifiedMessage = urlify(data.message);
  log('urlifiedMessage = ', urlifiedMessage);
  let id = new ObjectId(data._id);
  let message = urlifiedMessage;
  let time = new Date().toUTCString();
  let messageVersions = [
    message = {
      content:message,
      time:time
    }
  ]
  let token = data.token;
  let charId = data.charId;
  const verified = jwt.verify(token, process.env.TOKEN_SECRET);

  log('player ID = ', verified);
  log('character ID = ', charId);
  log('Editing messge: ');
  log('Edited id = ', id);
  log('Edited message = ', message);
  log('New Time = ', time);
  log('messageVersions Object = ', messageVersions);

  try{
    const result = await Chats.findById(ObjectId(id));
    // log('result = ', result);
    log('result.identifier = ', result.identifier);
    if (result.identifier.account == verified._id && result.identifier.character == charId){
      result.message.push(message);
      await result.save();
      log(result);
      // log('post time = ', result.message[result.message.length-1].time);
      log('post content = ', result.message[result.message.length-1].content);
      io.emit('editOutput', result);
    }else{
      log('attempting to edit incorrect message...');
      socket.emit('editOutput', result);
    }
  } catch(e){
    log('error getting edited message to MongoDB. Error Message: ', e);
  }

  // const result = await client.db("test").collection("chats").updateOne({_id: ObjectId(id)}, {$push: {"message": message}});
  //
  // log(`${result.matchedCount} document(s) matched the query criteria.`);
  // log(`${result.modifiedCount} document(s) was/were updated.`);
  //
  // const success = await client.db("test").collection("chats").findOne({_id: ObjectId(id)});
  //
  // io.emit('editOutput', success);
}


async function deleteMessage(data, socket){
  let id = new ObjectId(data._id);
  let time = new Date().toUTCString();
  let token = data.token;
  let charId = data.charId;
  const verified = jwt.verify(token, process.env.TOKEN_SECRET);
  let removal = {
      status: true,
      deletionTime:time
    }


  log('Deleting messge: ');
  log('Deleted id = ', id);
  log('Deletion Time = ', time);

  try{
    const result = await Chats.findById(ObjectId(id));
    if (result.identifier.account == verified._id && result.identifier.character == charId){
      // const delresult = await Chats.updateOne({_id:ObjectId(id)}, {deleted:removal});
      result.deleted = removal;
      await result.save();
      // log(delresult);
      io.emit('editOutput', result);
    }else{
      log('attempting to delete incorrect message...');
    }
  } catch(e){
    log('error getting edited message to MongoDB. Error Message: ', e);
  }

  // const result = await client.db("test").collection("chats").updateOne({_id: ObjectId(id)}, {$set: {deleted: removal}});
  //
  // log(`${result.matchedCount} document(s) matched the query criteria.`);
  // log(`${result.modifiedCount} document(s) was/were updated.`);
  //
  // const success = await client.db("test").collection("chats").findOne({_id: ObjectId(id)});
  //
  // socket.broadcast.emit('editOutput', success);
}

async function changeSpoilerLabel(data, socket){
  let id = new ObjectId(data._id);
  let spoiler = data.spoiler;
  let token = data.token;
  let charId = data.charId;
  const verified = jwt.verify(token, process.env.TOKEN_SECRET);

  log('Editing spoiler: ');
  log('Edited id = ', id);
  log('Edited spoil status = ', spoiler);

  try{
    // const result = await Chats.updateOne({_id:ObjectId(id)}, {$set: {'spoiler.status': spoiler}});
    const result = await Chats.findById(ObjectId(id));
    if (result.identifier.account == verified._id && result.identifier.character == charId){
      result.spoiler.status = spoiler;
      await result.save();
      log(result);
      io.emit('editSpoilerOutput', result);
    }else{
      log('wanting to vote on spoiler change...');
    }
  } catch(e){
    log('error getting edited message to MongoDB. Error Message: ', e);
  }

  // const result = await client.db("test").collection("chats").updateOne({_id: ObjectId(id)}, {$set: {'spoiler.status': spoiler}});
  //
  // log(`${result.matchedCount} document(s) matched the query criteria.`);
  // log(`${result.modifiedCount} document(s) was/were updated.`);
  //
  // const success = await client.db("test").collection("chats").findOne({_id: ObjectId(id)});
  //
  // io.emit('editSpoilerOutput', success);
}

function urlify(text) {
  var urlRegex = /((?:(http|https|Http|Https|rtsp|Rtsp):\/\/(?:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,64}(?:\:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,25})?\@)?)?((?:(?:[a-zA-Z0-9][a-zA-Z0-9\-]{0,64}\.)+(?:(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])|(?:biz|b[abdefghijmnorstvwyz])|(?:cat|com|coop|c[acdfghiklmnoruvxyz])|d[ejkmoz]|(?:edu|e[cegrstu])|f[ijkmor]|(?:gov|g[abdefghilmnpqrstuwy])|h[kmnrtu]|(?:info|int|i[delmnoqrst])|(?:jobs|j[emop])|k[eghimnrwyz]|l[abcikrstuvy]|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])|(?:name|net|n[acefgilopruz])|(?:org|om)|(?:pro|p[aefghklmnrstwy])|qa|r[eouw]|s[abcdeghijklmnortuvyz]|(?:tel|travel|t[cdfghjklmnoprtvwz])|u[agkmsyz]|v[aceginu]|w[fs]|y[etu]|z[amw]))|(?:(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[0-9])))(?:\:\d{1,5})?)(\/(?:(?:[a-zA-Z0-9\;\/\?\:\@\&\=\#\~\-\.\+\!\*\'\(\)\,\_])|(?:\%[a-fA-F0-9]{2}))*)?(?:\b|$)+/gi;
  // var urlRegex = /((<a href=")?(\/\/)?(\"\>)?(<\/a>)?)/gi;
  // var urlRegex = /((<a href=")?(\/\/)?(((?:(http|https|Http|Https|rtsp|Rtsp):\/\/(?:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,64}(?:\:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,25})?\@)?)?((?:(?:[a-zA-Z0-9][a-zA-Z0-9\-]{0,64}\.)+(?:(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])|(?:biz|b[abdefghijmnorstvwyz])|(?:cat|com|coop|c[acdfghiklmnoruvxyz])|d[ejkmoz]|(?:edu|e[cegrstu])|f[ijkmor]|(?:gov|g[abdefghilmnpqrstuwy])|h[kmnrtu]|(?:info|int|i[delmnoqrst])|(?:jobs|j[emop])|k[eghimnrwyz]|l[abcikrstuvy]|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])|(?:name|net|n[acefgilopruz])|(?:org|om)|(?:pro|p[aefghklmnrstwy])|qa|r[eouw]|s[abcdeghijklmnortuvyz]|(?:tel|travel|t[cdfghjklmnoprtvwz])|u[agkmsyz]|v[aceginu]|w[fs]|y[etu]|z[amw]))|(?:(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[0-9])))(?:\:\d{1,5})?)(\/(?:(?:[a-zA-Z0-9\;\/\?\:\@\&\=\#\~\-\.\+\!\*\'\(\)\,\_])|(?:\%[a-fA-F0-9]{2}))*)?(?:\b|$))?(\" target\=\"_blank)?(\"\>)?(((?:(http|https|Http|Https|rtsp|Rtsp):\/\/(?:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,64}(?:\:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,25})?\@)?)?((?:(?:[a-zA-Z0-9][a-zA-Z0-9\-]{0,64}\.)+(?:(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])|(?:biz|b[abdefghijmnorstvwyz])|(?:cat|com|coop|c[acdfghiklmnoruvxyz])|d[ejkmoz]|(?:edu|e[cegrstu])|f[ijkmor]|(?:gov|g[abdefghilmnpqrstuwy])|h[kmnrtu]|(?:info|int|i[delmnoqrst])|(?:jobs|j[emop])|k[eghimnrwyz]|l[abcikrstuvy]|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])|(?:name|net|n[acefgilopruz])|(?:org|om)|(?:pro|p[aefghklmnrstwy])|qa|r[eouw]|s[abcdeghijklmnortuvyz]|(?:tel|travel|t[cdfghjklmnoprtvwz])|u[agkmsyz]|v[aceginu]|w[fs]|y[etu]|z[amw]))|(?:(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[0-9])))(?:\:\d{1,5})?)(\/(?:(?:[a-zA-Z0-9\;\/\?\:\@\&\=\#\~\-\.\+\!\*\'\(\)\,\_])|(?:\%[a-fA-F0-9]{2}))*)?(?:\b|$))(<\/a>)?)/gi

  // const relativeCheck = new RegExp('^(?:[a-z]+:)?//', 'i');
  const ahrefCheck = /((<a href=")(\/\/)?(((?:(http|https|Http|Https|rtsp|Rtsp):\/\/(?:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,64}(?:\:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,25})?\@)?)?((?:(?:[a-zA-Z0-9][a-zA-Z0-9\-]{0,64}\.)+(?:(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])|(?:biz|b[abdefghijmnorstvwyz])|(?:cat|com|coop|c[acdfghiklmnoruvxyz])|d[ejkmoz]|(?:edu|e[cegrstu])|f[ijkmor]|(?:gov|g[abdefghilmnpqrstuwy])|h[kmnrtu]|(?:info|int|i[delmnoqrst])|(?:jobs|j[emop])|k[eghimnrwyz]|l[abcikrstuvy]|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])|(?:name|net|n[acefgilopruz])|(?:org|om)|(?:pro|p[aefghklmnrstwy])|qa|r[eouw]|s[abcdeghijklmnortuvyz]|(?:tel|travel|t[cdfghjklmnoprtvwz])|u[agkmsyz]|v[aceginu]|w[fs]|y[etu]|z[amw]))|(?:(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[0-9])))(?:\:\d{1,5})?)(\/(?:(?:[a-zA-Z0-9\;\/\?\:\@\&\=\#\~\-\.\+\!\*\'\(\)\,\_])|(?:\%[a-fA-F0-9]{2}))*)?(?:\b|$)?)(\" target\=\"\_blank\"\>)(((?:(http|https|Http|Https|rtsp|Rtsp):\/\/(?:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,64}(?:\:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,25})?\@)?)?((?:(?:[a-zA-Z0-9][a-zA-Z0-9\-]{0,64}\.)+(?:(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])|(?:biz|b[abdefghijmnorstvwyz])|(?:cat|com|coop|c[acdfghiklmnoruvxyz])|d[ejkmoz]|(?:edu|e[cegrstu])|f[ijkmor]|(?:gov|g[abdefghilmnpqrstuwy])|h[kmnrtu]|(?:info|int|i[delmnoqrst])|(?:jobs|j[emop])|k[eghimnrwyz]|l[abcikrstuvy]|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])|(?:name|net|n[acefgilopruz])|(?:org|om)|(?:pro|p[aefghklmnrstwy])|qa|r[eouw]|s[abcdeghijklmnortuvyz]|(?:tel|travel|t[cdfghjklmnoprtvwz])|u[agkmsyz]|v[aceginu]|w[fs]|y[etu]|z[amw]))|(?:(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[0-9])))(?:\:\d{1,5})?)(\/(?:(?:[a-zA-Z0-9\;\/\?\:\@\&\=\#\~\-\.\+\!\*\'\(\)\,\_])|(?:\%[a-fA-F0-9]{2}))*)?(?:\b|$)?)(<\/a>))/gi

  return text.replace(urlRegex, function(url) {
    log('raw url without href = ', url);
    const r = new RegExp('^(?:[a-z]+:)?//', 'i');
      log('r.test = ', r.test(url));
      if(r.test(url)){
        var absoluteUrl = url
        return '<a href="'+ absoluteUrl +'" target="_blank">' + absoluteUrl + '</a>';
      }else{
        var absoluteUrl = '//'+url
        return '<a href="'+ absoluteUrl +'" target="_blank">' + url + '</a>';
      }
  })




  // var urlRegex = /((?:(http|https|Http|Https|rtsp|Rtsp):\/\/(?:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,64}(?:\:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,25})?\@)?)?((?:(?:[a-zA-Z0-9][a-zA-Z0-9\-]{0,64}\.)+(?:(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])|(?:biz|b[abdefghijmnorstvwyz])|(?:cat|com|coop|c[acdfghiklmnoruvxyz])|d[ejkmoz]|(?:edu|e[cegrstu])|f[ijkmor]|(?:gov|g[abdefghilmnpqrstuwy])|h[kmnrtu]|(?:info|int|i[delmnoqrst])|(?:jobs|j[emop])|k[eghimnrwyz]|l[abcikrstuvy]|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])|(?:name|net|n[acefgilopruz])|(?:org|om)|(?:pro|p[aefghklmnrstwy])|qa|r[eouw]|s[abcdeghijklmnortuvyz]|(?:tel|travel|t[cdfghjklmnoprtvwz])|u[agkmsyz]|v[aceginu]|w[fs]|y[etu]|z[amw]))|(?:(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[0-9])))(?:\:\d{1,5})?)(\/(?:(?:[a-zA-Z0-9\;\/\?\:\@\&\=\#\~\-\.\+\!\*\'\(\)\,\_])|(?:\%[a-fA-F0-9]{2}))*)?(?:\b|$)/gi;
  //
  // return text.replace(urlRegex, function(url) {
  //   const r = new RegExp('^(?:[a-z]+:)?//', 'i');
  //   log('r.test = ', r.test(url));
  //   if(r.test(url)){
  //     return '<a href="'+ url +'" target="_blank">' + url + '</a>';
  //   }else{
  //     return '<a href="//'+ url +'" target="_blank">' + url + '</a>';
  //   }
  // })
}

//----- Saves the Phaser Configuration and then tells the server that Phaser has finished loading -----//
const game = new Phaser.Game(config);





function setupAuthoritativePhaser() {
  JSDOM.fromFile(path.join(__dirname, 'authoritative_server/index.html'), {
    // To run the scripts in the html file
    runScripts: "dangerously",
    // Also load supported external resources
    resources: "usable",
    // So requestAnimatinFrame events fire
    pretendToBeVisual: true
  }).then((dom) => {
    //----- The following code is meant to prevent a 'Uncought [TypeError: URL.createObjectURL is not a function]' error message from occuring -----//
    dom.window.URL.createObjectURL = (blob) => {
      if (blob){
        //log('blob = ', blob);
        return datauri.format(blob.type, blob[Object.getOwnPropertySymbols(blob)[0]]._buffer).content;
      }
    };
    dom.window.URL.revokeObjectURL = (objectURL) => {};

    //----- the following code ensures that phaser has completely loaded on the server before attempting to launch the server -----//
    dom.window.gameLoaded = () => {
      dom.window.io = io;
      //----- Launches the server using Port 3000 -----//
      http.listen(3000, function () {
        log(`Listening on ${http.address().port}`);
      });
    };
  }).catch((error) => {
    log(error.message);
  });
}

// setupAuthoritativePhaser();
http.listen(3000, function () {
  log(`Listening on ${http.address().port}`);
});
