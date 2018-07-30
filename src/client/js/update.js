import { game, socket } from './index.js'

export default function () {

  let entities = game.entities
  let characters = entities.characters
  let playerCharacter = entities.playerCharacter
  let key = game.key

  for (let i in characters) {
    let character = characters[i]
    character.update(this)
  }

  if (key.up.isDown || key.w.isDown) {
    let velocity = {y: -160}
    playerCharacter.updateVelocity(velocity)
    console.log("character moved up", velocity);
    socket.emit('update velocity', {id: socket.id, velocity})
  }

  if (key.down.isDown || key.s.isDown) {
    let velocity = {y: 160}
    playerCharacter.updateVelocity(velocity)
    console.log("character moved down", velocity);
    socket.emit('update velocity', {id: socket.id, velocity})
  }

  if (key.left.isDown || key.a.isDown) {
    let velocity = {x: -160}
    playerCharacter.updateVelocity(velocity)
    console.log("character moved left", velocity);
    socket.emit('update velocity', {id: socket.id, velocity})
  }

  if (key.right.isDown || key.d.isDown) {
    let velocity = {x: 160}
    playerCharacter.updateVelocity(velocity)
    console.log("character moved right", velocity);
    socket.emit('update velocity', {id: socket.id, velocity})
  }

}
