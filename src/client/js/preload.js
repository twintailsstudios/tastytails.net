
var preload = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function preload() {
  ////active is set to false here, so it waits for a command to launch
  Phaser.Scene.call(this, {key: 'preload', active: true});
  this.pic;
  },
preload() {
  // load assets
  // this.load.image('name', 'path')

  //This loads the tilesheet that the map uses to generate pictures
  console.log('Preload Started');
  let progressBar = this.add.graphics();
		let progressBarHolder = this.add.graphics();
		progressBarHolder.fillStyle(0x222222, 0.8);
		progressBarHolder.fillRect(335, 170, 320, 50);
		/* //This seems to tick through individual files, which isn't so useful.
		boot.load.on('fileprogress', function (file, value) {
			console.log("File progress event: ", file, ", ", value);
		}); */
		//This seems to capture a total ratio (between 0.0 and 1.0)
		this.load.on('progress', function (ratio) {
			progressBar.clear();
			progressBar.fillStyle(0xffffff, 1);
			progressBar.fillRect(345, 180, 300 * ratio, 30);
		});

		this.load.on('complete', function () {
			progressBar.destroy();
			progressBarHolder.destroy();
		});
  this.load.image('spritesheet', 'assets/images/spritesheet.png');
  this.load.image('scroll', 'assets/images/Scroll_01.png')
  this.load.image('scroll2', 'assets/images/Scroll_02.png')


  //This loads the map json file that says what coordinates have what pictures
  this.load.tilemapTiledJSON('level_2', 'assets/tilemaps/level2.json');
	//loads sprite files to be used for players
  this.load.spritesheet('emptyplayer', 'assets/spritesheets/emptyplayer.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dude', 'assets/spritesheets/dude.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('otherPlayer', 'assets/spritesheets/dude2.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudebody', 'assets/spritesheets/dudebody.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudeheadpurple', 'assets/spritesheets/dudeheadpurple.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudeheadgreen', 'assets/spritesheets/dudeheadgreen.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudeheadblue', 'assets/spritesheets/dudeheadblue.png', {frameWidth: 32, frameHeight: 48});
  this.load.spritesheet('testBody', 'assets/spritesheets/testBody.png', {frameWidth: 32, frameHeight: 96});
  this.load.spritesheet('testFur', 'assets/spritesheets/testFur.png', {frameWidth: 32, frameHeight: 96});
  this.load.spritesheet('testBody02', 'assets/spritesheets/testBody_02.png', {frameWidth: 32, frameHeight: 96});
  this.load.spritesheet('testFur02', 'assets/spritesheets/testFur_02.png', {frameWidth: 32, frameHeight: 96});
  this.load.spritesheet('WolfAnthroBase', 'assets/spritesheets/WolfAnthroBase.png', {frameWidth: 128, frameHeight: 136});

  //preloading menu assets
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

  //preloading character select asets
  this.load.image('loginbutton', 'assets/images/loginbutton.png');
  this.load.image('characterselect', 'assets/images/characterselect.png');
  this.load.image('headselectpurple', 'assets/images/headselectpurple.png');
  this.load.image('headselectgreen', 'assets/images/headselectgreen.png');
  this.load.image('headselectblue', 'assets/images/headselectblue.png');
},
create() {
this.scene.launch('create');
this.scene.launch('ui');
//this.scene.launch('update');
}
});
export default preload;
