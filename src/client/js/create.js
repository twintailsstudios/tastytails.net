import { game, socket } from './index.js'
import resize from './resize.js'
import Character from './entities/character.js'

// Up here we are importing the game object from ./index.js

export default function () {

  let scene = this
  let entities = game.entities
  let characters = entities.characters
  let playerCharacter = entities.playerCharacter

  game.key = {
    up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
    down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
    left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
    right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
    d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
  }

  entities.playerCharacter = new Character(socket.id, {x: 0, y: 0}, scene)

  console.log(game)

  socket.on('player join', (data) => {
    // When a player joins, a new instance of the class Character is created
    // It is then added to the game.entities.characters array
    // here it is references as just characters for easy use
    let character = new Character(data.id, data.position, scene)
    if (data.id === socket.id) {
      playerCharacter = character
    }
    characters[data.id] = character
  })

  socket.on('update position', (data) => {
    let character = characters[data.id]
    if (!!data.position) {
      character.updatePosition(data.position)
    }
  })

  socket.on('update velocity', (data) => {
    let character = characters[data.id]
    console.log('update velocity', data)
    if (!!data.velocity) {
      character.updateVelocity(data.velocity)
    }
  })

  this.events.on('resize', resize, this)

}
