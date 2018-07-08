import { Vector } from 'vector2d'

export default class Character {

  constructor (position) {
    this.position = position
    this._velocity = new Vector(0, 0)
    this.velocityLimiter = new Vector(10, 10)
    this.skin = 'none'
  }

  set velocity (vector) {
    let limit = this.velocityLimiter
    this._veloctiy = new Vector(
      vector.abs().x < limit.x ? vector.abs().x : limit.x,
      vector.abs().y < limit.y ? vector.abs().y : limit.y)
  }

  get velocity () {
    return this._velocity
  }

  step () {
    this.position += this.velocity
  }

}
