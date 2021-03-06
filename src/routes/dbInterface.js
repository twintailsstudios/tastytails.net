//const router = require('express').Router();
const jwt = require('jsonwebtoken');
const verify = require('./verifyToken');
const User = require('../model/User');

//Get full Character List
const charList = async (data, next) => {
  console.log('You have successfully called the dbInterface.charList function!');
  //console.log('data = ', data);
  const verified = jwt.verify(data, process.env.TOKEN_SECRET);
  //console.log('verified = ', verified._id);
  try {
    const user = await User.findOne({_id: verified._id});
    //const list = user.characters;
    //console.log('user.characters = ', user.characters)
    //console.log(user.characters.length);
    // for(i = 0; i < user.characters.length; i++) {
    //
    //   for(e = 0; e < user.characters[i].voreTypes.length; e++) {
    //     //console.log('user.characters', [i], '.voreTypes', [e], '.destination = ', user.characters[i].voreTypes[e].destination );
    //     delete user.characters[i].voreTypes[e]._id;
    //     //console.log('user.characters[i].voreTypes[e]._id; = ', user.characters[i].voreTypes[e]._id);
    //
    //   };
    // };
    //console.log('user.characters = ', user.characters)
    return user.characters;
  } catch(err){
    console.log('charList err = ', err);
    //res.status(400).send(err);
  }
};




//Select a specific Character
const charSelect = async (token, charId, next) => {
  console.log('You have successfully called the dbInterface.charSelect function!');
  //console.log('charId in the charSelect function = ', charId);
  const verified = jwt.verify(token, process.env.TOKEN_SECRET);
  var character = 'new';
  try {
    const user = await User.findOne({_id: verified._id});
    for(i = 0; i < user.characters.length; i++) {
      //console.log(user.characters[i]._id);
      if (user.characters[i]._id == charId) {
        //console.log('You selected charId#: ', user.characters[i]._id);
        character = user.characters[i];
      }
    };
    //console.log('charater in the charSelect function = ', character);
    return character;
  } catch(err){
    console.log('charSelect err = ', err);
  }
};




module.exports.charList = charList;
module.exports.charSelect = charSelect;
//module.exports = router;
