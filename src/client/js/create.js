import { game, socket } from './index.js'
import resize from './resize.js'
import Character from './entities/character.js'
import ui from './ui.js'

// Up here we are importing the game object from ./index.js
var create = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function create() {
  ////active is set to false here, so it waits for a command to launch////
  Phaser.Scene.call(this, {key: 'create', active: false});
  this.pic;
  },
  create() {
  let scene = this
  let entities = game.entities
  let characters = entities.characters
  let playerCharacter = entities.playerCharacter
  console.log('Create Started');

  //Loads the json  file and also the map tileset
   const map = this.make.tilemap({key: 'level_2'});
   const tileset = map.addTilesetImage('spritesheet');

   //Creates "layers" of different map tiles to be placed on top of one another
   const roof2_layer = map.createStaticLayer('roof2', tileset, 0, 0);
   const roof_layer = map.createStaticLayer('roof', tileset, 0, 0);
   const grass_layer = map.createStaticLayer('grass', tileset, 0, 0);
   const background_layer = map.createStaticLayer('background', tileset, 0, 0);
   const background2_layer = map.createStaticLayer('background2', tileset, 0, 0);
   const background3_layer = map.createStaticLayer('background3', tileset, 0, 0);
   const ground_layer = map.createStaticLayer('blocked', tileset, 0, 0);
   const ground2_layer = map.createStaticLayer('blocked2', tileset, 0, 0);

   //defines the height that each map layer is displayed at and what tile IDs player can collide with

   roof2_layer.depth = 4;
   roof2_layer.setCollision(-1);
   roof_layer.depth = 3;
   roof_layer.setCollision(-1);
   grass_layer.depth = 2;
   grass_layer.setCollision(-1);
   ground_layer.setCollision([73, 74, 75, 292, 329, 450, 451, 452, 454, 455, 456, 482, 513, 514, 515, 516, 517, 518, 518, 583, 584, 589, 609, 610, 611, 645, 646, 647, 648, 651, 705, 706, 707, 712, 771, 772, 773, 774, 775, 776, 833, 834, 835, 836, 837, 838, 839, 840, 1300, 1301, 1302, 1363, 1364, 1366, 1367, 1427, 1431, 1491, 1492, 1494, 1495, 1556, 1557, 1558, 2369, 2370, 2371, 2433, 2434, 2435, 2497, 2498, 2499,]);
   ground_layer.depth = 0;
   ground2_layer.setCollision(-1);
   background_layer.setCollision(-1);
   background2_layer.setCollision(-1);
   background3_layer.setCollision(-1);
   ground_layer.setCollisionFromCollisionGroup();
   //makes all the objects you can't walk through
   //blocked = this.physics.add.staticGroup();


  game.key = {
    up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
    down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
    left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
    right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
    d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
  }

  entities.playerCharacter = new Character(socket.id, {x: 50, y: 50}, scene)
  let cam1 = this.cameras.main.setSize(920, 920).startFollow(entities.playerCharacter.sprite.container).setName('Camera 1');
  console.log(game)

  socket.on('player join', (data) => {
    // When a player joins, a new instance of the class Character is created
    // It is then added to the game.entities.characters array
    // here it is references as just characters for easy use
    let character = new Character(data.id, data.position, scene)
    if (data.id === socket.id) {
      playerCharacter = character
    }
    characters[data.id] = character
  })

  socket.on('update position', (data) => {
    let character = characters[data.id]
    if (!!data.position) {
      character.updatePosition(data.position)
    }
  })

  socket.on('update velocity', (data) => {
    let character = characters[data.id]
    console.log('update velocity', data)
    if (!!data.velocity) {
      character.updateVelocity(data.velocity)
    }
  })

  this.events.on('resize', resize, this)

  }
});
export default create;
