const mongoose = require('mongoose');

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
  }
});


module.exports = mongoose.model('User', userSchema);
