import { game } from '../index.js'
import Entity from './entity.js'

class playerSprite {

  constructor(scene) {
    this.container = scene.add.container()
    this.head = scene.physics.add.sprite(0, 0, 'playerHead');
    this.body = scene.physics.add.sprite(0, 0, 'playerBody');
    this.tail = scene.physics.add.sprite(0, 0, 'playerTail');
    this.container.add([ this.head, this.body, this.tail ])
    this.head.setSize(8, 8);
    this.head.setOffset(11, 40);
    this.head.setBounce(0.0);
    this.head.setCollideWorldBounds(false);
    this.body.setSize(8, 8);
    this.body.setOffset(11, 40);
    this.body.setBounce(0.0);
    this.body.setCollideWorldBounds(false);
  }

}

export default class Character extends Entity {

  constructor (id, position, scene) {
    super(position)
    this.skin = ''
    this.updateId = id

    this.sprite = scene.add.graphics()
    this.sprite.fillStyle(0xFF2233)
    this.sprite.fillRect(0, 0, 16, 16)
    this.sprite.setPosition(position.x, position.y)
    this.sprite.container = scene.add.container()
    this.sprite.container.add([this.sprite])
    /* */
    // this.sprite = new playerSprite(scene)
  }

  updatePosition (position) {
    this.position = position
    this.sprite.container.setPosition(position.x, position.y)
  }

  updateVelocity (velocity) {
    this.sprite.container.xSpeed = velocity.x || this.sprite.container.xSpeed
    this.sprite.container.ySpeed = velocity.y || this.sprite.container.ySpeed
  }

  update (scene) {

  }

}
