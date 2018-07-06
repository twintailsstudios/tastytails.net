require('babel-register')
const express = require('express')
const app = express()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const path = require('path')

const game = require('./controllers/game')

const PlayerCharacter = require('./models/playerCharacter')
const Message = require('./models/message')

const port = 3000

app.use('/', express.static(path.join(__dirname, 'client')))

io.on('connection', socket => {
  console.log('user connected', socket.id)
  game.user.add(socket.id)

  socket.on('message', (data) => {
    let author = game.user.all[socket.id]
    game.chat.add(new Message(author, 'ooc', data.content))
  })

  socket.on('position move', (data) => {

  })

  socket.on('position ping', (data) => {
    
  })

  socket.on('disconnect', () => {
    io.emit('user disconnected')
    console.log('user disconnected', socket.id)
  })
})

http.listen(port, () => console.log('Listening on port 3000!'))
