
var resize = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function resize() {
  ////active is set to false here, so it waits for a command to launch////
  Phaser.Scene.call(this, {key: 'resize', active: true});
  this.pic;
  },
update() {

function resize(width, height) {
  if (width === undefined) { width = this.sys.game.config.width }
  if (height === undefined) { height = this.sys.game.config.height }

  this.cameras.resize(width, height)
}
}
});
export default resize;
