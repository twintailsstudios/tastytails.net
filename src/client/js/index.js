import preload from './preload.js';
import create from './create.js';
//import ui from './ui.js';
//import update from './update.js';
//import resize from './resize.js';
//import character from './entities/character.js';


//let socket = io();
//console.log('js/index.js file socket connection = ', socket);
//this.socket = socket;



let config = {
  type: Phaser.AUTO,
  parent: 'phaser-example',
  width: 1921,//window.innerWidth,
  height: 1041,//window.innerHeight,
  parent: 'phaserApp',
  physics: {
    default: 'arcade',
		arcade: {
			debug: true
    }
  },
  scene: [
    preload,
    create,
    //ui,
    //update,
    //resize
  ]
};

let game = new Phaser.Game(config)

// Here we make an entities array, this is where our character objects will go.
// They get instantiated in the create.js
/*game.entities = {
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
*/
export { game }; //socket
