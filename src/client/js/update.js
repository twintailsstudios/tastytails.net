import { Game, socket } from './index.js'

var update = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function update() {
  ////active is set to false here, so it waits for a command to launch////
  Phaser.Scene.call(this, {key: 'update', active: false});
  this.pic;
  },
update() {
  //console.log(this.avatar);
  console.log(game.key);
  //console.log('Update Started');
  if (this.avatar) {
    console.log('this.avatar is true');
    if (this.cursors.left.isDown) {
      this.avatar.setVelocityX(-150);
      this.avatar.setVelocityY(0);
      console.log('Left arrow key pressed. this.avatar.VelocityX= ', this.avatar.VelocityX);
    }
    else if (this.cursors.right.isDown) {
      this.avatar.setVelocityX(150);
      this.avatar.setVelocityY(0);
      console.log('Right arrow key pressed. this.avatar.VelocityX= ', this.avatar.VelocityX);
    }
    else if (this.cursors.up.isDown) {
      this.avatar.setVelocityY(-150);
      this.avatar.setVelocityX(0);
      console.log('up arrow key pressed. this.avatar.VelocityX= ', this.avatar.VelocityY);
    }
    else if (this.cursors.down.isDown) {
      this.avatar.setVelocityY(150);
      this.avatar.setVelocityX(0);
      console.log('Down arrow key pressed. this.avatar.VelocityX= ', this.avatar.VelocityY);
    }
    else {
      this.avatar.setVelocity(0);
    }



    this.physics.world.wrap(this.avatar, 5);

    // emit player movement
    var x = this.avatar.x;
    var y = this.avatar.y;
    if (this.avatar.oldPosition && (x !== this.avatar.oldPosition.x || y !== this.avatar.oldPosition.y)) {
      this.socket.emit('playerMovement', { x: this.avatar.x, y: this.avatar.y });
    }
    // save old position data
    this.avatar.oldPosition = {
      x: this.avatar.x,
      y: this.avatar.y,
    };
  }

    /*let entities = game.entities
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
    console.log("What is playerCharacter?: ", playerCharacter);
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
  }*/
}
});
export default update;
