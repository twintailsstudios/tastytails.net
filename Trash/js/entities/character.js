
import { game } from '../index.js'
import Entity from './entity.js'
let character = null;
/*
class playerSprite {

  constructor(scene) {
    this.container = scene.add.container()
    //I think the green "playerHead" part should be using the names of sprites
    //pulled from preload.js like I'm doing on line 37 and 38?
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
    //this.sprite.fillStyle(0xFF2233)
    //this.sprite.fillRect(0, 0, 16, 16)
    //this is pulling the sprites listed in the preload.js file instead of a red square
    this.sprite.scene.physics.add.sprite(75, 75, 'dudeheadpurple');
    this.sprite.scene.physics.add.sprite(75, 75, 'dudebody');
    this.sprite.setPosition(position.x, position.y)
    this.sprite.container = scene.add.container()
    this.sprite.container.add([this.sprite])

    // this.sprite = new playerSprite(scene)
  }

  updatePosition (position) {
    this.position = position
    this.sprite.container.setPosition(position.x, position.y)
  }

  updateVelocity (velocity) {
    console.log("updateVelocity called successfully");
    //playerSprite.this.head = velocity;
    this.sprite.container.xSpeed = velocity.x || this.sprite.container.xSpeed
    this.sprite.container.ySpeed = velocity.y || this.sprite.container.ySpeed
  }

  update (scene) {

  }

}
*/
export default character;
