
export default class Entity {

  constructor (position) {
    this.position = position
  }

  update (context) {
    throw 'You must implement an update method!'
  }

}
