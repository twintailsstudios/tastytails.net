const router = require('express').Router();
const jwt = require('jsonwebtoken');
const verify = require('./verifyToken');
const index = require('./index');
const play = require('./play');
const User = require('../model/User');
const log = require('../logger');



// function log(data) {
//   log(fgCyan, data);
// }

log('dbInterfaceRoute is connected.');

//Get full Character List
const charList = async (data, next) => {
  log('You have successfully called the dbInterface.charList function!');
  log('data = ', data);
  const verified = jwt.verify(data, process.env.TOKEN_SECRET);
  log('verified = ', verified._id);
  try {
    // const user = await client("test").collection("chats").findOne({_id: verified._id});
    console.log('User = ', User);
    const user = await User.findOne({_id: verified._id});



    const list = user.characters;
    // log('user.characters = ', user.characters)
    var activeChars = [];
    log('user.characters.length = ', user.characters.length);
    for(i = 0; i < user.characters.length; i++) {
      for(e = 0; e < user.characters[i].voreTypes.length; e++) {
        //log('user.characters', [i], '.voreTypes', [e], '.destination = ', user.characters[i].voreTypes[e].destination );
        delete user.characters[i].voreTypes[e]._id;
        //log('user.characters[i].voreTypes[e]._id; = ', user.characters[i].voreTypes[e]._id);

      };
      if(user.characters[i].deleted == false) {
        activeChars.push(user.characters[i]);
      }
    };
    // log('user.characters = ', user.characters);
    return activeChars;
  } catch(err){
    log('charList err = ', err);
    //res.status(400).send(err);
  }
};




//Select a specific Character
const charSelect = async (token, charId, next) => {
  log('You have successfully called the dbInterface.charSelect function!');
  log('charId in the charSelect function = ', charId);
  const verified = jwt.verify(token, process.env.TOKEN_SECRET);
  var character = 'new';
  try {
    const user = await User.findOne({_id: verified._id});
    for(i = 0; i < user.characters.length; i++) {
      log(user.characters[i]._id);
      if (user.characters[i]._id == charId) {
        log('You selected charId#: ', user.characters[i]._id);
        character = user.characters[i];
      }
    };
    //log('charater in the charSelect function = ', character);
    return character;
  } catch(err){
    log('charSelect err = ', err);
  }
};




module.exports.charList = charList;
module.exports.charSelect = charSelect;
module.exports = router;
