const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const chatSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    min: 1,
    max: 255
  },
  type: {
    type: String,
    enum: ['Default', 'Say', 'Unique', 'Environmental', 'Interactional', 'OOC'],
    default: 'Default'
  },
  visibleTo: {
    type: [String], // Array of Character IDs. If empty, visible to all.
    default: []
  },
  excludedPlayers: {
    type: [String], // Array of Character IDs to exclude.
    default: []
  },
  message: {
    type: [{
      content: {
        type: String
      },
      time: {
        type: Date
      }
    }]
  },
  spoiler: {
    status: {
      type: String
    },
    votes: {
      watersports: {
        type: Number
      },
      disposal: {
        type: Number
      },
      gore: {
        type: Number
      }
    }
  },
  deleted: {
    status: {
      type: String
    },
    deletionTime: {
      type: Date
    }
  },
  identifier: {
    account: {
      type: String
    },
    character: {
      type: String
    }
  }
});




module.exports = mongoose.model('Chats', chatSchema);
