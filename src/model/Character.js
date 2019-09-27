const mongoose = require('mongoose');
const User = require('./User');
const Schema = mongoose.Schema;


const charSchema = new mongoose.Schema({
  firstName: {
    type: String
  }
});



module.exports = mongoose.model('Character', charSchema);
