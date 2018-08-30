import { Game, socket } from './index.js'

var ui = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function ui() {
  ////active is set to false here, so it waits for a command to launch////
  Phaser.Scene.call(this, {key: 'ui', active: false});
  this.pic;
  },
  create() {
     console.log('Ui Started');
     let display = this; //Save this
     this.input.setGlobalTopOnly(true); // No idea what this does!

     //Menu
     let menu = this.add.image(960.5, 460.5, 'menuframe').setScrollFactor(0);
     menu.depth = 5;
     //numberButton01
     let numberButton01 = this.add.image(181, 903, 'numberbutton').setScrollFactor(0);
      numberButton01.depth = 6;
      numberButton01.setInteractive();
      numberButton01.on('pointerdown', function () {
       menu.tint = 0x0000FF;
      });
     //numberButton02
     let numberButton02 = this.add.image(250, 903, 'numberbutton').setScrollFactor(0);
      numberButton02.depth = 6;
      numberButton02.setInteractive();
      numberButton02.on('pointerdown', function () {
       menu.tint = 0x800000;
      });
     //numberButton03
     let numberButton03 = this.add.image(317, 903, 'numberbutton').setScrollFactor(0);
      numberButton03.depth = 6;
      numberButton03.setInteractive();
      numberButton03.on('pointerdown', function () {
       menu.tint = 0xFFF00;
      });
     //numberButton04
     let numberButton04 = this.add.image(383, 903, 'numberbutton').setScrollFactor(0);
      numberButton04.depth = 6;
      numberButton04.setInteractive();
      numberButton04.on('pointerdown', function () {
        menu.tint = 0x008000;
      });
      //numberButton05
      let numberButton05 = this.add.image(448, 903, 'numberbutton').setScrollFactor(0);
      numberButton05.depth = 6;
      numberButton05.setInteractive();
      numberButton05.on('pointerdown', function () {
        menu.tint = 0x33FFE9;
      });
    //numberButton06
    let numberButton06 = this.add.image(512, 903, 'numberbutton').setScrollFactor(0);
      numberButton06.depth = 6;
      numberButton06.setInteractive();
      numberButton06.on('pointerdown', function () {
        menu.tint = 0xFCFF33;
      });
      //numberButton07
    let numberButton07 = this.add.image(575, 903, 'numberbutton').setScrollFactor(0);
      numberButton07.depth = 6;
      numberButton07.setInteractive();
      numberButton07.on('pointerdown', function () {
        menu.tint = 0xFF3333;
      });
    //numberButton08
    let numberButton08 = this.add.image(637, 903, 'numberbutton').setScrollFactor(0);
      numberButton08.depth = 6;
      numberButton08.setInteractive();
      numberButton08.on('pointerdown', function () {
        menu.tint = 0xFFFFFF;
      });
    //lookTab
    let lookTab = this.add.image(1039, 15, 'looktab').setScrollFactor(0);
    lookTab.depth = 6;
    lookTab.setInteractive();
    lookTab.on('pointerdown', function () {
      console.log('look tab was pressed');
      let tabDisplay = display.add.image(1440, 250, 'lookdisplay').setScrollFactor(0);
        tabDisplay.depth = 7
        //let lookTab.tint = 0x33FFE9;
    });
    //itemsTab
    let itemsTab = this.add.image(1176, 15, 'itemstab').setScrollFactor(0);
    itemsTab.depth = 6;
    itemsTab.setInteractive();
    itemsTab.on('pointerdown', function () {
      console.log('items tab was pressed');
      let tabDisplay = display.add.image(1440, 250, 'itemsdisplay').setScrollFactor(0);
      tabDisplay.depth = 7
      //let itemsTab.tint = 0x33FFE9;
    });
    //spellsTab
    let spellsTab = this.add.image(1313, 15, 'spellstab').setScrollFactor(0);
    spellsTab.depth = 6;
    spellsTab.setInteractive();
    spellsTab.on('pointerdown', function () {
      console.log('spells tab was pressed');
      let tabDisplay = display.add.image(1440, 250, 'spellsdisplay').setScrollFactor(0);
      tabDisplay.depth = 7
      //let spellsTab.tint = 0x33FFE9;
    });
    //mapsTab
    let mapTab = this.add.image(1450, 15, 'maptab').setScrollFactor(0);
    mapTab.depth = 6;
    mapTab.setInteractive();
    mapTab.on('pointerdown', function () {
      console.log('map tab was pressed');
      let tabDisplay = display.add.image(1440, 250, 'mapdisplay').setScrollFactor(0);
      tabDisplay.depth = 7
      //let mapTab.tint = 0x33FFE9;
    });
    //optionsTab
    let optionsTab = this.add.image(1587, 15, 'optionstab').setScrollFactor(0);
    optionsTab.depth = 6;
    optionsTab.setInteractive();
    optionsTab.on('pointerdown', function () {
      console.log('options tab was pressed');
      let tabDisplay = display.add.image(1440, 250, 'optionsdisplay').setScrollFactor(0);
      tabDisplay.depth = 7
      //let optionsTab.tint = 0x33FFE9;
    });
    //clothesButton
    let clothesButton = this.add.image(48, 903, 'numberbutton').setScrollFactor(0);
    clothesButton.depth = 6;
    clothesButton.setInteractive();
    clothesButton.on('pointerdown', function () {
      //let tabDisplay = this.add.image(81, 792, 'clothesavatar').setScrollFactor(0);
      clothesButton.tint = 0x0000FF;
    });
  }
});
export default ui;
