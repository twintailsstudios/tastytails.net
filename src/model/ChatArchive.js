const mongoose = require('mongoose');

const chatArchiveSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  characterId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  messageIds: {
    type: [String],
    default: []
  },
  savedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ChatArchive', chatArchiveSchema);
