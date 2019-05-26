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

var localPlayerInfo = {playerId:'', username:'', descrip:'', headColor:'',bodyColor:'', specialList:[]};
var voreTypes = [];
var clicked = {Identifier: ''};
var toDestroy = '';
var container = null;
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
    var self = this;
    this.socket = io();
    console.log('this.socket = ', this.socket);
    this.otherPlayers = this.physics.add.group();

    this.socket.on('currentPlayers', function (players, spells) {
      Object.keys(players).forEach(function (id) {
        console.log('Local players socket ID = ', players[id].playerId);
        if (players[id].playerId === self.socket.id) {
          addPlayer(self, players[id]);
        } else {
          addOtherPlayers(self, players[id]);
        }
      });
      spawnSpells(spells);
    });

    this.socket.on('newPlayer', function (playerInfo) {
      addOtherPlayers(self, playerInfo);
    });

    this.socket.on('avatarSelection', function (playerInfo) {
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerInfo.playerId === otherPlayer.playerId) {
          addOtherPlayers(self, playerInfo);
          console.log(playerInfo.playerId, 'chose username: ', playerInfo.username, '\n', 'Set head to: ', playerInfo.head, 'and body to: ', playerInfo.body, '\n', 'and head color to:', playerInfo.headColor,  'and body color to:', playerInfo.bodyColor, 'and they have described themselves as: ', playerInfo.descrip);
        }
      });
    });

    this.socket.on('disconnect', function (playerId) {
      self.otherPlayers.getChildren().forEach(function (otherPlayer) {
        if (playerId === otherPlayer.playerId) {
          console.log('Player ID: ', self.socket.id, 'disconnected');
          otherContainer.destroy();
        }
      });
    });

    this.socket.on('playerMoved', function (playerInfo) {
      //console.log('playerMoved called successfully');
      if (playerInfo.playerId === self.socket.id) {
        //console.log(playerInfo.x, playerInfo.y);
        self.container.setPosition(playerInfo.x, playerInfo.y);
      } else {
        //console.log('someone else is moving')
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
          if (playerInfo.playerId === otherPlayer.playerId) {
            console.log('otherPlayer variable in the playerMoved command = ', otherPlayer);
            otherPlayer.otherContainer.setPosition(playerInfo.x, playerInfo.y);
          }
        });
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
      }
      specialCreateBttnSelected(specialInfo);
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
    function specialCreateBttnSelected (specialInfo) {

      localPlayerInfo.specialList.push(specialInfo);
      console.log('special create button clicked by', localPlayerInfo.playerId, '\n', 'confirming inputs of: ', '\n', 'Special Name = ', specialInfo.Name, '\n', 'Special Verb = ', specialInfo.Verb, '\n', 'Special Description = ', specialInfo.Descrip);
      console.log('testing the push array thingy: ', localPlayerInfo.specialList[localPlayerInfo.specialList.length - 1]);
      if (localPlayerInfo.specialList[0] !== undefined) {
        document.getElementById("specialTitle0").style.display = "block";
        document.getElementById("specialMenuInput0").style.display = "block";
        document.getElementById("specialTitle0").innerHTML = localPlayerInfo.specialList[0].Name
        document.getElementById("specialDescription0").innerHTML = localPlayerInfo.specialList[0].Descrip
        document.getElementById("specialMenuInput0").innerHTML = localPlayerInfo.specialList[0].Name
        specialMenuInput0.addEventListener("click", function() {
          self.socket.emit('voreActionClicked', clicked);
        });
      }
      if (localPlayerInfo.specialList[1] !== undefined) {
        document.getElementById("specialTitle1").style.display = "block";
        document.getElementById("specialMenuInput1").style.display = "block";
        document.getElementById("specialTitle1").innerHTML = localPlayerInfo.specialList[1].Name
        document.getElementById("specialDescription1").innerHTML = localPlayerInfo.specialList[1].Descrip
        document.getElementById("specialMenuInput1").innerHTML = localPlayerInfo.specialList[1].Name
      }
      if (localPlayerInfo.specialList[2] !== undefined) {
        document.getElementById("specialTitle2").style.display = "block";
        document.getElementById("specialMenuInput2").style.display = "block";
        document.getElementById("specialTitle2").innerHTML = localPlayerInfo.specialList[2].Name
        document.getElementById("specialDescription2").innerHTML = localPlayerInfo.specialList[2].Descrip
        document.getElementById("specialMenuInput2").innerHTML = localPlayerInfo.specialList[2].Name
      }
      if (localPlayerInfo.specialList[3] !== undefined) {
        document.getElementById("specialTitle3").style.display = "block";
        document.getElementById("specialMenuInput3").style.display = "block";
        document.getElementById("specialTitle3").innerHTML = localPlayerInfo.specialList[3].Name
        document.getElementById("specialDescription3").innerHTML = localPlayerInfo.specialList[3].Descrip
        document.getElementById("specialMenuInput3").innerHTML = localPlayerInfo.specialList[3].Name
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
    }

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













    var specialMenuInput = document.getElementById("specialMenuInput");

    specialMenuInput.addEventListener("click", function(event) {
      event.preventDefault();
      specialMenuSelect();
    });
    function specialMenuSelect (event) {
      console.log('special clicked n stuff');
      //console.log(spellLocation.x, ',', spellLocation.y);

    }


















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
        localPlayerInfo.playerId = playerInfo.playerId
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
            document.getElementById('speciesSelectionWindow').src = "assets/images/WolfAnthroBase.png";
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
          localPlayerInfo.username = playerInfo.username;
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
			    avatarInfo.head = 'WolfAnthroBase';
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
          localPlayerInfo.descrip = playerInfo.descrip;
          localPlayerInfo.headColor = playerInfo.headColor;
          localPlayerInfo.bodyColor = playerInfo.bodyColor;
          self.socket.emit('avatarSelected', { head: avatarInfo.head, body: avatarInfo.body, username: playerInfo.username, headColor: playerInfo.headColor, bodyColor: playerInfo.bodyColor, descrip: playerInfo.descrip });
          console.log('log in button clicked by', playerInfo.playerId, '\n', 'confirming selections of: ', '\n', 'Username = ', playerInfo.username, '\n', 'Head Color = ', playerInfo.headColor, '\n', 'Body Color = ', playerInfo.bodyColor, '\n', 'Descriptoin = ', playerInfo.descrip);
          createSprite();
		    };

        function createSprite (){
          let avatar = {};
          self.container = self.add.container(playerInfo.x, playerInfo.y).setInteractive();
          if(avatarInfo.head)avatar.head = self.physics.add.image(0, 0, avatarInfo.head).setInteractive();
          avatar.head.setTint(playerInfo.headColor);
          console.log('Modified color to head is: ', playerInfo.headColor);

          if(avatarInfo.body)avatar.body = self.physics.add.image(0, 0, avatarInfo.body).setInteractive();
          avatar.body.setTint(playerInfo.bodyColor);
          console.log('Modified color to body is: ', playerInfo.bodyColor);

          self.container.add([ avatar.head, avatar.body ]);

          avatar.body.on('pointerdown', function (pointer) {
            if (pointer.rightButtonDown()) {
              clicked = playerInfo;
            } else {
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

        let cam1 = self.cameras.main.setSize(920, 920).startFollow(self.container).setName('Camera 1');
        self.avatar.head.setSize(8, 8);
        self.avatar.head.setOffset(11, 40);
        self.avatar.head.setCollideWorldBounds(false);

        self.avatar.body.setSize(8, 8);
        self.avatar.body.setOffset(11, 40);
        self.avatar.body.setCollideWorldBounds(false);
      }
    };

    function addOtherPlayers(self, playerInfo) {
      console.log("addOtherPlayers called");
      console.log('addOtherPlayers function username = ', playerInfo.username);
      console.log('addOtherPlayers function Head Tint = ', playerInfo.headColor);
      console.log('addOtherPlayers function Head Tint = ', playerInfo.bodyColor);
      //console.log('addOtherPlayer function called and playerInfo.head = ', playerInfo.head, 'and, ', playerInfo.body);
      var otherContainer = self.add.container(playerInfo.x, playerInfo.y).setInteractive();
      const otherPlayerHead = self.add.sprite(0, 0, playerInfo.head).setInteractive();
      const otherPlayerBody = self.add.sprite(0, 0, playerInfo.body).setInteractive();
      otherContainer.add([ otherPlayerHead, otherPlayerBody ]);


      otherContainer.playerId = playerInfo.playerId;
      self.otherPlayers.add(otherContainer);
      console.log('self.otherPlayers = ', self.otherPlayers);


        otherPlayerHead.setTint(playerInfo.headColor);
        otherPlayerBody.setTint(playerInfo.bodyColor);
        otherPlayerBody.on('pointerdown', function (pointer){

        if (pointer.rightButtonDown()) {
          clicked = playerInfo;
        } else {
          console.log('sprite was Left clicked');
        }
      });
    };
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
            //console.log(localPlayerInfo.playerId);
            this.socket.emit('movementLeft', localPlayerInfo.playerId);

          } else {
            if (this.cursors.right.isDown) {
              this.socket.emit('movementRight', localPlayerInfo.playerId);

            }
          }
          if (this.cursors.up.isDown) {
            this.socket.emit('movementUp', localPlayerInfo.playerId);

          } else {
            if (this. cursors.down.isDown) {
              this.socket.emit('movementDown', localPlayerInfo.playerId);

            }
          }
          if (this.cursors.left.isUp && this.cursors.right.isUp) {

          }
          if (this.cursors.up.isUp && this.cursors.down.isUp) {

          }
        }
      }
    }
  }
});

export default create;
