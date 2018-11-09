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

var spell1 = 0
//var socket = io();
//console.log('js/create.js file socket connection = ', socket);










/*var input = document.getElementById("m");
input.addEventListener("keyup", function(event) {
  event.preventDefault();
  if (event.keyCode === 13) {
      form.onsubmit
  }
});
var input = document.getElementById("preview");
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
    console.log('this.socket = ', this.socket);


    this.otherPlayers = this.physics.add.group();
    this.socket.on('currentPlayers', function (players) {
      Object.keys(players).forEach(function (id) {
        console.log('Local players socket ID = ', players[id].playerId);
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
          console.log(playerInfo.playerId, 'chose username: ', playerInfo.username, '\n', 'Set head to: ', playerInfo.head, 'and body to: ', playerInfo.body, '\n', 'and head color to:', playerInfo.headColor,  'and body color to:', playerInfo.bodyColor, 'and they have described themselves as: ', playerInfo.descrip);
        }
      });
    });
    this.socket.on('disconnect', function (playerId) {
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerId === otherPlayer.playerId) {
          console.log('Player ID: ', self.socket.id, 'disconnected');
          otherPlayer.destroy();
          //otherPlayerBody.destroy();
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


    function clickFunction(self, playerInfo, avatar, pointer) {
      /*avatar.body.on('pointerdown', function (pointer){
        if (pointer.rightButtonDown())
        {
          avatar.head.setTint(0xff0000);
          avatar.body.setTint(0xff0000);
          console.log('sprite was Right clicked');
        }
        else
        {
          avatar.head.setTint(0x0000ff);
          avatar.body.setTint(0x0000ff);
          console.log('sprite was Left clicked');
        }
      });*/
    };

















    //Chat box
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
      console.log('Username for messages = ', playerInfo);
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
      const fill = document.querySelector('.fill');
      const empties = document.querySelectorAll('.empty');

      // Fill Listeners
      fill.addEventListener('dragstart', dragStart);
      fill.addEventListener('dragend', dragEnd);

      // Loop Through Empties and call drag events
      for(const empty of empties) {
        empty.addEventListener('dragover', dragOver);
        empty.addEventListener('dragenter', dragEnter);
        empty.addEventListener('dragleave', dragLeave);
        empty.addEventListener('drop', dragDrop);
      }

      // Drag Functions
      function dragStart() {
        console.log('dragging started');
        this.className += ' hold';
        setTimeout(() => (this.className = 'invisible'), 0);
      }
      function dragEnd() {
        console.log('dragging ended');
        this.className = 'fill';
      }
      function dragOver(event) {
        event.preventDefault();
      }
      function dragEnter(event) {
        event.preventDefault();
        this.className += ' hovered';
      }
      function dragLeave() {
        this.className = 'empty';
      }
      function dragDrop() {
        this.className = 'empty';
        this.append(fill);
      }

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
    const spawn_layer = map.createStaticLayer('spawn', tileset, 0, 0);

    //defines the height that each map layer is displayed at and what tile IDs player can collide with

    roof2_layer.depth = 4;
    roof2_layer.setCollision(-1);
    roof_layer.depth = 3;
    roof_layer.setCollision(-1);
    grass_layer.depth = 2;
    grass_layer.setCollision(-1);
    ground_layer.setCollisionByProperty({collide: true });
    ground_layer.depth = 0;
    ground_layer.setCollisionFromCollisionGroup();
    ground2_layer.setCollision(-1);
    background_layer.setCollision(-1);
    background2_layer.setCollision(-1);
    background3_layer.setCollision(-1);
    spawn_layer.setCollision(-1);

    console.log('this.debugMode = ', this.game.config.physics.arcade.debug);
    if (this.game.config.physics.arcade.debug == true) {
      spawn_layer.depth = 5;

      const debugGraphics = this.add.graphics().setAlpha(0.75);
      ground_layer.renderDebug(debugGraphics, {
        tileColor: null, //Color of non-colliding tiles
        collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255), //color of colliding tiles
        faceColor: new Phaser.Display.Color(40, 39, 37, 255) //color of colliding face edges
      });
    } else {
      spawn_layer.depth = -1;
    }











    var tiles = [];
    var spell = null;
    this.socket.on('getMapData', function (spawnAreas) {
      var tiles = [];

      spawn_layer.layer.data.forEach((row) => {
          row.forEach((col) => {
              if(col.index != -1) tiles.push({ x: col.x*col.width + 24, y: col.y*col.height + 24 })
          })
      })
      console.log('Spawn tile = ', tiles);
      self.socket.emit('sendMapData', tiles);
    });
    self.socket.on('spawnLocation', function (spawnAreas, random_tile) {

      //creates listener to check if "examine Item" is clicked in the right click context menu
      var input = document.getElementById("examineItem");
      input.addEventListener("click", function(event) {
        event.preventDefault();
        if (spell1 == 1) {
          console.log('examineing a spell');
          //console.log(playerInfo.username);
          spell1 = 0
          examineClickedSpell(spell);
        }
      });

      //creates listener to check if "pick up" is clicked in the right click context menu
      var pickUpInput = document.getElementById("pickUp");

      pickUpInput.addEventListener("click", function(event) {
        event.preventDefault();
        if (spell1 == 1) {
          spell1 = 0
          pickUpClickedSpell(spell);
        }
      });

      var spell = self.add.image(spawnAreas[random_tile].x, spawnAreas[random_tile].y, 'scroll2').setInteractive();
      spell.depth = 0;
      spell.name = 'The name of the spell';
      spell.descrip = 'This is a spell';
      function pickUpClickedSpell (spell) {
        if (spawnAreas[random_tile].x - self.avatar.head.x >= 0 && spawnAreas[random_tile].x - self.avatar.head.x <= 100 || spawnAreas[random_tile].x - self.avatar.head.x >= -100 && spawnAreas[random_tile].x - self.avatar.head.x <= 0) {
          console.log('Player Too far', 'spawnAreas[random_tile].x = ', spawnAreas[random_tile].x, '-', 'self.avatar.head.x = ', self.avatar.head.x, '=', spawnAreas[random_tile].x - self.avatar.head.x);
          console.log('picking up a spell');
          //console.log(playerInfo.username);
          const spellsDisplay = document.getElementById("spellsDisplay")
          fill.innerHTML = '<img src="assets/images/Scroll_02.png" alt="Spell1">'
          document.getElementById("lookDisplay").style.display = "none";

          document.getElementById("itemsDisplay").style.display = "none";
          document.getElementById("spellsDisplay").style.display = "block";
          document.getElementById("mapDisplay").style.display = "none";
          document.getElementById("optionsDisplay").style.display = "none";
          //console.log('spell was Right clicked');
        }
      }

      function examineClickedSpell (spell) {
        const lookDisplay = document.getElementById("lookDisplay")
        lookDisplay.innerHTML = '<strong>SPELL NAME: </strong>'+spell.name+'<br><br><strong>Spell Description:</strong><br>'+spell.descrip
        document.getElementById("lookDisplay").style.display = "block";

        document.getElementById("itemsDisplay").style.display = "none";
        document.getElementById("spellsDisplay").style.display = "none";
        document.getElementById("mapDisplay").style.display = "none";
        document.getElementById("optionsDisplay").style.display = "none";
        //console.log('spell was Right clicked');
      }

      spell.on('pointerdown', function (pointer){
        //clickFunction();
        if (pointer.rightButtonDown())
        {
          console.log('spell was right clicked');
          spell1 = 1
        }
        else
        {
          console.log('spell was Left clicked');
        }
      });


      //here is the end of the function that generates the spawn locations.
    });


















    //makes all the objects you can't walk through
    let blocked = this.physics.add.staticGroup();


    //creating the avatar selection screen
    function addPlayer(self, playerInfo) {

      //predefining variables
      if (avatarSelected == false) {
        var characterSelect = null;
        var speciesSelect = 0;
        var bodySelect = 0;
        var speciesSelect3 = null;

        console.log(playerInfo.playerId, 'is creating their avatar...');

        var input = document.getElementById("speciesArrowLeft");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          document.getElementById("speciesArrowLeft").style.backgroundColor = "green";
          document.getElementById("speciesArrowRight").style.backgroundColor = "transparent";
          if (speciesSelect <= 1) {
					console.log('speciesSelect is <= 1');
          speciesSelectionWindow(speciesSelect)
				    }
					else {
						speciesSelect--;
						console.log('speciesSelect = ', speciesSelect);
            speciesSelectionWindow(speciesSelect)
					}

        });
        function speciesSelectionWindow(speciesSelect) {
          if (speciesSelect == 1) {
            console.log('value 1 = purple');
            speciesLable.innerHTML = '<center>Species1</center>'
          document.getElementById('speciesSelectionWindow').src = "assets/images/testBody_02.png";
          purpleHeadSelected();
          }
          if (speciesSelect == 2) {
            console.log('value 2 = green');
            speciesLable.innerHTML = '<center>Species2</center>'
            document.getElementById('speciesSelectionWindow').src = "assets/images/testBody.png";
            greenHeadSelected();
          }
          if (speciesSelect == 3) {
            console.log('value 3 = blue');
            speciesLable.innerHTML = '<center>Species3</center>'
            document.getElementById('speciesSelectionWindow').src = "assets/images/testBody_02.png";
            blueHeadSelected();
          }
        };


        var input = document.getElementById("speciesArrowRight");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          document.getElementById("speciesArrowLeft").style.backgroundColor = "transparent";
          document.getElementById("speciesArrowRight").style.backgroundColor = "green";
          if (speciesSelect >= 3) {
					console.log('speciesSelect is >= 3');
          speciesSelectionWindow(speciesSelect)
  				}
					else {
						speciesSelect++;
						console.log('speciesSelect = ', speciesSelect);
            speciesSelectionWindow(speciesSelect)
					}
        });









        var input = document.getElementById("bodyArrowLeft");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          document.getElementById("bodyArrowLeft").style.backgroundColor = "green";
          document.getElementById("bodyArrowRight").style.backgroundColor = "transparent";
          if (bodySelect <= 1) {
					console.log('bodySelect is <= 1');
          bodySelectionWindow(bodySelect)
				    }
					else {
						bodySelect--;
						console.log('bodySelect = ', bodySelect);
            bodySelectionWindow(bodySelect)
					}

        });
        function bodySelectionWindow(bodySelect) {
          if (bodySelect == 1) {
            console.log('value 1 = purple');
            bodyLable.innerHTML = '<center>Secondary Fur Pattern Color1</center>'
          document.getElementById('bodySelectionWindow').src = "assets/images/testFur_02.png";
          bodySelected();
          }
          if (bodySelect == 2) {
            console.log('value 2 = green');
            bodyLable.innerHTML = '<center>Secondary Fur Pattern Color2</center>'
            document.getElementById('bodySelectionWindow').src = "assets/images/testFur.png";
            bodySelected2();
          }
          if (bodySelect == 3) {
            console.log('value 3 = blue');
            bodyLable.innerHTML = '<center>No Secondary Fur Pattern</center>'
            document.getElementById('bodySelectionWindow').src = "assets/spritesheets/emptyplayer.png";
            noBodySelected();
          }
        };


        var input = document.getElementById("bodyArrowRight");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          document.getElementById("bodyArrowLeft").style.backgroundColor = "transparent";
          document.getElementById("bodyArrowRight").style.backgroundColor = "green";
          if (bodySelect >= 3) {
					console.log('bodySelect is >= 3');
          bodySelectionWindow(bodySelect)
  				}
					else {
						bodySelect++;
						console.log('bodySelect = ', bodySelect);
            bodySelectionWindow(bodySelect)
					}
        });










        var input = document.getElementById("logInBttn");
        input.addEventListener("click", function(event) {
          event.preventDefault();
          if (bodySelect == 0) {
            document.getElementById("bodyLable").style.color = "red";
            logInBttn.innerHTML = '<center>Click to <br> Log in <br> (Missing Fur Pattern Selection)</center>'
          }
          if (speciesSelect == 0) {
            document.getElementById("speciesLable").style.color = "red";
            logInBttn.innerHTML = '<center>Click to <br> Log in <br> (Missing Species Selection)</center>'
          }

          document.getElementById("logInBttn").style.backgroundColor = "green";
          playerInfo.username = document.getElementById("uN").value;
          if (playerInfo.username == '') {
            document.getElementById("usernameInput").style.color = "red";
            logInBttn.innerHTML = '<center>Click to <br> Log in <br> (Missing Username Selection)</center>'
            return;
          }
          logInBttnSelected();
        });


        function purpleHeadSelected() {
			     avatarInfo.head = 'testBody';
           playerInfo.username = document.getElementById("uN").value;
           playerInfo.descrip = document.getElementById("descrip").value;
           playerInfo.headColor = document.getElementById("myColor1").value;
           //self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username, headColor: playerInfo.headColor });
           console.log(playerInfo.playerId, 'Selected the purple head');
           console.log('selected head color = ', playerInfo.headColor);
           console.log('player description = ', playerInfo.descrip);
           console.log('username on head selction = ', playerInfo.username);
           //createSprite();

		    };


        function greenHeadSelected() {
			     avatarInfo.head = 'testBody02';
           playerInfo.username = document.getElementById("uN").value;
           playerInfo.descrip = document.getElementById("descrip").value;
           playerInfo.headColor = document.getElementById("myColor1").value;
           //self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username, headColor: playerInfo.headColor });
           console.log(playerInfo.playerId, 'Selected the green head');
           console.log('selected head color = ', playerInfo.headColor);
           console.log('player description = ', playerInfo.descrip);
           console.log('username on head selction = ', playerInfo.username);
           //createSprite();
		    };


        function blueHeadSelected() {
			    avatarInfo.head = 'testBody';
          playerInfo.username = document.getElementById("uN").value;
          playerInfo.descrip = document.getElementById("descrip").value;
          playerInfo.headColor = document.getElementById("myColor1").value;
          //self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username });
          console.log(playerInfo.playerId, 'Selected the blue head');
          console.log('selected head color = ', playerInfo.headColor);
          console.log('player description = ', playerInfo.descrip);
          console.log('username on head selction = ', playerInfo.username);
          //createSprite();
		    };


        function bodySelected() {
			     avatarInfo.body = 'testFur02';
           playerInfo.username = document.getElementById("uN").value;
           playerInfo.descrip = document.getElementById("descrip").value;
           playerInfo.bodyColor = document.getElementById("myColor2").value;
           //self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username });
           console.log(playerInfo.playerId, 'Selected body');
           console.log('selected body color = ', playerInfo.bodyColor);
           //createSprite();
		    };


        function bodySelected2() {
			     avatarInfo.body = 'testFur';
           playerInfo.username = document.getElementById("uN").value;
           playerInfo.descrip = document.getElementById("descrip").value;
           playerInfo.bodyColor = document.getElementById("myColor2").value;
           //self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username });
           console.log(playerInfo.playerId, 'Selected body');
           console.log('selected body color = ', playerInfo.bodyColor);
           //createSprite();
		    };


        function noBodySelected() {
			     avatarInfo.body = 'emptyplayer';
           playerInfo.username = document.getElementById("uN").value;
           playerInfo.descrip = document.getElementById("descrip").value;
           playerInfo.bodyColor = document.getElementById("myColor2").value;
           //self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username });
           console.log(playerInfo.playerId, 'Selected body');
           console.log('selected body color = ', playerInfo.bodyColor);
           //createSprite();
		    };


        function logInBttnSelected() {
          speciesSelectionWindow(speciesSelect)
          bodySelectionWindow(bodySelect)
          playerInfo.headColor = playerInfo.headColor.replace('#','0x');
          playerInfo.bodyColor = playerInfo.bodyColor.replace('#','0x');
          self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username, headColor: playerInfo.headColor, bodyColor: playerInfo.bodyColor, descrip: playerInfo.descrip });
          console.log('log in button clicked by', playerInfo.playerId, '\n', 'confirming selections of: ', '\n', 'Username = ', playerInfo.username, '\n', 'Head Color = ', playerInfo.headColor, '\n', 'Body Color = ', playerInfo.bodyColor, '\n', 'Descriptoin = ', playerInfo.descrip);
          createSprite();
		    };

        function createSprite (){
          let avatar = {};
          if(avatarInfo.head)avatar.head = self.physics.add.image(playerInfo.x, playerInfo.y, avatarInfo.head).setInteractive();

          avatar.head.setTint(playerInfo.headColor);
          console.log('Modified color to head is: ', playerInfo.headColor);

          if(avatarInfo.body)avatar.body = self.physics.add.image(playerInfo.x, playerInfo.y, avatarInfo.body).setInteractive();

          avatar.body.setTint(playerInfo.bodyColor);
          console.log('Modified color to body is: ', playerInfo.bodyColor);

          avatar.body.on('pointerdown', function (pointer){
            //clickFunction();
            if (pointer.rightButtonDown())
            {
              var input = document.getElementById("examineItem");
              input.addEventListener("click", function(event) {
                event.preventDefault();
                console.log('examineItem was clicked');
                //console.log(playerInfo.username);
                examineClicked(playerInfo);
              });

              function examineClicked (playerInfo) {
                console.log(playerInfo.username);
                const lookDisplay = document.getElementById("lookDisplay")
                lookDisplay.innerHTML = '<strong>NAME: </strong>'+playerInfo.username+'<br><br><strong>Description:</strong><br>'+playerInfo.descrip
                document.getElementById("lookDisplay").style.display = "block";

                document.getElementById("itemsDisplay").style.display = "none";
                document.getElementById("spellsDisplay").style.display = "none";
                document.getElementById("mapDisplay").style.display = "none";
                document.getElementById("optionsDisplay").style.display = "none";
                //console.log('sprite was Right clicked');
              }
            }
            else
            {
              console.log('sprite was Left clicked');
            }
          });

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
      console.log('addOtherPlayers function username = ', playerInfo.username);
      console.log('addOtherPlayers function Head Tint = ', playerInfo.headColor);
      console.log('addOtherPlayers function Head Tint = ', playerInfo.bodyColor);
      //console.log('addOtherPlayer function called and playerInfo.head = ', playerInfo.head, 'and, ', playerInfo.body);
      const otherPlayerHead = self.add.sprite(playerInfo.x, playerInfo.y, playerInfo.head).setInteractive();
      const otherPlayerBody = self.add.sprite(playerInfo.x, playerInfo.y, playerInfo.body).setInteractive();


      otherPlayerHead.playerId = playerInfo.playerId;
      otherPlayerBody.playerId = playerInfo.playerId;
      self.otherPlayers.add(otherPlayerHead);
      self.otherPlayers.add(otherPlayerBody);


        //playerInfo.headColor = playerInfo.headColor.replace('#','0x');
        //playerInfo.bodyColor = playerInfo.bodyColor.replace('#','0x');
        otherPlayerHead.setTint(playerInfo.headColor);
        otherPlayerBody.setTint(playerInfo.bodyColor);
        otherPlayerBody.on('pointerdown', function (pointer){
        //clickFunction();
        if (pointer.rightButtonDown())
        {
          var input = document.getElementById("examineItem");
          input.addEventListener("click", function(event) {
            event.preventDefault();
            console.log('examineItem was clicked');
            //console.log(playerInfo.username);
            examineClicked(playerInfo);
          });

          function examineClicked (playerInfo) {
            console.log(playerInfo.username);
            const lookDisplay = document.getElementById("lookDisplay")
            lookDisplay.innerHTML = '<strong>NAME: </strong>'+playerInfo.username+'<br><br><strong>Description:</strong><br>'+playerInfo.descrip
            document.getElementById("lookDisplay").style.display = "block";

            document.getElementById("itemsDisplay").style.display = "none";
            document.getElementById("spellsDisplay").style.display = "none";
            document.getElementById("mapDisplay").style.display = "none";
            document.getElementById("optionsDisplay").style.display = "none";
            //console.log('sprite was Right clicked');
          }
        }
        else
        {
          console.log('sprite was Left clicked');
        }
      });

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
