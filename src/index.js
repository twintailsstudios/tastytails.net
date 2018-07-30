require('babel-register')
const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const path = require('path')

const game = require('./managers/game').default

const PlayerCharacter = require('./entities/player-character').default
const Message = require('./entities/message').default

const port = 3000

app.use('/', express.static(path.join(__dirname, 'client')))

io.on('connection', socket => {
  console.log('user connected', socket.id)
  let user = game.user.add(socket.id)
  socket.broadcast.emit('player join', {id: socket.id, skin: user.character.skin, position: user.character.position})

  socket.on('message', (data) => {
    let author = game.user.all[socket.id]
    let type = (data.type === 'ooc' || data.type === 'rp' ? data.type : null)
    game.chat.add(new Message(author, data.type, data.content))
  })

  socket.on('update velocity', (data) => {
    if (!!data.velocity) {
      console.log('character moved! data.velocity = ', data.velocity);
      user.character.velocity = data.velocity
      socket.broadcast.emit('update velocity', {id: socket.id, velocity: data.velocity})
    }
  })

  socket.on('update position', (data) => {
    if (!!data.position) {
      // ...
    }
  })

  socket.on('disconnect', () => {
    io.emit('user disconnected')
    console.log('user disconnected', socket.id)
  })
})

http.listen(port, () => console.log('Listening on port 3000!'))
