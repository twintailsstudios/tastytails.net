
export default function () {
  // load assets
  // this.load.image('name', 'path')

  //This loads the tilesheet that the map uses to generate pictures
  this.load.image('spritesheet', 'assets/images/spritesheet.png');

  //This loads the map json file that says what coordinates have what pictures
  this.load.tilemapTiledJSON('level_2', 'assets/tilemaps/level2.json');
	//loads sprite files to be used for players
  //boot.load.spritesheet('emptyplayer', 'client/assets/spritesheets/emptyplayer.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dude', 'assets/spritesheets/dude.png', {frameWidth: 32, frameHeight: 48});
	//boot.load.spritesheet('dude2', 'client/assets/spritesheets/dude2.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudebody', 'assets/spritesheets/dudebody.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudeheadpurple', 'assets/spritesheets/dudeheadpurple.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudeheadgreen', 'assets/spritesheets/dudeheadgreen.png', {frameWidth: 32, frameHeight: 48});
	this.load.spritesheet('dudeheadblue', 'assets/spritesheets/dudeheadblue.png', {frameWidth: 32, frameHeight: 48});
}
