/**
 * @fileoverview Chat.js - Mongoose Model for TastyTails.net Chat Messages
 * 
 * @description
 * Defines the Mongoose schema (`chatSchema`) and model (`Chats`) for storing chat messages,
 * spatial game location snapshots, player visual profiles, emoji reactions, content warning
 * spoilers, and targeted audience visibility rules.
 * 
 * Triggered by:
 * - Real-Time Chat Engine (`MessageSystem.js` write-behind buffer flushes every 2s)
 * - Express REST API Chat Archives (`chatArchives.js`)
 * - Server Startup Initializer (`server-loop.js`, `index.js`)
 */

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
  // OPTIMIZATION: Retain array schema for client/server contract compatibility, but set {_id: false}
  // to suppress sub-document ObjectId generation overhead during bulk inserts.
  message: {
    type: [new mongoose.Schema({
      content: {
        type: String
      },
      time: {
        type: Date
      }
    }, { _id: false })],
    default: []
  },
  gameState: {
    speaker_context: { type: Object, default: {} },
    intendedListener_context: { type: Object, default: {} },
    location_context: {
      title: { type: String, default: 'Unknown' },
      zone: { type: String, default: null },
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
  senderProfile: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// OPTIMIZATION: Compound index for optimizing filtering by visibility and sorting by time
chatSchema.index({ visibleTo: 1, createdAt: -1 });

// OPTIMIZATION: Fallback index for time-only queries or public chats
chatSchema.index({ createdAt: -1 });

// OPTIMIZATION: Compound index for character-based historical chat archive lookups
chatSchema.index({ 'identifier.character': 1, createdAt: -1 });

// OPTIMIZATION: Compound index for spatial zone-based roleplay archive searches
chatSchema.index({ 'gameState.location_context.zone': 1, createdAt: -1 });

module.exports = mongoose.model('Chats', chatSchema);
