const mongoose = require('mongoose');

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
        type: Number
      },
      icDescrip: {
        type: String
      },
      oocDescrip: {
        type: String
      },
      head: {
        sprite: {
          type: String
        },
        color: {
          type: String
        },
        secondarySprite: {
          type: String
        },
        secondaryColor: {
          type: String
        },
        accentSprite: {
          type: String
        },
        accentColor: {
          type: String
        }
      },
      headAccessories: {
        sprite: {
          type: String
        },
        color: {
          type: String
        }
      },
      bodyShape: {
        sprite: {
          type: String
        }
      },
      body: {
        sprite: {
          type: String
        },
        color: {
          type: String
        },
        secondarySprite: {
          type: String
        },
        secondaryColor: {
          type: String
        },
        accentSprite: {
          type: String
        },
        accentColor: {
          type: String
        }
      },
      hands: {
        sprite: {
          type: String
        },
        color: {
          type: String
        }
      },
      feet: {
        sprite: {
          type: String
        },
        color: {
          type: String
        }
      },
      tail: {
        sprite: {
          type: String
        },
        color: {
          type: String
        },
        secondarySprite: {
          type: String
        },
        secondaryColor: {
          type: String
        },
        accentSprite: {
          type: String
        },
        accentColor: {
          type: String
        }
      },
      eyes: {
        outer: {
          type: String
        },
        iris: {
          type: String
        },
        color: {
          type: String
        }
      },
      hair: {
        sprite: {
          type: String
        },
        color: {
          type: String
        }
      },
      ear: {
        outerSprite: {
          type: String
        },
        outerColor: {
          type: String
        },
        innerSprite: {
          type: String
        },
        innerColor: {
          type: String
        }
      },
      genitles:{
        sprite: {
          type: String
        },
        color: {
          type: String
        },
        secondarySprite: {
          type: String
        },
        secondaryColor: {
          type: String
        }
      },
      beak:{
        sprite: {
          type: String
        },
        color: {
          type: String
        }
      },
      ratings: {
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
          preyStar: {
            type: Number
          },
          softStar: {
            type: Number
          },
          hardStar: {
            type: Number
          },
          digestionStar: {
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
          gStar: {
            type: Number
          },
          sStar: {
            type: Number
          },
          iaoStar: {
            type: Number
          }
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
      },

      position: {
        x: {
          type: Number
        },
        y: {
          type: Number
        },
        time: {
          type: Date
        }
      },

      consumedBy: {
        type: String
      },

      rotation: {
        type: Number
      },

      isMoving: {
        type: Boolean
      },

      identifier:{
        type: String
      },

      input: {
        left: {
          type: Boolean
        },
        right: {
          type: Boolean
        },
        down: {
          type: Boolean
        },
        up: {
          type: Boolean
        }
      },

      deleted: {
        type: Boolean
      }
    }]
  }
});




module.exports = mongoose.model('User', userSchema);
