import PlayerCharacter from './player-character'

export default class User {

  constructor (socketid) {
    this.socketid = socketid
    this.character = new PlayerCharacter(socketid)
  }

}
