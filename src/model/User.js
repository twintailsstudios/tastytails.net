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
      },
      nickName: {
        type: String
      },
      speciesName: {
        type: String
      },
      pronouns: {
        type: String
      },
      icDescrip: {
        type: String
      },
      oocDescrip: {
        type: String
      },
      ovStar: {
        type: Number
      },
      avStar: {
        type: Number
      },
      cvStar: {
        type: Number
      },
      ubStar: {
        type: Number
      },
      tvStar: {
        type: Number
      },
      absStar: {
        type: Number
      },
      svStar: {
        type: Number
      },
      predStar: {
        type: Number
      },
      softStar: {
        type: Number
      },
      hardStar: {
        type: Number
      },
      digestoinStar: {
        type: Number
      },
      disposalStar: {
        type: Number
      },
      tfStar: {
        type: Number
      },
      btfStar: {
        type: Number
      },
      bsStar: {
        type: Number
      },
      gsStar: {
        type: Number
      },
      sStar: {
        type: Number
      },
      iaoStar: {
        type: Number
      },



      voreTypes: {
        type: [{
          destination: {
            type: String
          },
          verb: {
            type: String
          },
          digestionTimer: {
            type: Number
          },
          animation: {
            type: Number
          },
          destinationDescrip: {
            type: String
          },
          examineMsgDescrip: {
            type: String
          },
          struggleInsideMsgDescrip: {
            type: String
          },
          struggleOutsideMsgDescrip: {
            type: String
          },
          digestionInsideMsgDescrip: {
            type: String
          },
          digestionOutsideMsgDescrip: {
            type: String
          }
        }]
      },



      spellList: {
        type: [{

        }]
      }
    }]
  }
});




module.exports = mongoose.model('User', userSchema);
