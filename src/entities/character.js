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
      Math.abs(vector.x) < limit.x ? Math.abs(vector.x) : limit.x,
      Math.abs(vector.y) < limit.y ? Math.abs(vector.y) : limit.y)
  }

  get velocity () {
    return this._velocity
  }

  step () {
    this.position += this.velocity
  }

}
