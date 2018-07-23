import preload from './preload.js'
import create from './create.js'
import update from './update.js'
import resize from './resize.js'

let socket = io();

let config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  physics: {
    default: 'arcade'
  },
  scene: {
    preload: preload,
    create: create,
    update: update,
    resize: resize
  }
}

let game = new Phaser.Game(config)

// Here we make an entities array, this is where our character objects will go.
// They get instantiated in the create.js
game.entities = {
  characters: [],
  playerCharacter: null
}

game.state = {
  isChatting: false
}

game.key = {}

window.addEventListener('resize', function (event) {
  game.resize(window.innerWidth, window.innerHeight)
}, false)

export { game, socket }
