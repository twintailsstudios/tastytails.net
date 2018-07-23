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

game.entities = {
  characters: []
}

window.addEventListener('resize', function (event) {
  game.resize(window.innerWidth, window.innerHeight)
}, false)

export { game, socket }
