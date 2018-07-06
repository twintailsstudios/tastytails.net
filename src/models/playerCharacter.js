import game from '../controllers/game'
import Character from './character'

export default class PlayerCharacter extends Character {

  constructor (id) {
    super(game.spawnPosition)
    this.id = id
  }

}
