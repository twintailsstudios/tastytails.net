
export default new Phaser.Class({

  Extends: Phaser.GameObjects.Image,

  initialize: function Character (scene) {
    this.skin = ''
    this.setSize(32, 32, true)
  },

  positionPing: function (position) {
    this.setPosition(position.x, position.y)
  },

  positionFeed: function (velocity) {
    this.xSpeed = velocity.x
    this.ySpeed = velocity.y
  },

  update: function (time, delta) {

  }

})
