import { game } from './index.js'

export default function () {
  // create graphics
  // this.add.image(width, height, 'name')
  console.log(game)
  console.log(this)
  let graphics = this.add.graphics(200, 200)
  console.log(graphics)
  graphics.defaultFillColor = 0xffaaee
  graphics.drawRect(0, 0, 500, 500)

  window.onresize = function (event) {
    let width = window.innerWidth
    let height = window.innerHeight
    game.width = width
    game.height = height
    game.stage.bounds.width = width
    game.stage.bounds.height = height
  }
}
