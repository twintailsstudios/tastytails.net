import { game } from './index.js'//, socket
//import things from "./index.js"
//import resize from './resize.js'
//import Character from './entities/character.js'
//import ui from './ui.js'
var avatarSelected = false;

let avatarInfo = {
  head:"emptyplayer",
  body:"emptyplayer"
};
//var socket = io();
//console.log('js/create.js file socket connection = ', socket);










/*var input = document.getElementById("m");
input.addEventListener("keyup", function(event) {
  event.preventDefault();
  if (event.keyCode === 13) {
      form.onsubmit
  }
});
var input = document.getElementById("usernameInput");
input.addEventListener("keyup", function(event) {
  event.preventDefault();
  if (event.keyCode === 13) {
      form.onsubmit
  }
});*/

// This is the code for the chat box













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
    console.log('self.socket.id = ', this.socket.id);


    this.otherPlayers = this.physics.add.group();
    this.socket.on('currentPlayers', function (players) {
      Object.keys(players).forEach(function (id) {
        console.log(players[id].playerId);
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
          console.log(playerInfo.playerId, 'chose username: ', playerInfo.username, 'Set head to: ', playerInfo.head, 'and body to: ', playerInfo.body);
        }
      });
    });
    this.socket.on('disconnect', function (playerId) {
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerId === otherPlayer.playerId) {
          console.log('Player ID: ', self.socket.id, 'disconnected');
          otherPlayerHead.destroy();
          otherPlayerBody.destroy();
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
    //this.input.mouse.disableContextMenu();

    //this detects if the game has been clicked so as to move the focus off of the chat div and back onto the game
    //allowing players to move again
    this.input.on('pointerdown', function (pointer) {

        document.getElementById('phaserApp').focus();
        //console.log('phaser game was clicked');
    }, this);
    if (avatarSelected == true) {
      console.log('sprite clicking conditions are true');
      self.avatar.on('pointerdown', function (pointer){
      console.log('sprite was clicked');
      });
    }













    const room = 'localchat';

    const form = document.querySelector("form");
    const chat = document.querySelector("#m");
    const messages = document.querySelector("#messages");
    chat.addEventListener("keyup", function (event) {
      if (event.shiftKey) return;
      else if (event.keyCode === 13) {
        event.preventDefault();
        let msg = chat.value;
        self.socket.emit('message', { msg, room });
        chat.value = "";
      }
    });

    this.socket.on('connect', () => {
      this.socket.emit('join', { room: room });
    });

    this.socket.on('message', (msg, playerInfo) => {
      const isScrolledToBottom = messages.scrollHeight - messages.clientHeight <= messages.scrollTop + 1;
      let li = document.createElement("li");
      console.log(playerInfo);
      if (playerInfo) {
        li.innerHTML = playerInfo.bold()+": "+msg;
      }
      else {
        li.innerHTML = msg;
      }
      messages.appendChild(li);
      if (isScrolledToBottom) {
        messages.scrollTop = messages.scrollHeight - messages.clientHeight;
      }
    })























    //creating clickable UI buttons

    var input = document.getElementById("lookTab");
    input.addEventListener("click", function(event) {
      event.preventDefault();
      console.log('Look tab was clicked!');
      document.getElementById("lookDisplay").style.display = "block";

      document.getElementById("itemsDisplay").style.display = "none";
      document.getElementById("spellsDisplay").style.display = "none";
      document.getElementById("mapDisplay").style.display = "none";
      document.getElementById("optionsDisplay").style.display = "none";
    });
    var input = document.getElementById("itemsTab");
    input.addEventListener("click", function(event) {
      event.preventDefault();
      console.log('items tab was clicked!');
      document.getElementById("itemsDisplay").style.display = "block";

      document.getElementById("lookDisplay").style.display = "none";
      document.getElementById("spellsDisplay").style.display = "none";
      document.getElementById("mapDisplay").style.display = "none";
      document.getElementById("optionsDisplay").style.display = "none";
    });
    var input = document.getElementById("spellsTab");
    input.addEventListener("click", function(event) {
      event.preventDefault();
      console.log('spells tab was clicked!');
      document.getElementById("spellsDisplay").style.display = "block";

      document.getElementById("lookDisplay").style.display = "none";
      document.getElementById("itemsDisplay").style.display = "none";
      document.getElementById("mapDisplay").style.display = "none";
      document.getElementById("optionsDisplay").style.display = "none";
    });
    var input = document.getElementById("mapTab");
    input.addEventListener("click", function(event) {
      event.preventDefault();
      console.log('map tab was clicked!');
      document.getElementById("mapDisplay").style.display = "block";

      document.getElementById("lookDisplay").style.display = "none";
      document.getElementById("itemsDisplay").style.display = "none";
      document.getElementById("spellsDisplay").style.display = "none";
      document.getElementById("optionsDisplay").style.display = "none";
    });
    var input = document.getElementById("optionsTab");
    input.addEventListener("click", function(event) {
      event.preventDefault();
      console.log('options tab was clicked!');
      document.getElementById("optionsDisplay").style.display = "block";

      document.getElementById("lookDisplay").style.display = "none";
      document.getElementById("itemsDisplay").style.display = "none";
      document.getElementById("spellsDisplay").style.display = "none";
      document.getElementById("mapDisplay").style.display = "none";
    });














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

        var input = document.getElementById("head1");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          document.getElementById("head1").style.backgroundColor = "green";
          document.getElementById("head2").style.backgroundColor = "transparent";
          document.getElementById("head3").style.backgroundColor = "transparent";
          purpleHeadSelected();
        });
        var input = document.getElementById("head2");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          document.getElementById("head1").style.backgroundColor = "transparent";
          document.getElementById("head2").style.backgroundColor = "green";
          document.getElementById("head3").style.backgroundColor = "transparent";
          greenHeadSelected();
        });
        var input = document.getElementById("head3");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          document.getElementById("head1").style.backgroundColor = "transparent";
          document.getElementById("head2").style.backgroundColor = "transparent";
          document.getElementById("head3").style.backgroundColor = "green";
          blueHeadSelected();
        });
        var input = document.getElementById("body1");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          document.getElementById("body1").style.backgroundColor = "green";
          bodySelected();
        });
        var input = document.getElementById("logInBttn");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          document.getElementById("logInBttn").style.backgroundColor = "green";
          playerInfo.username = document.getElementById("uN").value;
          console.log(playerInfo.username);
          logInBttnSelected();
        });


        function purpleHeadSelected() {
			     avatarInfo.head = 'dudeheadpurple';
           playerInfo.username = document.getElementById("uN").value;
           self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username });
           //createSprite();
           console.log(playerInfo.playerId, 'Selected the purple head');
		    };


        function greenHeadSelected() {
			     avatarInfo.head = 'dudeheadgreen';
           playerInfo.username = document.getElementById("uN").value;
           self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username });
           //createSprite();
           console.log(playerInfo.playerId, 'Selected the green head');
		    };


        function blueHeadSelected() {
			    avatarInfo.head = 'dudeheadblue';
          playerInfo.username = document.getElementById("uN").value;
          self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username });
          //createSprite();
          console.log(playerInfo.playerId, 'Selected the blue head');
		    };
        function bodySelected() {
			     avatarInfo.body = 'dudebody';
           playerInfo.username = document.getElementById("uN").value;
           self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username });
           //createSprite();
           console.log(playerInfo.playerId, 'Selected body');
		    };
        function logInBttnSelected() {
           createSprite();
           console.log('log in button clicked');
		    };

        function createSprite (){
          let avatar = {};
          if(avatarInfo.head)avatar.head = self.physics.add.image(playerInfo.x, playerInfo.y, avatarInfo.head);
          if(avatarInfo.body)avatar.body = self.physics.add.image(playerInfo.x, playerInfo.y, avatarInfo.body);

          document.getElementById('phaserApp').focus();
          document.getElementById('characterSelect').style.display = "none"
          document.getElementById('characterSelectBackground').style.display = "none"



          self.avatar = avatar;
          applyPhysics();
          avatarSelected = true;
        }
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
        //physics for body
        self.avatar.body.setMaxVelocity(200);
        self.avatar.body.setSize(8, 8);
        self.avatar.body.setOffset(11, 40);
        self.avatar.body.setCollideWorldBounds(false);
        //gives physics to local player so that they will obey blocked objects
        self.physics.add.collider(self.avatar.body, ground_layer);

      }


    };

    function addOtherPlayers(self, playerInfo) {
      console.log("addOtherPlayers called");
      //console.log('addOtherPlayer function called and playerInfo.head = ', playerInfo.head, 'and, ', playerInfo.body);
      const otherPlayerHead = self.add.sprite(playerInfo.x, playerInfo.y, playerInfo.head);
      const otherPlayerBody = self.add.sprite(playerInfo.x, playerInfo.y, playerInfo.body);


      otherPlayerHead.playerId = playerInfo.playerId;
      otherPlayerBody.playerId = playerInfo.playerId;
      self.otherPlayers.add(otherPlayerHead);
      self.otherPlayers.add(otherPlayerBody);
    };
    //this.events.on('resize', resize, this)
  },

  update() {

    //makes phaser stop listening for keyboard inputs when user is focused on the chat div
    if (chatFocused == false) {
      //console.log('chatFocused = ', chatFocused);
      this.input.keyboard.addKey(this.cursors.up);
      this.input.keyboard.addKey(this.cursors.down);
      this.input.keyboard.addKey(this.cursors.left);
      this.input.keyboard.addKey(this.cursors.right);
      this.input.keyboard.addKey(this.cursors.space);
      //console.log('keyboard enabled');
    }
    else {
      //console.log('chatFocused = ', chatFocused);
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
            this.avatar.body.setVelocityX(-150);
            this.avatar.body.setVelocityY(0);
            //console.log('Left arrow key pressed.');
          }
          else if (this.cursors.right.isDown) {
            this.avatar.head.setVelocityX(150);
            this.avatar.head.setVelocityY(0);
            this.avatar.body.setVelocityX(150);
            this.avatar.body.setVelocityY(0);
            //console.log('Right arrow key pressed.');
          }
          else if (this.cursors.up.isDown) {
            this.avatar.head.setVelocityY(-150);
            this.avatar.head.setVelocityX(0);
            this.avatar.body.setVelocityY(-150);
            this.avatar.body.setVelocityX(0);
            //console.log('up arrow key pressed.');
          }
          else if (this.cursors.down.isDown) {
            this.avatar.head.setVelocityY(150);
            this.avatar.head.setVelocityX(0);
            this.avatar.body.setVelocityY(150);
            this.avatar.body.setVelocityX(0);
            //console.log('Down arrow key pressed.');
          }
          else {
            this.avatar.head.setVelocity(0);
            this.avatar.body.setVelocity(0);
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
