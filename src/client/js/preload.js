
export default function () {
  // load assets
  // this.load.image('name', 'path')

  //This loads the tilesheet that the map uses to generate pictures
  console.log('Preload Started');
  this.load.image('spritesheet', 'assets/images/spritesheet.png');

  //This loads the map json file that says what coordinates have what pictures
  this.load.tilemapTiledJSON('level_2', 'assets/tilemaps/level2.json');
	//loads sprite files to be used for players
  //this.load.spritesheet('emptyplayer', 'assets/spritesheets/emptyplayer.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dude', 'assets/spritesheets/dude.png', {frameWidth: 32, frameHeight: 48});
	//this.load.spritesheet('dude2', 'assets/spritesheets/dude2.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudebody', 'assets/spritesheets/dudebody.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudeheadpurple', 'assets/spritesheets/dudeheadpurple.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudeheadgreen', 'assets/spritesheets/dudeheadgreen.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudeheadblue', 'assets/spritesheets/dudeheadblue.png', {frameWidth: 32, frameHeight: 48});

  //preloading menu assets////
this.load.image('menuframe', 'assets/images/menuframe.png', {frameWidth: 1921, frameHeight: 1041});
this.load.image('numberbutton', 'assets/images/numberbutton.png');
this.load.image('looktab', 'assets/images/looktab.png');
this.load.image('lookdisplay', 'assets/images/lookdisplay.png');
this.load.image('itemstab', 'assets/images/itemstab.png');
this.load.image('itemsdisplay', 'assets/images/itemsdisplay.png');
this.load.image('spellstab', 'assets/images/spellstab.png');
this.load.image('spellsdisplay', 'assets/images/spellsdisplay.png');
this.load.image('maptab', 'assets/images/maptab.png');
this.load.image('mapdisplay', 'assets/images/mapdisplay.png');
this.load.image('optionstab', 'assets/images/optionstab.png');
this.load.image('optionsdisplay', 'assets/images/optionsdisplay.png');
this.load.image('clothesavatar', 'assets/images/clothesavatar.png');
}
