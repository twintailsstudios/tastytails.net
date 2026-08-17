/**
 * @fileoverview User Model & Character Schema Definition
 * @module model/User
 * 
 * @description
 * Primary MongoDB object-data model (ODM) schema for TastyTails.net.
 * Serves as the Aggregate Root for user accounts, embedded character profiles,
 * sprite customization layers, vore organ graph configurations, and combat stats.
 * 
 * Triggered by:
 * - Authentication API routes (src/routes/auth.js)
 * - Database interface endpoints (src/routes/dbInterface.js)
 * - Game server tick loop & checkpointing (src/server-loop.js)
 * - Socket interaction & combat handlers (src/sockets/voreHandlers.js, src/classes/MessageSystem.js)
 */

const mongoose = require('mongoose');

const Schema = mongoose.Schema;

// OPTIMIZATION: Reusable sub-schemas with automatic `_id` creation disabled (`{ _id: false }`)
// to prevent BSON document size bloat and avoid generating unnecessary ObjectId instances for nested sprite layers.

/**
 * Basic two-property sprite sub-schema (sprite key + primary color hex)
 */
const simpleSpriteSchema = new Schema({
  sprite: { type: String },
  color: { type: String }
}, { _id: false });

/**
 * Three-tier sprite layer sub-schema (Primary, Secondary, and Accent sprites + colors)
 */
const spriteLayerSchema = new Schema({
  sprite: { type: String },
  color: { type: String },
  secondarySprite: { type: String },
  secondaryColor: { type: String },
  accentSprite: { type: String },
  accentColor: { type: String }
}, { _id: false });

/**
 * Ear sprite customization sub-schema (outer & inner layer sprites + colors)
 */
const earSpriteSchema = new Schema({
  outerSprite: { type: String },
  outerColor: { type: String },
  innerSprite: { type: String },
  innerColor: { type: String }
}, { _id: false });

/**
 * Genital sprite customization sub-schema
 */
const genitalsSpriteSchema = new Schema({
  sprite: { type: String },
  color: { type: String },
  secondarySprite: { type: String },
  secondaryColor: { type: String }
}, { _id: false });

/**
 * Eyes sprite customization sub-schema
 */
const eyesSpriteSchema = new Schema({
  outer: { type: String },
  iris: { type: String },
  color: { type: String }
}, { _id: false });

/**
 * Master User & Character Schema
 */
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    min: 6,
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
      firstName: { type: String },
      lastName: { type: String },
      nickName: { type: String },
      speciesName: { type: String },
      pronouns: { type: Number },
      icDescrip: { type: String },
      oocDescrip: { type: String },

      // Visual Customization Layers (Optimized via reusable sub-schemas)
      head: spriteLayerSchema,
      headAccessories: simpleSpriteSchema,
      bodyShape: { sprite: { type: String } },
      body: spriteLayerSchema,
      hands: simpleSpriteSchema,
      feet: simpleSpriteSchema,
      tail: spriteLayerSchema,
      eyes: eyesSpriteSchema,
      hair: simpleSpriteSchema,
      ear: earSpriteSchema,
      genitals: genitalsSpriteSchema,
      beak: simpleSpriteSchema,

      // Roleplay & Kink Preference Ratings (1-5 star numerical scale)
      ratings: {
        ovStar: { type: Number },
        avStar: { type: Number },
        cvStar: { type: Number },
        ubStar: { type: Number },
        tvStar: { type: Number },
        absStar: { type: Number },
        svStar: { type: Number },
        predStar: { type: Number },
        preyStar: { type: Number },
        softStar: { type: Number },
        hardStar: { type: Number },
        digestionStar: { type: Number },
        disposalStar: { type: Number },
        tfStar: { type: Number },
        btfStar: { type: Number },
        bsStar: { type: Number },
        gStar: { type: Number },
        sStar: { type: Number },
        iaoStar: { type: Number },
        shvStar: { type: Number },
        bvStar: { type: Number },
        pvStar: { type: Number },
        uvStar: { type: Number },
        sfStar: { type: Number },
        tatStar: { type: Number },
        wgStar: { type: Number },
        microStar: { type: Number },
        macroStar: { type: Number },
        pawStar: { type: Number },
        burpStar: { type: Number },
        fartStar: { type: Number },
        wsStar: { type: Number }
      },

      // Vore Engine Organ Graph Configuration
      voreTypes: {
        type: [{
          type: { type: String },
          destination: { type: String },
          verb: { type: String },
          digestivePower: { type: String, default: 'Normal' },
          animation: { type: Number },
          mode: { type: String },
          destinationDescrip: { type: String },
          examineMsgDescrip: { type: String },
          struggleInsideMsgDescrip: { type: String },
          struggleOutsideMsgDescrip: { type: String },
          digestionInsideMsgDescrip: { type: String },
          digestionOutsideMsgDescrip: { type: String },
          audioEntry: { type: String },
          audioAmbient: { type: String },
          audioStruggle: { type: String },
          audioExit: { type: String },
          isEntrance: { type: Boolean, default: false },
          graphNodeId: { type: String },
          contents: { type: [String], default: [] }
        }]
      },

      anatomyData: {
        type: String,
        default: ""
      },

      voiceProfile: {
        type: mongoose.Schema.Types.Mixed,
        default: null
      },

      // NOTE: Equipment uses Mixed type. Remember to call `user.markModified('characters')` when updating nested keys!
      equipment: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      },

      spellList: {
        type: [{
          id: { type: String },
          name: { type: String },
          level: { type: Number }
        }],
        default: []
      },

      position: {
        x: { type: Number },
        y: { type: Number },
        time: { type: Date }
      },

      consumedBy: { type: String },
      voreStage: { type: Number, default: 0 },
      currentVoreNodeId: { type: String, default: null },
      rotation: { type: Number },
      isMoving: { type: Boolean },
      identifier: { type: String },

      input: {
        left: { type: Boolean },
        right: { type: Boolean },
        down: { type: Boolean },
        up: { type: Boolean }
      },

      deleted: { type: Boolean },

      stats: {
        health: { type: Number, default: 100 },
        maxHealth: { type: Number, default: 100 },
        stamina: { type: Number, default: 100 },
        maxStamina: { type: Number, default: 100 },
        mana: { type: Number, default: 100 },
        maxMana: { type: Number, default: 100 }
      },

      isDead: {
        type: Boolean,
        default: false
      },

      // Ghost/Spirit form sprite configuration (Mirrors living sprite layer structure)
      spiritSprite: {
        head: spriteLayerSchema,
        body: spriteLayerSchema,
        hands: simpleSpriteSchema,
        feet: simpleSpriteSchema,
        tail: spriteLayerSchema,
        eyes: eyesSpriteSchema,
        hair: simpleSpriteSchema,
        ear: earSpriteSchema,
        genitals: genitalsSpriteSchema,
        beak: simpleSpriteSchema
      }
    }]
  }
});

// OPTIMIZATION: Compound index on embedded character IDs allows instant O(1) lookups across all user accounts
userSchema.index({ 'characters._id': 1 });

module.exports = mongoose.model('User', userSchema);
