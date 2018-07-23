import Entity from './entity.js'

export default class Character extends Entity {

  constructor (id, position, scene) {
    super(position)
    this.skin = ''
    this.updateId = id
    this.sprite = scene.add.graphics()
    this.sprite.fillStyle(0xFF2233)
    this.sprite.fillRect(0, 0, 16, 16)
    this.sprite.setPosition(position.x, position.y)
  }

  positionPing (position) {
    this.sprite.setPosition(position.x, position.y)
  }

  positionFeed (velocity) {
    this.sprite.xSpeed = velocity.x
    this.sprite.ySpeed = velocity.y
  }

  update () {

  }

}
