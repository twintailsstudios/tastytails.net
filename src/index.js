
const express = require('express');
const app = express();
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const {MongoClient} = require('mongoDB');
const ObjectId = require('mongodb').ObjectID;
const cookieParser = require('cookie-parser');
const jsdom = require('jsdom');
const newrelic = require('newrelic');
const Chats = require('./model/Chat');


const DatauriParser = require('datauri/parser');
const datauri = new DatauriParser();
const { JSDOM } = jsdom;

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.set('layout', 'layouts/layout');

//Import Routes
const authRoute = require('./routes/auth');
const dbInterfaceRoute = require('./routes/dbInterface');
const indexRoute = require('./routes/index');
const editRoute = require('./routes/edit');
const playRoute = require('./routes/play');

dotenv.config();

//connect to DB
console.log('DB_CONNECT = ', process.env.DB_CONNECT);
mongoose.connect(process.env.DB_CONNECT, { useNewUrlParser: true, useUnifiedTopology: true }, () => {
    console.log('connected');
    messageReceived();
  }, e => console.error(e)
)
const db = mongoose.connection
db.on('error', error => console.error(error))
db.once('open', () => console.log('Connected to DB'))
// console.log('db = ', db.collection('chats'));

async function messageReceived(){
  try{
    const chat = new Chats({name: 'Kyle'});
    await chat.save();
    console.log('Chat Saved');
    console.log(chat);
  } catch(err){
    console.log(err);
  }
}

io.on('connection', function (socket) {
  console.log('a user connected: ', socket.id);
  socket.on('join', (data)=>{
    socket.join(data.room);
    io.in(data.room).emit('message', `New User Joined ${data.room} root!`);
  });
  console.log('does this even work??');
});



// databasesList = db().admin().listDatabases();
// console.log("Databases:");
// databasesList.databases.forEach(db => console.log(` - ${db.name}`));

// main().catch(err => console.log(err));


// async function main() {
//   const uri = process.env.DB_CONNECT;
//   // const uri = "mongodb+srv://kimbunny:kipkit11254@tastytails-01.lruhd.gcp.mongodb.net/?retryWrites=true&w=majority";
//   const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
//   try {
//     // Connect to the MongoDB cluster
//     await client.connect();
//     console.log('client.db() = ', client.db());
//     console.log('Connected to DB');
//     // Make the appropriate DB calls
//     await listDatabases(client);
//     } catch (e) {
//       console.error(e);
//     };
// }
//
// async function listDatabases(client){
//   databasesList = await client.db().admin().listDatabases();
//   console.log("Databases:");
//   databasesList.databases.forEach(db => console.log(` - ${db.name}`));
// };

//Middlewares
app.use(express.json());
app.use(expressLayouts);
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser());

//Route Middlewares
app.use('/api/user', authRoute);
app.use('/api/dbInterface', dbInterfaceRoute);
app.use('/', indexRoute);
app.use('/edit', editRoute);
app.use('/play', playRoute);




const port = 3000

app.use('/', express.static(path.join(__dirname, 'client')))

const tilemap = require('./client/assets/tilemaps/level2.json');
//console.log(tilemap.layers);
let blockingLayer = {};
let spawningLayer = {};
let remainder = {};
let division = {};
let spawnLocation = [];

for (let i = 0; i < tilemap.layers.length; i++) {
  let layer = tilemap.layers[i];
  if (layer.name === 'blocked') {
    blockingLayer = layer;
  }
  if (layer.name === 'spawn') {
    spawningLayer = layer;
  }
}
for (let info = 0; info < spawningLayer.data.length; info++) {
  let spawnTile = spawningLayer.data[info];
  if (spawnTile > 0) {
    remainder = (Math.floor(Math.floor(info % 200) * 48));
    division = (Math.floor(Math.floor(Math.floor(info) / 200)) * 48);
    spawnLocation.push({ x: remainder + 24, y: division + 24 })
    //console.log('info = ', info, 'remainder = ', remainder, 'division = ', division, 'spawnTile = ', spawnTile);
  }
}
//console.log('spawnLocaiton: ', spawnLocation);
//console.log('blockingLayer: ', blockingLayer);






//http.listen(port, () => console.log('Listening on port', port, '!'))

function setupAuthoritativePhaser() {
  JSDOM.fromFile(path.join(__dirname, 'authoritative_server/index.html'), {
    // To run the scripts in the html file
    runScripts: "dangerously",
    // Also load supported external resources
    resources: "usable",
    // So requestAnimatinFrame events fire
    pretendToBeVisual: true
  }).then((dom) => {
    //----- The following code is meant to prevent a 'Uncought [TypeError: URL.createObjectURL is not a function]' error message from occuring -----//
    dom.window.URL.createObjectURL = (blob) => {
      if (blob){
        //console.log('blob = ', blob);
        return datauri.format(blob.type, blob[Object.getOwnPropertySymbols(blob)[0]]._buffer).content;
      }
    };
    dom.window.URL.revokeObjectURL = (objectURL) => {};

    //----- the following code ensures that phaser has completely loaded on the server before attempting to launch the server -----//
    dom.window.gameLoaded = () => {
      dom.window.io = io;
      //----- Launches the server using Port 3000 -----//
      http.listen(3000, function () {
        console.log(`Listening on ${http.address().port}`);
      });
    };
  }).catch((error) => {
    console.log(error.message);
  });
}

setupAuthoritativePhaser();
