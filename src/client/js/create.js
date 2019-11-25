import { game } from './index.js'//, socket
// import { serverPlayerInfo } from '/';
// var serverInfo = serverPlayerInfo.serverPlayerInfo;

var avatarSelected = false;

let avatarInfo = {
  head:"emptyplayer",
  body:"emptyplayer"
};

var localPlayerInfo = {
  Identifier:'',
  playerId:'',
  Username:'',
  Description:'',
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
    sprite: 'empty',
    color: '0xe0e0e0'
  },
  genitles:{
    sprite: 'empty',
    secondarySprite: 'empty'
  },
  x: 4820,
  y: 5020,
  specialList:[],
  spellInventory:[],
  consumedBy:null,
  rotation: 0
};
var voreTypes = [];
var clicked = {Identifier: ''};
var toDestroy = '';
var container = null;
var cam1 = null;
var arrows = 0;
//var chatFocused = false;
//var otherContainer = null;























// Up here we are importing the game object from ./index.js
var create = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function create() {
    //active is set to false here, so it waits for a command to launch from preload.js
    Phaser.Scene.call(this, {key: 'create', active: false});
    this.pic;
  },
  create() {
    var test = 'this is a test';
    var self = this;
    this.socket = io();
    console.log('this.socket = ', this.socket);

    var otherPlayers = [];

    this.socket.on('currentPlayers', function (players, spells) {
      Object.keys(players).forEach(function (id) {
        console.log('Local players socket ID = ', players[id].playerId);
        if (players[id].playerId === self.socket.id) {
          localPlayerInfo.playerId = self.socket.id;
          self.socket.emit('characterUpdate', localPlayerInfo);
          //addPlayer(self, players[id]);
        } else {
          addOtherPlayers(self, players[id]);
        }
      });
      spawnSpells(spells);
    });

    this.socket.on('newPlayer', function (playerInfo) {
      addOtherPlayers(self, playerInfo);
    });

    this.socket.on('characterUpdated', function (playerInfo) {
      //console.log('characterUpdated is called');
      //console.log('characterUpdated', '\n', 'playerInfo.playerId = ', playerInfo.playerId, '\n', 'self.socket.id = ', self.socket.id);
        if (playerInfo.playerId === self.socket.id) {
          //console.log('playerInfo.playerId === self.socket.id');
          addPlayer(self, playerInfo);
        }
        for (let i = 0; i < otherPlayers.length; i++) {
          //let movingPlayer = otherPlayers[i];
          if (playerInfo.playerId === otherPlayers[i].playerId) {
            addOtherPlayers(self, playerInfo);
            console.log(playerInfo.playerId, 'chose username: ', playerInfo.username, '\n', 'Set head to: ', playerInfo.head, 'and body to: ', playerInfo.body, '\n', 'and head color to:', playerInfo.headColor,  'and body color to:', playerInfo.bodyColor, 'and they have described themselves as: ', playerInfo.descrip);
            return;
          }
        }
    });
    this.socket.on('avatarSelection', function (playerInfo) {
      /*self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerInfo.playerId === otherPlayer.playerId) {
          addOtherPlayers(self, playerInfo);
          console.log(playerInfo.playerId, 'chose username: ', playerInfo.username, '\n', 'Set head to: ', playerInfo.head, 'and body to: ', playerInfo.body, '\n', 'and head color to:', playerInfo.headColor,  'and body color to:', playerInfo.bodyColor, 'and they have described themselves as: ', playerInfo.descrip);
        }
      });*/

    });

    this.socket.on('disconnect', function (playerId) {
      /*otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerId === otherPlayer.playerId) {
          console.log('Player ID: ', self.socket.id, 'disconnected');
          otherPlayers.otherContainer.destroy();
        }
      });*/
      for (let i = 0; i < otherPlayers.length; i++) {
        //let movingPlayer = otherPlayers[i];
        console.log('otherPlayers[i] to be destroyed = ', otherPlayers[i]);
        console.log('playerId to be destroyed = ', playerId);
        if (playerId === otherPlayers[i].playerId) {
          console.log('Player ID: ', otherPlayers[i].playerId, 'disconnected');

          otherPlayers[i].destroy();
        }
      }



    });

    this.socket.on('playerMoved', function (playerInfo) {
      //console.log('playerMoved called successfully');
      if (playerInfo.playerId === self.socket.id) {
        localPlayerInfo.rotation = playerInfo.rotation;
        //console.log(playerInfo.x, playerInfo.y);
        self.container.setPosition(playerInfo.x, playerInfo.y);
        if (playerInfo.rotation == 0) {
          //console.log('animations are being called');
          self.head.play(localPlayerInfo.head.sprite + 'Stop');
          self.secondaryHead.play(localPlayerInfo.head.secondarySprite + 'Stop');
          self.accentHead.play(localPlayerInfo.head.accentSprite + 'Stop');
          self.body.play(localPlayerInfo.body.sprite + 'Stop');
          self.secondaryBody.play(localPlayerInfo.body.secondarySprite + 'Stop');
          self.accentBody.play(localPlayerInfo.body.accentSprite + 'Stop');
          self.tail.play(localPlayerInfo.tail.sprite + 'Stop');
          self.secondaryTail.play(localPlayerInfo.tail.secondarySprite + 'Stop');
          self.accentTail.play(localPlayerInfo.tail.accentSprite + 'Stop');
          self.hair.play(localPlayerInfo.hair.sprite + 'Stop');
          self.ear.play(localPlayerInfo.ear.sprite + 'Stop');
          self.eyes.play(localPlayerInfo.eyes.outer + 'Stop');
          self.iris.play(localPlayerInfo.eyes.iris + 'Stop');
          self.genitles.play(localPlayerInfo.genitles.sprite + 'Stop');
        }
        if (playerInfo.rotation == 1) {
          //console.log('animations are being called');
          self.head.play(localPlayerInfo.head.sprite + 'Down', true);
          self.secondaryHead.play(localPlayerInfo.head.secondarySprite + 'Down', true);
          self.accentHead.play(localPlayerInfo.head.accentSprite + 'Down', true);
          self.body.play(localPlayerInfo.body.sprite + 'Down', true);
          self.secondaryBody.play(localPlayerInfo.body.secondarySprite + 'Down', true);
          self.accentBody.play(localPlayerInfo.body.accentSprite + 'Down', true);
          self.tail.play(localPlayerInfo.tail.sprite + 'Down', true);
          self.secondaryTail.play(localPlayerInfo.tail.secondarySprite + 'Down', true);
          self.accentTail.play(localPlayerInfo.tail.accentSprite + 'Down', true);
          self.hair.play(localPlayerInfo.hair.sprite + 'Down', true);
          self.ear.play(localPlayerInfo.ear.sprite + 'Down', true);
          self.eyes.play(localPlayerInfo.eyes.outer + 'Down', true);
          self.iris.play(localPlayerInfo.eyes.iris + 'Down', true);
          self.genitles.play(localPlayerInfo.genitles.sprite + 'Down', true);
          self.container.sendToBack(self.accentTail);
          self.container.sendToBack(self.secondaryTail);
          self.container.sendToBack(self.tail);
        }
        if (playerInfo.rotation == 2) {
          self.head.play(localPlayerInfo.head.sprite + 'Right', true);
          self.secondaryHead.play(localPlayerInfo.head.secondarySprite + 'Right', true);
          self.accentHead.play(localPlayerInfo.head.accentSprite + 'Right', true);
          self.body.play(localPlayerInfo.body.sprite + 'Right', true);
          self.secondaryBody.play(localPlayerInfo.body.secondarySprite + 'Right', true);
          self.accentBody.play(localPlayerInfo.body.accentSprite + 'Right', true);
          self.tail.play(localPlayerInfo.tail.sprite + 'Right', true);
          self.secondaryTail.play(localPlayerInfo.tail.secondarySprite + 'Right', true);
          self.accentTail.play(localPlayerInfo.tail.accentSprite + 'Right', true);
          self.hair.play(localPlayerInfo.hair.sprite + 'Right', true);
          self.ear.play(localPlayerInfo.ear.sprite + 'Right', true);
          self.eyes.play(localPlayerInfo.eyes.outer + 'Right', true);
          self.iris.play(localPlayerInfo.eyes.iris + 'Right', true);
          self.genitles.play(localPlayerInfo.genitles.sprite + 'Right', true);
          self.container.sendToBack(self.accentTail);
          self.container.sendToBack(self.secondaryTail);
          self.container.sendToBack(self.tail);
        }
        if (playerInfo.rotation == 3) {
          self.head.play(localPlayerInfo.head.sprite + 'Up', true);
          self.secondaryHead.play(localPlayerInfo.head.secondarySprite + 'Up', true);
          self.accentHead.play(localPlayerInfo.head.accentSprite + 'Up', true);
          self.body.play(localPlayerInfo.body.sprite + 'Up', true);
          self.secondaryBody.play(localPlayerInfo.body.secondarySprite + 'Up', true);
          self.accentBody.play(localPlayerInfo.body.accentSprite + 'Up', true);
          self.tail.play(localPlayerInfo.tail.sprite + 'Up', true);
          self.secondaryTail.play(localPlayerInfo.tail.secondarySprite + 'Up', true);
          self.accentTail.play(localPlayerInfo.tail.accentSprite + 'Up', true);
          self.hair.play(localPlayerInfo.hair.sprite + 'Up', true);
          self.ear.play(localPlayerInfo.ear.sprite + 'Up', true);
          self.eyes.play(localPlayerInfo.eyes.outer + 'Up', true);
          self.iris.play(localPlayerInfo.eyes.iris + 'Up', true);
          self.genitles.play(localPlayerInfo.genitles.sprite + 'Up', true);
          self.container.sendToBack(self.hair);
          self.container.sendToBack(self.eyes);
          self.container.sendToBack(self.iris);
          self.container.sendToBack(self.accentBody);
          self.container.sendToBack(self.secondaryBody);
          self.container.sendToBack(self.body);
          self.container.sendToBack(self.accentHead);
          self.container.sendToBack(self.secondaryHead);
          self.container.sendToBack(self.ear);
          self.container.sendToBack(self.head);
        }
        if (playerInfo.rotation == 4) {
          self.head.play(localPlayerInfo.head.sprite + 'Left', true);
          self.secondaryHead.play(localPlayerInfo.head.secondarySprite + 'Left', true);
          self.accentHead.play(localPlayerInfo.head.accentSprite + 'Left', true);
          self.body.play(localPlayerInfo.body.sprite + 'Left', true);
          self.secondaryBody.play(localPlayerInfo.body.secondarySprite + 'Left', true);
          self.accentBody.play(localPlayerInfo.body.accentSprite + 'Left', true);
          self.tail.play(localPlayerInfo.tail.sprite + 'Left', true);
          self.secondaryTail.play(localPlayerInfo.tail.secondarySprite + 'Left', true);
          self.accentTail.play(localPlayerInfo.tail.accentSprite + 'Left', true);
          self.hair.play(localPlayerInfo.hair.sprite + 'Left', true);
          self.ear.play(localPlayerInfo.ear.sprite + 'Left', true);
          self.eyes.play(localPlayerInfo.eyes.outer + 'Left', true);
          self.iris.play(localPlayerInfo.eyes.iris + 'Left', true);
          self.genitles.play(localPlayerInfo.genitles.sprite + 'Left', true);
          self.container.sendToBack(self.accentTail);
          self.container.sendToBack(self.secondaryTail);
          self.container.sendToBack(self.tail);
        }
      } else {
        //console.log('someone else is moving')
        /*otherPlayers.getChildren().forEach(function (otherPlayer) {
          if (playerInfo.playerId === otherPlayer.playerId) {
            console.log('otherPlayer variable in the playerMoved command = ', otherPlayer);
            otherPlayer.otherContainer.setPosition(playerInfo.x, playerInfo.y);
          }
        });*/
      }
      for (let i = 0; i < otherPlayers.length; i++) {
        //let movingPlayer = otherPlayers[i];
        if (playerInfo.playerId === otherPlayers[i].playerId) {
          //console.log('otherPlayers[i] = ', otherPlayers[i]);
        otherPlayers[i].setPosition(playerInfo.x, playerInfo.y);
        }
      }


    });


    this.cursors = this.input.keyboard.createCursorKeys();

    //this detects if the game has been clicked so as to move the focus off of the chat div and back onto the game
    //allowing players to move again
    this.input.on('pointerdown', function (pointer) {

        document.getElementById('phaserApp').focus();
        //console.log('phaser game was clicked');
    }, this);




    function spawnSpells(spells) {
      var spell0 = self.add.image(spells[0].x, spells[0].y, spells[0].Icon).setInteractive();
      var spell1 = self.add.image(spells[1].x, spells[1].y, spells[1].Icon).setInteractive();
      var spell2 = self.add.image(spells[2].x, spells[2].y, spells[2].Icon).setInteractive();
      var spellInfo = {selection:'', Name:'', Descrip:'',locationX:'', locationY:''};
      spell0.on('pointerdown', function (pointer){
        toDestroy = spell0;
        if (pointer.rightButtonDown()) {
          spellInfo.Name = spells[0].Name;
          clicked = spells[0];
          console.log(spellInfo.Name, ' was Right clicked');
        } else {
          console.log('spell was Left clicked');
        }
      });
      spell1.on('pointerdown', function (pointer){
        toDestroy = spell1;
        if (pointer.rightButtonDown()) {
          spellInfo.Name = spells[1].Name;
          clicked = spells[1];
          console.log(spellInfo.Name, ' was Right clicked');
        } else {
          console.log('spell was Left clicked');
        }
      });
      spell2.on('pointerdown', function (pointer){
        toDestroy = spell2;
        if (pointer.rightButtonDown()) {
          spellInfo.Name = spells[2].Name;
          clicked = spells[2];
          console.log(spellInfo.Name, ' was Right clicked');
        } else {
          console.log('spell was Left clicked');
        }
      });
    }

    var input = document.getElementById("examineItem");
    input.addEventListener("click", function(event) {
      event.preventDefault();
      self.socket.emit('examineClicked', clicked);
      //console.log('examineItem was clicked', '\n', 'Client Side clicked variable = ', clicked);
      clicked = {Identifier: ''};
      //console.log(playerInfo.username);
      //examineClicked(playerInfo);
    });

    this.socket.on('examinedInfo', function (examinedItem) {
      //console.log('examintedItem information from server = ', examinedItem);
      const lookDisplay = document.getElementById("lookDisplay")
      if (examinedItem.Identifier === 'spell') {
        lookDisplay.innerHTML = '<strong>Spell Name: </strong>'+examinedItem.Name+'<br><br><strong>Spell Description:</strong><br>'+examinedItem.Description
      }
      if (examinedItem.Identifier === 'player') {
        lookDisplay.innerHTML = '<strong>Name: </strong>'+examinedItem.Username+'<br><br><strong>Player Description:</strong><br>'+examinedItem.Description
      }
      document.getElementById("lookDisplay").style.display = "block";

      document.getElementById("itemsDisplay").style.display = "none";
      document.getElementById("spellsDisplay").style.display = "none";
      document.getElementById("mapDisplay").style.display = "none";
      document.getElementById("specialDisplay").style.display = "none";
      document.getElementById("optionsDisplay").style.display = "none";
      //console.log('sprite was Right clicked');
    });

    var pickUpInput = document.getElementById("pickUp");
    pickUpInput.addEventListener("click", function(event) {
      event.preventDefault();
      self.socket.emit('pickUpClicked', clicked);
      clicked = {Identifier: ''};
    });
    this.socket.on('pickedUpItem', function (spellInventory) {
        console.log('picking up a spell');
        //console.log(playerInfo.username);
        const spellsDisplay = document.getElementById("spellsDisplay")
        var spellsTable = document.getElementById("spellsTable");
        var row = spellsTable.insertRow();
        var cell1 = row.insertCell();
        var cell2 = row.insertCell();
        var cell3 = row.insertCell();
        cell1.innerHTML = '<img src="assets/images/Scroll_02.png" alt="Spell1">';
        cell2.innerHTML = spellInventory[spellInventory.length-1].Name;
        cell3.innerHTML = spellInventory[spellInventory.length-1].Description;
        document.getElementById("lookDisplay").style.display = "none";

        document.getElementById("itemsDisplay").style.display = "none";
        document.getElementById("spellsDisplay").style.display = "block";
        document.getElementById("mapDisplay").style.display = "none";
        document.getElementById("optionsDisplay").style.display = "none";
        //console.log('spell was Right clicked');
        toDestroy.destroy();
        toDestroy = null;
        //console.log('spell0 = ', spell0);

    })














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
      document.getElementById("specialDisplay").style.display = "none";
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
      document.getElementById("specialDisplay").style.display = "none";
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
      document.getElementById("specialDisplay").style.display = "none";
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
      document.getElementById("specialDisplay").style.display = "none";
      document.getElementById("optionsDisplay").style.display = "none";
    });
    var input = document.getElementById("specialTab");
    input.addEventListener("click", function(event) {
      event.preventDefault();
      console.log('special tab was clicked!');
      document.getElementById("specialDisplay").style.display = "block";

      document.getElementById("lookDisplay").style.display = "none";
      document.getElementById("itemsDisplay").style.display = "none";
      document.getElementById("spellsDisplay").style.display = "none";
      document.getElementById("mapDisplay").style.display = "none";
      document.getElementById("optionsDisplay").style.display = "none";
    });
    var input = document.getElementById("addSpecialType");
    input.addEventListener("click", function(event) {
      console.log('add special type clicked');
      document.getElementById("specialEdit").style.display = "block";

    });
    var input = document.getElementById("specialCreateBttn");
    input.addEventListener("click", function(event) {
      event.preventDefault();
      document.getElementById("specialCreateBttn").style.backgroundColor = "green";
      var specialInfo = {Name:'', Verb:'', Descrip:''};
      specialInfo.Name = document.getElementById("specialName").value;
      specialInfo.Verb = document.getElementById("specialVerb").value;
      specialInfo.Descrip = document.getElementById("specialDescrip").value;
      if (specialInfo.Name == '' || specialInfo.Verb == '' || specialInfo.Descrip == '') {
        if (specialInfo.Name == '') {
          document.getElementById("specialNameInput").style.color = "red";
          specialCreateBttn.innerHTML = '<center>Click to <br> Create <br> (Missing Special Name Selection)</center>'
          return;
        }
        if (specialInfo.Verb == '') {
          document.getElementById("specialVerbInput").style.color = "red";
          specialCreateBttn.innerHTML = '<center>Click to <br> Create <br> (Missing Special Verb Selection)</center>'
          return;
        }
        if (specialInfo.Descrip == '') {
          document.getElementById("specialDescripInput").style.color = "red";
          specialCreateBttn.innerHTML = '<center>Click to <br> Create <br> (Missing Special Description Selection)</center>'
          return;
        }
      } else {
        self.socket.emit('specialCreateBttnSelected', specialInfo);
        //specialCreateBttnSelected(specialInfo);
      }
    });
    var coll = document.getElementsByClassName("collapsible");
    var i;
    for (i = 0; i < coll.length; i++) {
      coll[i].addEventListener("click", function() {
        this.classList.toggle("active");
        var content = this.nextElementSibling;
        if (content.style.maxHeight){
          content.style.maxHeight = null;
        } else {
          content.style.maxHeight = content.scrollHeight + "px";
        }
      });
    }
    var specialMenuInput = document.getElementsByClassName("specialActions");
    var specialI;
    var specialDivList = [];
    for (specialI = 0; specialI < specialMenuInput.length; specialI++) {

      specialDivList.push(specialMenuInput[specialI]);
      specialMenuInput[specialI].addEventListener("click", function() {
        console.log("Special Menu Input in Context Menu was Clicked");
        if (localPlayerInfo.specialList == specialDivList) {
          //console.log('specialMenuInput = ', specialMenuInput);
          //console.log('specialI = ', specialI);
          console.log('specialDivList = ', specialDivList);
          console.log('localPlayerInfo.specialList = ', localPlayerInfo.specialList);
        }
      });
    }

    specialMenuInput0.addEventListener("click", function() {
      self.socket.emit('voreActionClicked', clicked, localPlayerInfo.specialList[0]);
    });

    this.socket.on('newVoreAction', function (voreEntry) {

      localPlayerInfo.specialList.push(voreEntry);
      console.log('special create button clicked by', localPlayerInfo.playerId, '\n', 'confirming inputs of: ', '\n', 'Special Name = ', voreEntry.Name, '\n', 'Special Verb = ', voreEntry.Verb, '\n', 'Special Description = ', voreEntry.Descrip);
      console.log('testing the push array thingy: ', localPlayerInfo.specialList[localPlayerInfo.specialList.length - 1]);
      if (localPlayerInfo.specialList[0] !== undefined) {
        document.getElementById("specialTitle0").style.display = "block";
        document.getElementById("specialMenuInput0").style.display = "block";
        document.getElementById("specialTitle0").innerHTML = localPlayerInfo.specialList[0].Name
        document.getElementById("specialDescription0").innerHTML = localPlayerInfo.specialList[0].Descrip
        document.getElementById("specialMenuInput0").innerHTML = localPlayerInfo.specialList[0].Name

      }
      if (localPlayerInfo.specialList[1] !== undefined) {
        document.getElementById("specialTitle1").style.display = "block";
        document.getElementById("specialMenuInput1").style.display = "block";
        document.getElementById("specialTitle1").innerHTML = localPlayerInfo.specialList[1].Name
        document.getElementById("specialDescription1").innerHTML = localPlayerInfo.specialList[1].Descrip
        document.getElementById("specialMenuInput1").innerHTML = localPlayerInfo.specialList[1].Name
        specialMenuInput1.addEventListener("click", function() {
          self.socket.emit('voreActionClicked', clicked, localPlayerInfo.specialList[1]);
        });
      }
      if (localPlayerInfo.specialList[2] !== undefined) {
        document.getElementById("specialTitle2").style.display = "block";
        document.getElementById("specialMenuInput2").style.display = "block";
        document.getElementById("specialTitle2").innerHTML = localPlayerInfo.specialList[2].Name
        document.getElementById("specialDescription2").innerHTML = localPlayerInfo.specialList[2].Descrip
        document.getElementById("specialMenuInput2").innerHTML = localPlayerInfo.specialList[2].Name
        specialMenuInput2.addEventListener("click", function() {
          self.socket.emit('voreActionClicked', clicked, localPlayerInfo.specialList[2]);
        });
      }
      if (localPlayerInfo.specialList[3] !== undefined) {
        document.getElementById("specialTitle3").style.display = "block";
        document.getElementById("specialMenuInput3").style.display = "block";
        document.getElementById("specialTitle3").innerHTML = localPlayerInfo.specialList[3].Name
        document.getElementById("specialDescription3").innerHTML = localPlayerInfo.specialList[3].Descrip
        document.getElementById("specialMenuInput3").innerHTML = localPlayerInfo.specialList[3].Name
        specialMenuInput3.addEventListener("click", function() {
          self.socket.emit('voreActionClicked', clicked, localPlayerInfo.specialList[3]);
        });
      }
      if (localPlayerInfo.specialList[4] !== undefined) {
        document.getElementById("specialTitle4").style.display = "block";
        document.getElementById("specialMenuInput4").style.display = "block";
        document.getElementById("specialTitle4").innerHTML = localPlayerInfo.specialList[4].Name
        document.getElementById("specialDescription4").innerHTML = localPlayerInfo.specialList[4].Descrip
        document.getElementById("specialMenuInput4").innerHTML = localPlayerInfo.specialList[4].Name
      }
      if (localPlayerInfo.specialList[5] !== undefined) {
        document.getElementById("specialTitle5").style.display = "block";
        document.getElementById("specialMenuInput5").style.display = "block";
        document.getElementById("specialTitle5").innerHTML = localPlayerInfo.specialList[5].Name
        document.getElementById("specialDescription5").innerHTML = localPlayerInfo.specialList[5].Descrip
        document.getElementById("specialMenuInput5").innerHTML = localPlayerInfo.specialList[5].Name
      }
      if (localPlayerInfo.specialList[6] !== undefined) {
        document.getElementById("specialTitle6").style.display = "block";
        document.getElementById("specialMenuInput6").style.display = "block";
        document.getElementById("specialTitle6").innerHTML = localPlayerInfo.specialList[6].Name
        document.getElementById("specialDescription6").innerHTML = localPlayerInfo.specialList[6].Descrip
        document.getElementById("specialMenuInput6").innerHTML = localPlayerInfo.specialList[6].Name
      }
      if (localPlayerInfo.specialList[7] !== undefined) {
        document.getElementById("specialTitle7").style.display = "block";
        document.getElementById("specialMenuInput7").style.display = "block";
        document.getElementById("specialTitle7").innerHTML = localPlayerInfo.specialList[7].Name
        document.getElementById("specialDescription7").innerHTML = localPlayerInfo.specialList[7].Descrip
        document.getElementById("specialMenuInput7").innerHTML = localPlayerInfo.specialList[7].Name
      }
      if (localPlayerInfo.specialList[8] !== undefined) {
        document.getElementById("specialTitle8").style.display = "block";
        document.getElementById("specialMenuInput8").style.display = "block";
        document.getElementById("specialTitle8").innerHTML = localPlayerInfo.specialList[8].Name
        document.getElementById("specialDescription8").innerHTML = localPlayerInfo.specialList[8].Descrip
        document.getElementById("specialMenuInput8").innerHTML = localPlayerInfo.specialList[8].Name
      }
      if (localPlayerInfo.specialList[9] !== undefined) {
        document.getElementById("specialTitle9").style.display = "block";
        document.getElementById("specialMenuInput9").style.display = "block";
        document.getElementById("specialTitle9").innerHTML = localPlayerInfo.specialList[9].Name
        document.getElementById("specialDescription9").innerHTML = localPlayerInfo.specialList[9].Descrip
        document.getElementById("specialMenuInput9").innerHTML = localPlayerInfo.specialList[9].Name
      }
      if (localPlayerInfo.specialList[10] !== undefined) {
        document.getElementById("specialTitle10").style.display = "block";
        document.getElementById("specialMenuInput10").style.display = "block";
        document.getElementById("specialTitle10").innerHTML = localPlayerInfo.specialList[10].Name
        document.getElementById("specialDescription10").innerHTML = localPlayerInfo.specialList[10].Descrip
        document.getElementById("specialMenuInput10").innerHTML = localPlayerInfo.specialList[10].Name
      }
      if (localPlayerInfo.specialList[11] !== undefined) {
        document.getElementById("specialTitle11").style.display = "block";
        document.getElementById("specialMenuInput11").style.display = "block";
        document.getElementById("specialTitle11").innerHTML = localPlayerInfo.specialList[11].Name
        document.getElementById("specialDescription11").innerHTML = localPlayerInfo.specialList[11].Descrip
        document.getElementById("specialMenuInput11").innerHTML = localPlayerInfo.specialList[11].Name
      }
      if (localPlayerInfo.specialList[12] !== undefined) {
        document.getElementById("specialTitle12").style.display = "block";
        document.getElementById("specialMenuInput12").style.display = "block";
        document.getElementById("specialTitle12").innerHTML = localPlayerInfo.specialList[12].Name
        document.getElementById("specialDescription12").innerHTML = localPlayerInfo.specialList[12].Descrip
        document.getElementById("specialMenuInput12").innerHTML = localPlayerInfo.specialList[12].Name
      }
      if (localPlayerInfo.specialList[13] !== undefined) {
        document.getElementById("specialTitle13").style.display = "block";
        document.getElementById("specialMenuInput13").style.display = "block";
        document.getElementById("specialTitle13").innerHTML = localPlayerInfo.specialList[13].Name
        document.getElementById("specialDescription13").innerHTML = localPlayerInfo.specialList[13].Descrip
        document.getElementById("specialMenuInput13").innerHTML = localPlayerInfo.specialList[13].Name
      }
      if (localPlayerInfo.specialList[14] !== undefined) {
        document.getElementById("specialTitle14").style.display = "block";
        document.getElementById("specialMenuInput14").style.display = "block";
        document.getElementById("specialTitle14").innerHTML = localPlayerInfo.specialList[14].Name
        document.getElementById("specialDescription14").innerHTML = localPlayerInfo.specialList[14].Descrip
        document.getElementById("specialMenuInput14").innerHTML = localPlayerInfo.specialList[14].Name
      }
      if (localPlayerInfo.specialList[15] !== undefined) {
        document.getElementById("specialTitle15").style.display = "block";
        document.getElementById("specialMenuInput15").style.display = "block";
        document.getElementById("specialTitle15").innerHTML = localPlayerInfo.specialList[15].Name
        document.getElementById("specialDescription15").innerHTML = localPlayerInfo.specialList[15].Descrip
        document.getElementById("specialMenuInput15").innerHTML = localPlayerInfo.specialList[15].Name
      }
      if (localPlayerInfo.specialList[16] !== undefined) {
        document.getElementById("specialTitle16").style.display = "block";
        document.getElementById("specialMenuInput16").style.display = "block";
        document.getElementById("specialTitle16").innerHTML = localPlayerInfo.specialList[16].Name
        document.getElementById("specialDescription16").innerHTML = localPlayerInfo.specialList[16].Descrip
        document.getElementById("specialMenuInput16").innerHTML = localPlayerInfo.specialList[16].Name
      }
      if (localPlayerInfo.specialList[17] !== undefined) {
        document.getElementById("specialTitle17").style.display = "block";
        document.getElementById("specialTitle17").innerHTML = localPlayerInfo.specialList[17].Name
        document.getElementById("specialDescription17").innerHTML = localPlayerInfo.specialList[17].Descrip
        document.getElementById("specialMenuInput17").innerHTML = localPlayerInfo.specialList[17].Name
      }
      if (localPlayerInfo.specialList[18] !== undefined) {
        document.getElementById("specialTitle18").style.display = "block";
        document.getElementById("specialMenuInput18").style.display = "block";
        document.getElementById("specialTitle18").innerHTML = localPlayerInfo.specialList[18].Name
        document.getElementById("specialDescription18").innerHTML = localPlayerInfo.specialList[18].Descrip
        document.getElementById("specialMenuInput18").innerHTML = localPlayerInfo.specialList[18].Name
      }
      if (localPlayerInfo.specialList[19] !== undefined) {
        document.getElementById("specialTitle19").style.display = "block";
        document.getElementById("specialTitle19").innerHTML = localPlayerInfo.specialList[19].Name
        document.getElementById("specialDescription19").innerHTML = localPlayerInfo.specialList[19].Descrip
        document.getElementById("specialMenuInput19").innerHTML = localPlayerInfo.specialList[19].Name
      }
      if (localPlayerInfo.specialList[20] !== undefined) {
        document.getElementById("specialTitle20").style.display = "block";
        document.getElementById("specialMenuInput20").style.display = "block";
        document.getElementById("specialTitle20").innerHTML = localPlayerInfo.specialList[20].Name
        document.getElementById("specialDescription20").innerHTML = localPlayerInfo.specialList[20].Descrip
        document.getElementById("specialMenuInput20").innerHTML = localPlayerInfo.specialList[20].Name
      }
      if (localPlayerInfo.specialList[21] !== undefined) {
        document.getElementById("specialTitle21").style.display = "block";
        document.getElementById("specialMenuInput21").style.display = "block";
        document.getElementById("specialTitle21").innerHTML = localPlayerInfo.specialList[21].Name
        document.getElementById("specialDescription21").innerHTML = localPlayerInfo.specialList[21].Descrip
        document.getElementById("specialMenuInput21").innerHTML = localPlayerInfo.specialList[21].Name
      }
      if (localPlayerInfo.specialList[22] !== undefined) {
        document.getElementById("specialTitle22").style.display = "block";
        document.getElementById("specialTitle22").innerHTML = localPlayerInfo.specialList[22].Name
        document.getElementById("specialDescription22").innerHTML = localPlayerInfo.specialList[22].Descrip
        document.getElementById("specialMenuInput22").innerHTML = localPlayerInfo.specialList[22].Name
      }
      if (localPlayerInfo.specialList[23] !== undefined) {
        document.getElementById("specialTitle23").style.display = "block";
        document.getElementById("specialMenuInput23").style.display = "block";
        document.getElementById("specialTitle23").innerHTML = localPlayerInfo.specialList[23].Name
        document.getElementById("specialDescription23").innerHTML = localPlayerInfo.specialList[23].Descrip
        document.getElementById("specialMenuInput23").innerHTML = localPlayerInfo.specialList[23].Name
      }
      if (localPlayerInfo.specialList[24] !== undefined) {
        document.getElementById("specialTitle24").style.display = "block";
        document.getElementById("specialMenuInput24").style.display = "block";
        document.getElementById("specialTitle24").innerHTML = localPlayerInfo.specialList[24].Name
        document.getElementById("specialDescription24").innerHTML = localPlayerInfo.specialList[24].Descrip
        document.getElementById("specialMenuInput24").innerHTML = localPlayerInfo.specialList[24].Name
      }
      if (localPlayerInfo.specialList[25] !== undefined) {
        document.getElementById("specialTitle25").style.display = "block";
        document.getElementById("specialMenuInput25").style.display = "block";
        document.getElementById("specialTitle25").innerHTML = localPlayerInfo.specialList[25].Name
        document.getElementById("specialDescription25").innerHTML = localPlayerInfo.specialList[25].Descrip
        document.getElementById("specialMenuInput25").innerHTML = localPlayerInfo.specialList[25].Name
      }
      if (localPlayerInfo.specialList[26] !== undefined) {
        document.getElementById("specialTitle26").style.display = "block";
        document.getElementById("specialMenuInput26").style.display = "block";
        document.getElementById("specialTitle26").innerHTML = localPlayerInfo.specialList[26].Name
        document.getElementById("specialDescription26").innerHTML = localPlayerInfo.specialList[26].Descrip
        document.getElementById("specialMenuInput26").innerHTML = localPlayerInfo.specialList[26].Name
      }
      if (localPlayerInfo.specialList[27] !== undefined) {
        document.getElementById("specialTitle27").style.display = "block";
        document.getElementById("specialMenuInput27").style.display = "block";
        document.getElementById("specialTitle27").innerHTML = localPlayerInfo.specialList[27].Name
        document.getElementById("specialDescription27").innerHTML = localPlayerInfo.specialList[27].Descrip
        document.getElementById("specialMenuInput27").innerHTML = localPlayerInfo.specialList[27].Name
      }
      if (localPlayerInfo.specialList[28] !== undefined) {
        document.getElementById("specialTitle28").style.display = "block";
        document.getElementById("specialMenuInput28").style.display = "block";
        document.getElementById("specialTitle28").innerHTML = localPlayerInfo.specialList[28].Name
        document.getElementById("specialDescription28").innerHTML = localPlayerInfo.specialList[28].Descrip
        document.getElementById("specialMenuInput28").innerHTML = localPlayerInfo.specialList[28].Name
      }
      if (localPlayerInfo.specialList[29] !== undefined) {
        document.getElementById("specialTitle29").style.display = "block";
        document.getElementById("specialMenuInput29").style.display = "block";
        document.getElementById("specialTitle29").innerHTML = localPlayerInfo.specialList[29].Name
        document.getElementById("specialDescription29").innerHTML = localPlayerInfo.specialList[29].Descrip
        document.getElementById("specialMenuInput29").innerHTML = localPlayerInfo.specialList[29].Name
      }
      if (localPlayerInfo.specialList[30] !== undefined) {
        document.getElementById("specialTitle30").style.display = "block";
        document.getElementById("specialMenuInput30").style.display = "block";
        document.getElementById("specialTitle30").innerHTML = localPlayerInfo.specialList[30].Name
        document.getElementById("specialDescription30").innerHTML = localPlayerInfo.specialList[30].Descrip
        document.getElementById("specialMenuInput30").innerHTML = localPlayerInfo.specialList[30].Name
      }


      document.getElementById("specialEdit").style.display = "none";
    });

    this.socket.on('playerConsumed', function (pred, prey) {
      console.log('pred = ', pred, '\n', 'prey = ', prey);
      if (prey.playerId === self.socket.id) {
        console.log('you are prey');
        //self.avatar.head.setTexture('emptyplayer');
        self.container.visible = false;
        for (let i = 0; i < otherPlayers.length; i++) {
          if (pred.playerId === otherPlayers[i].playerId) {
            console.log('you were swallowed whole by', pred.Username);

            cam1.startFollow(otherPlayers[i]);
          }
        }
      } else {
        console.log('you are not prey');
        for (let i = 0; i < otherPlayers.length; i++) {
          if (prey.playerId === otherPlayers[i].playerId) {
            console.log(pred.Username, ' swallowed ', prey.Username, ' whole!');
            console.log('otherPlayers[i] = ', otherPlayers[i]);
            otherPlayers[i].visible = false;
            //otherPlayers[i].otherContainer.otherPlayerHead.setTexture('emptyplayer');
            //otherPlayers[i].otherPlayerHead.setTexture('emptyplayer');
            //otherPlayers[i].otherContainer[0].setTexture('emptyplayer');
            //otherPlayers[i].setTexture('emptyplayer');
            //otherPlayers[i][0].setTexture('emptyplayer');
            /*for (let info = 0; info < otherPlayers[i].length; info++) {
              console.log('otherPlayers[i][info] = ', otherPlayers[i][info]);
              //otherPlayers[i][info].setTexture('emptyplayer');
              //cam1.startFollow(otherPlayers[i]);
            }*/
          }
        }
      }
    })

    var input = document.getElementById("optionsTab");
    input.addEventListener("click", function(event) {
      event.preventDefault();
      console.log('options tab was clicked!');
      document.getElementById("optionsDisplay").style.display = "block";

      document.getElementById("lookDisplay").style.display = "none";
      document.getElementById("itemsDisplay").style.display = "none";
      document.getElementById("spellsDisplay").style.display = "none";
      document.getElementById("mapDisplay").style.display = "none";
      document.getElementById("specialDisplay").style.display = "none";
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













    /*var specialMenuInput = document.getElementById("specialMenuInput");

    specialMenuInput.addEventListener("click", function(event) {
      event.preventDefault();
      specialMenuSelect();
    });
    function specialMenuSelect (event) {
      console.log('special clicked n stuff');
      //console.log(spellLocation.x, ',', spellLocation.y);

    }*/


















    //makes all the objects you can't walk through
    let blocked = this.physics.add.staticGroup();


    //creating the avatar selection screen
    function addPlayer(self, playerInfo) {
      console.log('localPlayerInfo at addPlayer Function = ', localPlayerInfo);
      console.log(
        playerInfo.playerId, 'Has entered the Character Creation screen with the following default values: ', '\n',
        'Set head Sprite to: ', playerInfo.head.sprite, '\n',
        'Set head Color to: ', playerInfo.head.color, '\n',
        'Set head Secondary Sprite to: ', playerInfo.head.secondarySprite, '\n',
        'Set head Secondary Color to: ', playerInfo.head.secondaryColor, '\n',
        'Set head Accent Sprite to: ', playerInfo.head.accentSprite, '\n',
        'Set head Accent Color to: ', playerInfo.head.accentColor, '\n',
        'Set body Sprite to: ', playerInfo.body.sprite, '\n',
        'Set body Color to: ', playerInfo.body.color, '\n',
        'Set body Secondary Sprite to: ', playerInfo.body.secondarySprite, '\n',
        'Set body Secondary Color to: ', playerInfo.body.secondaryColor, '\n',
        'Set body Accent Sprite to: ', playerInfo.body.accentSprite, '\n',
        'Set body Accent Color to: ', playerInfo.body.accentColor, '\n',
        'Set tail Sprite to: ', playerInfo.tail.sprite, '\n',
        'Set tail Color to: ', playerInfo.tail.color, '\n',
        'Set tail Secondary Sprite to: ', playerInfo.tail.secondarySprite, '\n',
        'Set tail Secondary Color to: ', playerInfo.tail.secondaryColor, '\n',
        'Set tail Accent Sprite to: ', playerInfo.tail.accentSprite, '\n',
        'Set tail Accent Color to: ', playerInfo.tail.accentColor, '\n',
        'Set hair Sprite to: ', playerInfo.hair.sprite, '\n',
        'Set hair Color to: ', playerInfo.hair.color, '\n',
        'Set ear Sprite to: ', playerInfo.ear.sprite, '\n',
        'Set ear Color to: ', playerInfo.ear.color, '\n',
        'Set outer eyes sprite to:', playerInfo.eyes.outer, '\n',
        'Set irises to:', playerInfo.eyes.iris, '\n',
        'Set eye color to:', playerInfo.eyes.color, '\n',
        'Set genitles to:', playerInfo.genitles.sprite
      );

      //self.container = self.add.container(0, 0).setSize(109, 220).setInteractive();
      self.container = self.add.container(playerInfo.x, playerInfo.y).setSize(109, 220).setInteractive();

      self.head = self.physics.add.sprite(0, 0, playerInfo.head.sprite).setInteractive();
      self.head.setTint(playerInfo.head.color);
      self.secondaryHead = self.physics.add.sprite(0, 0, playerInfo.head.secondarySprite).setInteractive();
      self.secondaryHead.setTint(playerInfo.head.secondaryColor);
      self.accentHead = self.physics.add.sprite(0, 0, playerInfo.head.accentSprite).setInteractive();
      self.accentHead.setTint(playerInfo.head.accentColor);

      self.body = self.physics.add.sprite(0, 0, playerInfo.body.sprite).setInteractive();
      self.body.setTint(playerInfo.body.color);
      self.secondaryBody = self.physics.add.sprite(0, 0, playerInfo.body.secondarySprite).setInteractive();
      self.secondaryBody.setTint(playerInfo.body.secondaryColor);
      self.accentBody = self.physics.add.sprite(0, 0, playerInfo.body.accentSprite).setInteractive();
      self.accentBody.setTint(playerInfo.body.accentColor);

      self.tail = self.physics.add.sprite(0, 0, playerInfo.tail.sprite).setInteractive();
      self.tail.setTint(playerInfo.tail.color);
      self.secondaryTail = self.physics.add.sprite(0, 0, playerInfo.tail.secondarySprite).setInteractive();
      self.secondaryTail.setTint(playerInfo.tail.secondaryColor);
      self.accentTail = self.physics.add.sprite(0, 0, playerInfo.tail.accentSprite).setInteractive();
      self.accentTail.setTint(playerInfo.tail.accentColor);

      self.hair = self.physics.add.sprite(0, 0, playerInfo.hair.sprite).setInteractive();
      self.hair.setTint(playerInfo.hair.color);

      self.ear = self.physics.add.sprite(0, 0, playerInfo.ear.sprite).setInteractive();
      self.ear.setTint(playerInfo.ear.color);

      self.eyes = self.physics.add.sprite(0, 0, playerInfo.eyes.outer).setInteractive();
      self.iris = self.physics.add.sprite(0, 0, playerInfo.eyes.iris).setInteractive();
      self.iris.setTint(playerInfo.eyes.color);

      self.genitles = self.physics.add.sprite(0, 0, playerInfo.genitles.sprite).setInteractive();
      //self.genitles.setTint(playerInfo.genitles.color);


      self.container.add([
        self.tail,
        self.secondaryTail,
        self.accentTail,
        self.head,
        self.ear,
        self.secondaryHead,
        self.accentHead,
        self.eyes,
        self.iris,
        self.hair,
        self.body,
        self.secondaryBody,
        self.accentBody,
        self.genitles
      ]);
      self.container.sendToBack(self.tail);

      //self.container.visible = false;
      //localPlayerInfo.sprite = self.stack

      let cam1 = self.cameras.main.setSize(920, 920).startFollow(self.container).setName('Camera 1');

      self.container.setSize(8, 8);
      //self.container.setOffset(11, 40);
      //self.container.setCollideWorldBounds(false);

      document.getElementById('phaserApp').focus();

      self.body.on('pointerdown', function (pointer) {
        if (pointer.rightButtonDown()) {
          clicked = playerInfo;
        } else {
          console.log('sprite was Left clicked');
        }
      });

      avatarSelected = true;
    };
    function addOtherPlayers(self, playerInfo) {
      console.log("addOtherPlayers called");
      console.log('addOtherPlayers function username = ', playerInfo.username);
      console.log('addOtherPlayers function Head Tint = ', playerInfo.headColor);
      console.log('addOtherPlayers function Head Tint = ', playerInfo.bodyColor);
      console.log('addOtherPlayer function called and playerInfo.head = ', playerInfo.head, 'and, ', playerInfo.body);
      //var otherContainer = self.add.container(playerInfo.x, playerInfo.y).setInteractive();
      //const otherPlayerHead = self.add.sprite(0, 0, playerInfo.head).setInteractive();
      //const otherPlayerbody = self.add.sprite(0, 0, playerInfo.body).setInteractive();
      //otherContainer.add([ otherPlayerHead, otherPlayerbody ]);

      //otherContainer.playerId = playerInfo.playerId;
      ////self.otherPlayers.add(otherContainer);
      //otherPlayers.push(otherContainer);
      //console.log('self.otherPlayers = ', self.otherPlayers);

      //otherPlayerHead.setTint(playerInfo.headColor);
      //otherPlayerbody.setTint(playerInfo.bodyColor);

      var otherContainer = self.add.container(playerInfo.x, playerInfo.y).setSize(109, 220).setInteractive();

      const otherPlayerHead = self.add.sprite(0, 0, playerInfo.head.sprite).setInteractive();
      otherPlayerHead.setTint(playerInfo.head.color);
      const otherPlayersecondaryHead = self.add.sprite(0, 0, playerInfo.head.secondarySprite).setInteractive();
      otherPlayersecondaryHead.setTint(playerInfo.head.secondaryColor);
      const otherPlayeraccentHead = self.add.sprite(0, 0, playerInfo.head.accentSprite).setInteractive();
      otherPlayeraccentHead.setTint(playerInfo.head.accentColor);

      const otherPlayerbody = self.add.sprite(0, 0, playerInfo.body.sprite).setInteractive();
      otherPlayerbody.setTint(playerInfo.body.color);
      const otherPlayersecondaryBody = self.add.sprite(0, 0, playerInfo.body.secondarySprite).setInteractive();
      otherPlayersecondaryBody.setTint(playerInfo.body.secondaryColor);
      const otherPlayeraccentBody = self.add.sprite(0, 0, playerInfo.body.accentSprite).setInteractive();
      otherPlayeraccentBody.setTint(playerInfo.body.accentColor);

      const otherPlayertail = self.add.sprite(0, 0, playerInfo.tail.sprite).setInteractive();
      otherPlayertail.setTint(playerInfo.tail.color);
      const otherPlayersecondaryTail = self.add.sprite(0, 0, playerInfo.tail.secondarySprite).setInteractive();
      otherPlayersecondaryTail.setTint(playerInfo.tail.secondaryColor);
      const otherPlayeraccentTail = self.add.sprite(0, 0, playerInfo.tail.accentSprite).setInteractive();
      otherPlayeraccentTail.setTint(playerInfo.tail.accentColor);

      const otherPlayerhair = self.add.sprite(0, 0, playerInfo.hair.sprite).setInteractive();
      otherPlayerhair.setTint(playerInfo.hair.color);

      const otherPlayerear = self.add.sprite(0, 0, playerInfo.ear.sprite).setInteractive();
      otherPlayerear.setTint(playerInfo.ear.color);

      const otherPlayereyes = self.add.sprite(0, 0, playerInfo.eyes.outer).setInteractive();
      const otherPlayeriris = self.add.sprite(0, 0, playerInfo.eyes.iris).setInteractive();
      otherPlayeriris.setTint(playerInfo.eyes.color);

      const otherPlayergenitles = self.add.sprite(0, 0, playerInfo.genitles.sprite).setInteractive();
      //otherPlayergenitles.setTint(playerInfo.genitles.color);


      otherContainer.add([
        otherPlayertail,
        otherPlayersecondaryTail,
        otherPlayeraccentTail,
        otherPlayerHead,
        otherPlayerear,
        otherPlayersecondaryHead,
        otherPlayeraccentHead,
        otherPlayereyes,
        otherPlayeriris,
        otherPlayerhair,
        otherPlayerbody,
        otherPlayersecondaryBody,
        otherPlayeraccentBody,
        otherPlayergenitles
      ]);
      otherContainer.sendToBack(otherPlayertail);

      //console.log('otherPlayerotherPlayers = ', otherPlayerotherPlayers);
      otherContainer.playerId = playerInfo.playerId;
      //self.otherPlayers.add(otherContainer);
      otherPlayers.push(otherContainer);
      // console.log('self.otherPlayers = ', self.otherPlayers);



      otherPlayerbody.on('pointerdown', function (pointer){
        if (pointer.rightButtonDown()) {
          clicked = playerInfo;
        } else {
          console.log('sprite was Left clicked');
        }
      });
    };

    self.anims.create({
      key: 'head_01Down',
      frames: self.anims.generateFrameNumbers('head_01', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_01Right',
      frames: self.anims.generateFrameNumbers('head_01', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_01Left',
      frames: self.anims.generateFrameNumbers('head_01', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_01Up',
      frames: self.anims.generateFrameNumbers('head_01', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_01Stop',
      frames: self.anims.generateFrameNumbers('head_01', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'head_02Down',
      frames: self.anims.generateFrameNumbers('head_02', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_02Right',
      frames: self.anims.generateFrameNumbers('head_02', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_02Left',
      frames: self.anims.generateFrameNumbers('head_02', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_02Up',
      frames: self.anims.generateFrameNumbers('head_02', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_02Stop',
      frames: self.anims.generateFrameNumbers('head_02', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'head_03Down',
      frames: self.anims.generateFrameNumbers('head_03', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_03Right',
      frames: self.anims.generateFrameNumbers('head_03', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_03Left',
      frames: self.anims.generateFrameNumbers('head_03', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_03Up',
      frames: self.anims.generateFrameNumbers('head_03', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'head_03Stop',
      frames: self.anims.generateFrameNumbers('head_03', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'body_01Down',
      frames: self.anims.generateFrameNumbers('body_01', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'body_01Right',
      frames: self.anims.generateFrameNumbers('body_01', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'body_01Left',
      frames: self.anims.generateFrameNumbers('body_01', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'body_01Up',
      frames: self.anims.generateFrameNumbers('body_01', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'body_01Stop',
      frames: self.anims.generateFrameNumbers('body_01', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'tail_01Down',
      frames: self.anims.generateFrameNumbers('tail_01', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'tail_01Right',
      frames: self.anims.generateFrameNumbers('tail_01', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'tail_01Left',
      frames: self.anims.generateFrameNumbers('tail_01', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'tail_01Up',
      frames: self.anims.generateFrameNumbers('tail_01', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'tail_01Stop',
      frames: self.anims.generateFrameNumbers('tail_01', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'eyes_01Down',
      frames: self.anims.generateFrameNumbers('eyes_01', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'eyes_01Right',
      frames: self.anims.generateFrameNumbers('eyes_01', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'eyes_01Left',
      frames: self.anims.generateFrameNumbers('eyes_01', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'eyes_01Up',
      frames: self.anims.generateFrameNumbers('eyes_01', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'eyes_01Stop',
      frames: self.anims.generateFrameNumbers('eyes_01', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'eyes_02Down',
      frames: self.anims.generateFrameNumbers('eyes_02', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'eyes_02Right',
      frames: self.anims.generateFrameNumbers('eyes_02', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'eyes_02Left',
      frames: self.anims.generateFrameNumbers('eyes_02', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'eyes_02Up',
      frames: self.anims.generateFrameNumbers('eyes_02', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'eyes_02Stop',
      frames: self.anims.generateFrameNumbers('eyes_02', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'secondaryBody_01Down',
      frames: self.anims.generateFrameNumbers('secondaryBody_01', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_01Right',
      frames: self.anims.generateFrameNumbers('secondaryBody_01', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_01Left',
      frames: self.anims.generateFrameNumbers('secondaryBody_01', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_01Up',
      frames: self.anims.generateFrameNumbers('secondaryBody_01', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_01Stop',
      frames: self.anims.generateFrameNumbers('secondaryBody_01', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'secondaryBody_02Down',
      frames: self.anims.generateFrameNumbers('secondaryBody_02', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_02Right',
      frames: self.anims.generateFrameNumbers('secondaryBody_02', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_02Left',
      frames: self.anims.generateFrameNumbers('secondaryBody_02', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_02Up',
      frames: self.anims.generateFrameNumbers('secondaryBody_02', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_02Stop',
      frames: self.anims.generateFrameNumbers('secondaryBody_02', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'secondaryBody_03Down',
      frames: self.anims.generateFrameNumbers('secondaryBody_03', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_03Right',
      frames: self.anims.generateFrameNumbers('secondaryBody_03', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_03Left',
      frames: self.anims.generateFrameNumbers('secondaryBody_03', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_03Up',
      frames: self.anims.generateFrameNumbers('secondaryBody_03', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryBody_03Stop',
      frames: self.anims.generateFrameNumbers('secondaryBody_03', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'secondaryHead_01Down',
      frames: self.anims.generateFrameNumbers('secondaryHead_01', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_01Right',
      frames: self.anims.generateFrameNumbers('secondaryHead_01', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_01Left',
      frames: self.anims.generateFrameNumbers('secondaryHead_01', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_01Up',
      frames: self.anims.generateFrameNumbers('secondaryHead_01', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_01Stop',
      frames: self.anims.generateFrameNumbers('secondaryHead_01', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'secondaryHead_02Down',
      frames: self.anims.generateFrameNumbers('secondaryHead_02', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_02Right',
      frames: self.anims.generateFrameNumbers('secondaryHead_02', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_02Left',
      frames: self.anims.generateFrameNumbers('secondaryHead_02', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_02Up',
      frames: self.anims.generateFrameNumbers('secondaryHead_02', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_02Stop',
      frames: self.anims.generateFrameNumbers('secondaryHead_02', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'secondaryHead_03Down',
      frames: self.anims.generateFrameNumbers('secondaryHead_03', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_03Right',
      frames: self.anims.generateFrameNumbers('secondaryHead_03', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_03Left',
      frames: self.anims.generateFrameNumbers('secondaryHead_03', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_03Up',
      frames: self.anims.generateFrameNumbers('secondaryHead_03', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'secondaryHead_03Stop',
      frames: self.anims.generateFrameNumbers('secondaryHead_03', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'hair_01Down',
      frames: self.anims.generateFrameNumbers('hair_01', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'hair_01Right',
      frames: self.anims.generateFrameNumbers('hair_01', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'hair_01Left',
      frames: self.anims.generateFrameNumbers('hair_01', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'hair_01Up',
      frames: self.anims.generateFrameNumbers('hair_01', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'hair_01Stop',
      frames: self.anims.generateFrameNumbers('hair_01', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'ear_01Down',
      frames: self.anims.generateFrameNumbers('ear_01', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'ear_01Right',
      frames: self.anims.generateFrameNumbers('ear_01', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'ear_01Left',
      frames: self.anims.generateFrameNumbers('ear_01', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'ear_01Up',
      frames: self.anims.generateFrameNumbers('ear_01', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'ear_01Stop',
      frames: self.anims.generateFrameNumbers('ear_01', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
    self.anims.create({
      key: 'emptyDown',
      frames: self.anims.generateFrameNumbers('empty', { start: 1, end: 8 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'emptyRight',
      frames: self.anims.generateFrameNumbers('empty', { start: 10, end: 17 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'emptyLeft',
      frames: self.anims.generateFrameNumbers('empty', { start: 19, end: 26 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'emptyUp',
      frames: self.anims.generateFrameNumbers('empty', { start: 28, end: 35 }),
      frameRate: 8,
      repeat: -1,
      showOnStart: true
    });
    self.anims.create({
      key: 'emptyStop',
      frames: self.anims.generateFrameNumbers('empty', { start: 0, end: 0 }),
      frameRate: 8,
      repeat: -1,
    });
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

    //if (this.avatar) {
      //makes it so that variables left, right, up, and down are not checked for while undefined when user is focused on chat div
      if (avatarSelected == true) {
        //console.log('avatarSelected = ', avatarSelected);
        if (chatFocused == false) {
          //console.log('chatFocused = ', chatFocused);
          if (this.cursors.left.isDown) {
            //console.log(localPlayerInfo.playerId);
            this.socket.emit('movementLeft', localPlayerInfo.playerId);
            arrows = 0;
          } else {
            if (this.cursors.right.isDown) {
              this.socket.emit('movementRight', localPlayerInfo.playerId);
              arrows = 0;
            }
          }
          if (this.cursors.up.isDown) {
            this.socket.emit('movementUp', localPlayerInfo.playerId);
            arrows = 0;
          } else {
            if (this. cursors.down.isDown) {
              this.socket.emit('movementDown', localPlayerInfo.playerId);
              arrows = 0;
            }
          }
          if (this.cursors.left.isUp && this.cursors.right.isUp) {

          }
          if (this.cursors.up.isUp && this.cursors.down.isUp) {

          }
          if (arrows == 0) {
            if (this.cursors.left.isUp && this.cursors.right.isUp && this.cursors.up.isUp && this.cursors.down.isUp) {
              //console.log('no arrow keys are being pressed');
              this.socket.emit('movementStop', localPlayerInfo.playerId);
              arrows = 1;
            }
          }
        }
      }
    //}
  }
});

export default create;
