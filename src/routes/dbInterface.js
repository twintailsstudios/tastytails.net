//const router = require('express').Router();
const jwt = require('jsonwebtoken');
const verify = require('./verifyToken');
const User = require('../model/User');


// module.exports.dbInterface = {
//   charList: function() {
//     console.log('You have successfully called the dbInterface function!');
//     return "charList";
//     //const charList = [];
//   }
//
// };

const charList = async (data, next) => {
  console.log('You have successfully called the dbInterface function!');
  //console.log('data = ', data);
  const verified = jwt.verify(data, process.env.TOKEN_SECRET);
  //console.log('verified = ', verified._id);
  try {
    const user = await User.findOne({_id: verified._id});
    //const list = user.characters;
    //console.log('user.characters = ', user.characters)
    console.log(user.characters.length);
    for(i = 0; i < user.characters.length; i++) {

      for(e = 0; e < user.characters[i].voreTypes.length; e++) {
        console.log('user.characters', [i], '.voreTypes', [e], '.destination = ', user.characters[i].voreTypes[e].destination );
        delete user.characters[i].voreTypes[e]._id;
        console.log('user.characters[i].voreTypes[e]._id; = ', user.characters[i].voreTypes[e]._id);

      };
    };
    //console.log('user.characters = ', user.characters)
    return user.characters;
  } catch(err){
    console.log('charList err = ', err);
    //res.status(400).send(err);
  }
};


module.exports.charList = charList;
//module.exports = router;
