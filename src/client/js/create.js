import { game } from './index.js'
import resize from './resize.js'

export default function () {
  // create graphics
  // this.add.image(width, height, 'name')
  /*
  let graphics = this.add.graphics(200, 200)
  // console.log(graphics)
  graphics.fillStyle(0xff2233)
  graphics.fillRect(0, 0, 500, 500)
  */

  this.events.on('resize', resize, this)

}
