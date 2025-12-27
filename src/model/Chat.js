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
  scope: {
    type: String,
    enum: ['global', 'local'],
    default: 'global'
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
  gameState: {
    speaker_context: { type: Object, default: {} },
    intendedListener_context: { type: Object, default: {} },
    location_context: {
      title: { type: String, default: 'Unknown' },
      surrounding_tiles: { type: Array, default: [] }, // Or Object/Mixed if complex
      nearby_objects: { type: Array, default: [] }
    }
  },
  reactions: {
    heart: { type: [String], default: [] },
    blush: { type: [String], default: [] },
    laugh: { type: [String], default: [] },
    thumbsup: { type: [String], default: [] },
    thumbsdown: { type: [String], default: [] }
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
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for optimizing filtering by visibility and sorting by time
chatSchema.index({ visibleTo: 1, createdAt: -1 });
// Fallback index for time-only queries or public chats if optimizer prefers
chatSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Chats', chatSchema);
