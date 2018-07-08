import Character from './character.js'

export default class PlayerCharacter extends Character {

  constructor (id, position) {
    this.id = id
    this.position = position
  }

  create (ctx) {
    // this.sprite = ctx.add.sprite(this.position.x, this.position.y, 'bun')
    this.sprite = ctx.add.graphics(this.position.x, this.position.y)
    this.sprite.beginFill(0xffaaee)
    this.sprite.drawRect(0, 0, 32, 32)
  }

}
