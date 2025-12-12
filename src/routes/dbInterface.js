const router = require('express').Router();
const jwt = require('jsonwebtoken');
const verify = require('./verifyToken');
// Removed index and play to prevent circular dependency
const User = require('../model/User');
const log = require('../logger');



// function log(data) {
//   log(fgCyan, data);
// }

log.info('dbInterfaceRoute is connected.');

//Get full Character List
const charList = async (data, next) => {
  log.debug('You have successfully called the dbInterface.charList function!');
  log.debug('data = ', data);
  const verified = jwt.verify(data, process.env.TOKEN_SECRET);
  log.debug('verified = ', verified._id);
  try {
    // const user = await client("test").collection("chats").findOne({_id: verified._id});
    // console.log('User = ', User);
    const user = await User.findOne({ _id: verified._id });



    const list = user.characters;
    // log.debug('user.characters = ', user.characters)
    var activeChars = [];
    log.debug('user.characters.length = ', user.characters.length);
    for (i = 0; i < user.characters.length; i++) {
      for (e = 0; e < user.characters[i].voreTypes.length; e++) {
        //log.debug('user.characters', [i], '.voreTypes', [e], '.destination = ', user.characters[i].voreTypes[e].destination );
        delete user.characters[i].voreTypes[e]._id;
        //log.debug('user.characters[i].voreTypes[e]._id; = ', user.characters[i].voreTypes[e]._id);

      };
      if (user.characters[i].deleted == false) {
        activeChars.push(user.characters[i]);
      }
    };
    // log.debug('user.characters = ', user.characters);
    return activeChars;
  } catch (err) {
    log.error('charList err = ', err);
    return []; // Return empty array to prevent view crash
    //res.status(400).send(err);
  }
};




//Select a specific Character
const charSelect = async (token, charId, next) => {
  log.debug('You have successfully called the dbInterface.charSelect function!');
  log.debug('charId in the charSelect function = ', charId);
  const verified = jwt.verify(token, process.env.TOKEN_SECRET);
  var character = 'new';
  try {
    const user = await User.findOne({ _id: verified._id });
    for (i = 0; i < user.characters.length; i++) {

      if (user.characters[i]._id == charId) {
        log.debug('You selected charId#: ', user.characters[i]._id);
        character = user.characters[i];
      }
    };
    //log.debug('charater in the charSelect function = ', character);
    return character;
  } catch (err) {
    log.error('charSelect err = ', err);
    return null; // Return null so the view can handle it gracefully
  }
};




router.charList = charList;
router.charSelect = charSelect;
module.exports = router;
