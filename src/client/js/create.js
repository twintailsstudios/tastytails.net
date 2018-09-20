import { game, socket } from './index.js'
import resize from './resize.js'
import Character from './entities/character.js'
import ui from './ui.js'
var avatarSelected = false;
let avatarInfo = {
  head:"head1",
  body:"body1"
};
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
    this.socket.on('avatarSelection', function (playerInfo) {
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerInfo.playerId === otherPlayer.playerId) {
          addOtherPlayers(self, playerInfo);
          //playerInfo.head.add.image(playerInfo.head);
          console.log('otherPlayer in avatarSelection set to: ', playerInfo.head);
        }
      });
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

    //this detects if the game has been clicked so as to move the focus off of the chat div and back onto the game
    //allowing players to move again
    this.input.on('pointerdown', function (pointer) {

        document.getElementById('phaserApp').focus();
        //console.log('phaser game was clicked');

    }, this);


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


    //creating the avatar selection screen
    function addPlayer(self, playerInfo) {

      //predefining variables
      if (avatarSelected == false) {
        var characterSelect = null;
        var headSelect1 = null;
        var headSelect2 = null;
        var headSelect3 = null;

        console.log(playerInfo.playerId, 'is creating their avatar...');

        //creates background menu image for selectable options to sit on top of
        characterSelect = self.add.image(450, 500, 'characterselect').setScrollFactor(0);
        characterSelect.depth = 9;

        //creates a clickable purple head for character customization
        headSelect1 = self.add.image(600, 380, 'headselectpurple').setScrollFactor(0);
    		headSelect1.depth = 10;
    		headSelect1.setInteractive();
    		headSelect1.on('pointerdown', function () {
			     avatarInfo.head = 'dudeheadpurple';
           createSprite();
           console.log(playerInfo.playerId, 'Selected the purple head');
		    });

        //creates a clickable green head for character customization
        headSelect2 = self.add.image(650, 380, 'headselectgreen').setScrollFactor(0);
    		headSelect2.depth = 10;
    		headSelect2.setInteractive();
    		headSelect2.on('pointerdown', function () {
			     avatarInfo.head = 'dudeheadgreen';
           createSprite();
           console.log(playerInfo.playerId, 'Selected the green head');
		    });

        //creates a clickable blue head for character customization
        headSelect3 = self.add.image(700, 380, 'headselectblue').setScrollFactor(0);
    		headSelect3.depth = 10;
    		headSelect3.setInteractive();
    		headSelect3.on('pointerdown', function () {
			    avatarInfo.head = 'dudeheadblue';
          createSprite();
          console.log(playerInfo.playerId, 'Selected the blue head');
		    });

        //destroys the character selection menu after a sprite head is selected
        function createSprite (){
          let avatar = {};
          if(avatarInfo.head)avatar.head = self.physics.add.image(playerInfo.x, playerInfo.y, avatarInfo.head).setOrigin(0.5, 0.5);
          if(avatarInfo.body)avatar.body = self.physics.add.image(playerInfo.x, playerInfo.y, avatarInfo.body).setOrigin(0.5, 0.5);

            self.socket.emit('avatarSelected', { head: avatar.head, body: avatar.body });

          headSelect1.destroy();
          headSelect2.destroy();
          headSelect3.destroy();
          characterSelect.destroy();
          self.avatar = avatar;
          applyPhysics();
          avatarSelected = true;
        }
      }
      if (avatarSelected == false) {
        //self.avatar = self.physics.add.image(playerInfo.x, playerInfo.y, 'emptyplayer').setOrigin(0.5, 0.5);
        self.avatar2 = self.physics.add.image(playerInfo.x, playerInfo.y, 'dudebody').setOrigin(0.5, 0.5);
      }
      function applyPhysics () {
        //console.log('applyPhysics function called');
        let newSprite;
        //self.physics.add.group();
        let cam1 = self.cameras.main.setSize(920, 920).startFollow(self.avatar.head).setName('Camera 1');
        //physics for head
        self.avatar.head.setMaxVelocity(200);
        self.avatar.head.setSize(8, 8);
        self.avatar.head.setOffset(11, 40);
        self.avatar.head.setCollideWorldBounds(false);
        //gives physics to local player so that they will obey blocked objects
        self.physics.add.collider(self.avatar.head, ground_layer);
      }
      //physics for body
      self.avatar2.setMaxVelocity(200);
      self.avatar2.setSize(8, 8);
      self.avatar2.setOffset(11, 40);
      self.avatar2.setCollideWorldBounds(false);
      //gives physics to local player so that they will obey blocked objects
      self.physics.add.collider(self.avatar2, ground_layer);

    };

    function addOtherPlayers(self, playerInfo) {
      console.log('addOtherPlayer function called and playerInfo.head = ', playerInfo.head);
      const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, playerInfo.head).setOrigin(0.5, 0.5);

      otherPlayer.playerId = playerInfo.playerId;
      self.otherPlayers.add(otherPlayer);
    };
    //this.events.on('resize', resize, this)
  },

  update() {

    //makes phaser stop listening for keyboard inputs when user is focused on the chat div
    if (chatFocused == false) {
      this.input.keyboard.addKey(this.cursors.up);
      this.input.keyboard.addKey(this.cursors.down);
      this.input.keyboard.addKey(this.cursors.left);
      this.input.keyboard.addKey(this.cursors.right);
      this.input.keyboard.addKey(this.cursors.space);
      //console.log('keyboard enabled');
    }
    else {
      this.input.keyboard.removeKey(this.cursors.up);
      this.input.keyboard.removeKey(this.cursors.down);
      this.input.keyboard.removeKey(this.cursors.left);
      this.input.keyboard.removeKey(this.cursors.right);
      this.input.keyboard.removeKey(this.cursors.space);
      //console.log('keyboard disabled');
    }

    if (this.avatar) {
      //makes it so that variables left, right, up, and down are not checked for while undefined when user is focused on chat div
      if (avatarSelected == true) {
        if (chatFocused == false) {
          if (this.cursors.left.isDown) {
            this.avatar.head.setVelocityX(-150);
            this.avatar.head.setVelocityY(0);
            this.avatar2.setVelocityX(-150);
            this.avatar2.setVelocityY(0);
            //console.log('Left arrow key pressed.');
          }
          else if (this.cursors.right.isDown) {
            this.avatar.head.setVelocityX(150);
            this.avatar.head.setVelocityY(0);
            this.avatar2.setVelocityX(150);
            this.avatar2.setVelocityY(0);
            //console.log('Right arrow key pressed.');
          }
          else if (this.cursors.up.isDown) {
            this.avatar.head.setVelocityY(-150);
            this.avatar.head.setVelocityX(0);
            this.avatar2.setVelocityY(-150);
            this.avatar2.setVelocityX(0);
            //console.log('up arrow key pressed.');
          }
          else if (this.cursors.down.isDown) {
            this.avatar.head.setVelocityY(150);
            this.avatar.head.setVelocityX(0);
            this.avatar2.setVelocityY(150);
            this.avatar2.setVelocityX(0);
            //console.log('Down arrow key pressed.');
          }
          else {
            this.avatar.head.setVelocity(0);
            this.avatar2.setVelocity(0);
          }
        }
      }



      // emit player movement
      if (avatarSelected == true) {
        var x = this.avatar.head.x;
        var y = this.avatar.head.y;
        if (this.avatar.head.oldPosition && (x !== this.avatar.head.oldPosition.x || y !== this.avatar.head.oldPosition.y)) {
          this.socket.emit('playerMovement', { x: this.avatar.head.x, y: this.avatar.head.y });
        }
        // save old position data
        this.avatar.head.oldPosition = {
          x: this.avatar.head.x,
          y: this.avatar.head.y,
        };
      }
    }
  }
});
export default create;
