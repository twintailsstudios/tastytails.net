import { game, socket } from './index.js'
import resize from './resize.js'
import Character from './entities/character.js'
import ui from './ui.js'

// Up here we are importing the game object from ./index.js
var create = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function create() {
    //active is set to false here, so it waits for a command to launch from preload.js
    Phaser.Scene.call(this, {key: 'create', active: false});
    this.pic;
  },
  create() {
    var self = this;
    this.socket = io();
    this.otherPlayers = this.physics.add.group();
    this.socket.on('currentPlayers', function (players) {
      Object.keys(players).forEach(function (id) {
        if (players[id].playerId === self.socket.id) {
          addPlayer(self, players[id]);
        } else {
          addOtherPlayers(self, players[id]);
        }
      });
    });
    this.socket.on('newPlayer', function (playerInfo) {
      addOtherPlayers(self, playerInfo);
    });
    this.socket.on('disconnect', function (playerId) {
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerId === otherPlayer.playerId) {
          otherPlayer.destroy();
        }
      });
    });
    this.socket.on('playerMoved', function (playerInfo) {
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerInfo.playerId === otherPlayer.playerId) {
          otherPlayer.setPosition(playerInfo.x, playerInfo.y);
        }
      });
    });
    this.cursors = this.input.keyboard.createCursorKeys();
    const game = this;
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
    let blocked = this.physics.add.staticGroup();


    function addPlayer(self, playerInfo) {
      self.avatar = self.physics.add.image(playerInfo.x, playerInfo.y, 'dude').setOrigin(0.5, 0.5);
        let cam1 = self.cameras.main.setSize(920, 920).startFollow(self.avatar).setName('Camera 1');
      self.avatar.setDrag(100);
      //self.avatar.setAngularDrag(100);
      self.avatar.setMaxVelocity(200);
      self.avatar.setSize(8, 8);
      self.avatar.setOffset(11, 40);
      self.avatar.setBounce(0.0);
      self.avatar.setCollideWorldBounds(false);

      //gives physics to local player so that they will obey blocked objects
      self.physics.add.collider(self.avatar, ground_layer);
    };

    function addOtherPlayers(self, playerInfo) {
      const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'dude').setOrigin(0.5, 0.5);

      otherPlayer.playerId = playerInfo.playerId;
      self.otherPlayers.add(otherPlayer);
    };
    //this.events.on('resize', resize, this)
  },

  update() {

    if (this.avatar) {
      if (this.cursors.left.isDown) {
        this.avatar.setVelocityX(-150);
        this.avatar.setVelocityY(0);
        console.log('Left arrow key pressed.');
      }
      else if (this.cursors.right.isDown) {
        this.avatar.setVelocityX(150);
        this.avatar.setVelocityY(0);
        console.log('Right arrow key pressed.');
      }
      else if (this.cursors.up.isDown) {
        this.avatar.setVelocityY(-150);
        this.avatar.setVelocityX(0);
        console.log('up arrow key pressed.');
      }
      else if (this.cursors.down.isDown) {
        this.avatar.setVelocityY(150);
        this.avatar.setVelocityX(0);
        console.log('Down arrow key pressed.');
      }
      else {
        this.avatar.setVelocity(0);
      }




      // emit player movement
      var x = this.avatar.x;
      var y = this.avatar.y;
      if (this.avatar.oldPosition && (x !== this.avatar.oldPosition.x || y !== this.avatar.oldPosition.y)) {
        this.socket.emit('playerMovement', { x: this.avatar.x, y: this.avatar.y });
      }
      // save old position data
      this.avatar.oldPosition = {
        x: this.avatar.x,
        y: this.avatar.y,
      };
    }
  }
});
export default create;
