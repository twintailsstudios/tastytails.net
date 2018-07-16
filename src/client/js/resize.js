
export default function (width, height) {
  if (width === undefined) { width = this.sys.game.config.width }
  if (height === undefined) { height = this.sys.game.config.height }

  this.cameras.resize(width, height)
}
