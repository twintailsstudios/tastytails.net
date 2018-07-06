import PlayerCharacter from './playerCharacter'

export default class User {

  constructor (socketid) {
    this.socketid = socketid
    this.character = new PlayerCharacter(socketid)
  }

}
