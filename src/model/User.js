const mongoose = require('mongoose');
const Character = require('./Character');
const Schema = mongoose.Schema;

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    min:6,
    max: 255
  },
  password: {
    type: String,
    required: true,
    min: 6,
    max: 1024
  },
  birthday: {
    type: Date,
    required: true

  },
  date: {
    type: Date,
    default: Date.now
  },

  characters: {
    type: [{
      firstName: {
        type: String
      },
      lastName: {
        type: String
      }
    }]
  }
  // characters: {
  //   type: Schema.ObjectId,
  //   ref: 'Character'
  //
  //   // type: [Character],
  //   // default: undefined
  // }
});




module.exports = mongoose.model('User', userSchema);
