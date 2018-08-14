import { game, socket } from './index.js'

var update = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function update() {
  ////active is set to false here, so it waits for a command to launch////
  Phaser.Scene.call(this, {key: 'update', active: false});
  this.pic;
  },
update() {

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
    console.log("request to change velocity: ", velocity);
    console.log("Actual playerCharacter velocity: ", playerCharacter.velocity);
    socket.emit('update velocity', {id: socket.id, velocity})
  }

  if (key.down.isDown || key.s.isDown) {
    let velocity = {y: 160}
    playerCharacter.updateVelocity(velocity)
    console.log("request to change velocity: ", velocity);
    console.log("Actual playerCharacter velocity: ", playerCharacter.velocity);
    socket.emit('update velocity', {id: socket.id, velocity})
  }

  if (key.left.isDown || key.a.isDown) {
    let velocity = {x: -160}
    playerCharacter.updateVelocity(velocity)
    console.log("request to change velocity: ", velocity);
    console.log("Actual playerCharacter velocity: ", playerCharacter.velocity);
    socket.emit('update velocity', {id: socket.id, velocity})
  }

  if (key.right.isDown || key.d.isDown) {
    let velocity = {x: 160}
    playerCharacter.updateVelocity(velocity)
    console.log("request to change velocity: ", velocity);
    console.log("Actual playerCharacter velocity: ", playerCharacter.velocity);
    socket.emit('update velocity', {id: socket.id, velocity})
  }
}
});
export default update;
