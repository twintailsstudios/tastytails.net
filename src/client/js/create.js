import { game, socket } from './index.js'
import resize from './resize.js'
import Character from './entities/character.js'

export default function () {
  // create graphics
  // this.add.image(width, height, 'name')
  /*
  let graphics = this.add.graphics(200, 200)
  // console.log(graphics)
  graphics.fillStyle(0xff2233)
  graphics.fillRect(0, 0, 500, 500)
  */
  let scene = this
  let characters = game.entities.characters

  socket.on('player join', (data) => {
    let character = new Character(data.id, {x: 0, y: 0}, scene)
    characters[data.id] = character
  })

  socket.on('position ping', (data) => {
    let character = characters[data.id]
    if (!!data.position) {
      character.positionPing(data.position)
    }
  })

  socket.on('position feed', (data) => {
    let character = characters[data.id]
    if (!!data.velocity) {
      character.positionFeed(data.velocity)
    }
  })

  this.events.on('resize', resize, this)

}
