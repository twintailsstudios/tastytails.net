
export default {

  _messages: [],

  add (message) {
    this._messages.push(message)
    console.log(message.author.socketid + ' said ' + message.content)
  }

}
