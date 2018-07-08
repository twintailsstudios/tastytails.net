
export default class Message {

  constructor (author, mode, content) {
    this.timestamp = Date.now()
    this.author = author
    this.content = content
    this.mode = mode
  }

}
