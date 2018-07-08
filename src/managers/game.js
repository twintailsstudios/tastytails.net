import userManager from './user'
import chatManager from './chat'
import { Vector } from 'vector2d'

let vectorZero = new Vector(0, 0)

export default {

  spawnPosition: vectorZero,
  user: userManager,
  chat: chatManager,

  start () {

  },

  resume () {

  },

  close () {

  },

  end () {

  }

}
