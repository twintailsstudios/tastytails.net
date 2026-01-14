const router = require('express').Router();
const User = require('../model/User');
//const Character = require('../model/Character');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { registerValidation, loginValidation, charCreateValidation, voreTypeValidation, ratingsValidation } = require('../validation');
const log = require('../logger');
const DatabaseResilience = require('../classes/DatabaseResilience');




//Registering new users
router.post('/register', async (req, res) => {
  try {
    //Lets Validate the Data Before Adding a User
    const { error } = registerValidation(req.body);
    if (error) return res.status(405).send(error.details[0].message);

    //Checking if the user is already in the database
    const emailExist = await User.findOne({ email: req.body.email });
    if (emailExist) return res.status(401).send('Email already exists');

    //Hash the passwords
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    //Create a new user
    const user = new User({
      email: req.body.email,
      password: hashedPassword,
      birthday: req.body.birthday
    });
    const savedUser = await DatabaseResilience.save(user);
    //res.send({ user: user._id });
    res.redirect('/registered');
  } catch (err) {
    log.error('Error in /register:', err);
    res.status(400).send(err);
  }
});

//User Login Request
router.post('/login', async (req, res) => {
  try {
    //Lets Validate the Data Before Allowing the User to Login
    const { error } = loginValidation(req.body);
    if (error) return res.status(402).send(error.details[0].message);
    //Checking if the email exists
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(403).send('Email or password is incorrect (bad email)');
    //Check if password is correct
    const validPass = await bcrypt.compare(req.body.password, user.password);
    if (!validPass) return res.status(404).send('Email or password is incorrect (bad password)');

    //Create and Assign a Token
    const token = jwt.sign({ _id: user._id }, process.env.TOKEN_SECRET);
    //Redirect user to home page and send token to response header
    res.cookie('TastyTails', token, {
      expiresIn: "7d"
    }), {
      httpOnly: true
    }
    res.set('token', token).redirect('/');
  } catch (err) {
    log.error('Error in /login:', err);
    res.status(400).send(err.message);
  }
})

//User Logout Request
router.post('/logout', async (req, res) => {
  res.clearCookie('TastyTails').redirect('/');
})

//Bring Up Login/Registration Forms
router.post('/loginForm', async (req, res) => {
  res.redirect('/loginForm');
})

//Close Login/Registation Forms
router.post('/closereg', async (req, res) => {
  res.redirect('/');
})

//Going to Character-Bank
router.post('/character-bank', async (req, res) => {
  try {
    const token = req.cookies.TastyTails;
    let userId = token; // Fallback
    // Decode token if it looks like one
    if (token && token.split('.').length === 3) {
      try {
        const verified = jwt.verify(token, process.env.TOKEN_SECRET);
        userId = verified._id;
      } catch (e) { log.warn('Invalid token in bank check'); }
    }

    const user = await User.findOne({ _id: userId });
    if (!user) return res.redirect('/'); // Handle not found

    const charList = user.characters;
    log.debug('user.characters = ', user.characters)
    res.redirect('/character-bank');
  } catch (err) {
    log.error('Error in /character-bank:', err);
    res.redirect('/');
  }
})

//Create a new Character
router.post('/createcharacter', async (req, res) => {
  try {
    //Lets make sure the character sheet was properly filled out
    //log('req.body = ', req.body);
    var ratings = {
      ovStar: req.body.ovStar ? req.body.ovStar : null,
      avStar: req.body.avStar ? req.body.avStar : null,
      cvStar: req.body.cvStar ? req.body.cvStar : null,
      ubStar: req.body.ubStar ? req.body.ubStar : null,
      tvStar: req.body.tvStar ? req.body.tvStar : null,
      absStar: req.body.absStar ? req.body.absStar : null,
      svStar: req.body.svStar ? req.body.svStar : null,
      predStar: req.body.predStar ? req.body.predStar : null,
      preyStar: req.body.preyStar ? req.body.preyStar : null,
      softStar: req.body.softStar ? req.body.softStar : null,
      hardStar: req.body.hardStar ? req.body.hardStar : null,
      digestionStar: req.body.digestionStar ? req.body.digestionStar : null,
      disposalStar: req.body.disposalStar ? req.body.disposalStar : null,
      tfStar: req.body.tfStar ? req.body.tfStar : null,
      btfStar: req.body.btfStar ? req.body.btfStar : null,
      bsStar: req.body.bsStar ? req.body.bsStar : null,
      gStar: req.body.gStar ? req.body.gStar : null,
      sStar: req.body.sStar ? req.body.sStar : null,
      iaoStar: req.body.iaoStar ? req.body.iaoStar : null
    };
    const { error3 } = ratingsValidation(ratings);
    if (error3) return res.status(405).send(error3.details[0].message);

    // log('ratings = ', ratings);

    var voreTypes = [];

    // NEW: Priority - Parse from anatomyData if available (Preserves graphNodeId)
    if (req.body.anatomyData && req.body.anatomyData.length > 2) {
      try {
        const graph = JSON.parse(req.body.anatomyData);
        if (graph.nodes) {
          voreTypes = graph.nodes
            .filter(node => node.type === 'destination')
            .map(node => ({
              id: node.id,
              // CRITICAL: This allows server to match nodes by string ID
              graphNodeId: String(node.id),
              destination: node.properties.name || 'Unknown',
              verb: node.properties.verb || 'eats',
              type: node.type,
              digestionTimer: node.properties.digestionTimer,
              destinationDescrip: node.properties.destinationDescrip,
              examineMsgDescrip: node.properties.examineMsgDescrip,
              struggleInsideMsgDescrip: node.properties.struggleInsideMsgDescrip,
              struggleOutsideMsgDescrip: node.properties.struggleOutsideMsgDescrip,
              digestionInsideMsgDescrip: node.properties.digestionInsideMsgDescrip,
              digestionOutsideMsgDescrip: node.properties.digestionOutsideMsgDescrip,
              audioEntry: node.properties.enterSound || 'none',
              audioAmbient: node.properties.ambientSound || 'none',
              audioStruggle: node.properties.struggleSound || 'none',
              audioExit: node.properties.exitSound || 'none',
              contents: []
            }));
          // log.debug(`[Auth] Parsed ${voreTypes.length} vore types from anatomyData`);
        }
      } catch (e) {
        log.warn("Failed to parse anatomyData during char create");
      }
    }

    // Fallback / Legacy Support
    if (voreTypes.length === 0 && req.body.destination && Array.isArray(req.body.destination)) {
      for (i = 0; i < req.body.destination.length; i++) {
        //log('req.body.destination[i] = ', req.body.destination[i]);
        var voreType = {
          id: i,
          destination: req.body.destination[i],
          verb: req.body.verb[i],
          digestionTimer: req.body.digestionTimer[i],
          animation: req.body.animation[i],
          destinationDescrip: req.body.destinationDescrip[i],
          examineMsgDescrip: req.body.examineMsgDescrip[i],
          struggleInsideMsgDescrip: req.body.struggleInsideMsgDescrip[i],
          struggleOutsideMsgDescrip: req.body.struggleOutsideMsgDescrip[i],
          digestionInsideMsgDescrip: req.body.digestionInsideMsgDescrip[i],
          digestionOutsideMsgDescrip: req.body.digestionOutsideMsgDescrip[i]
        }
        voreTypes.push(voreType);
        const { error1 } = voreTypeValidation(voreType);
        if (error1) return res.status(405).send(error1.details[0].message);
      };
    } else {
      // Handle single vore type if not array or empty? Use fallback logic or assume empty.
      // For robustness, I'll log warning if expected. But let's assume valid array expected if destination exists.
      // Actually the original code just looped. If dest is undefined, it crashes.
      // The check I added `if (req.body.destination && Array.isArray` prevents crash.
    }

    var head = {
      sprite: req.body.head,
      color: req.body.primaryHeadColor ? req.body.primaryHeadColor.replace("#", "0x") : '0xffffff',
      secondarySprite: req.body.headSecondaryFur,
      secondaryColor: req.body.secondaryHeadColor ? req.body.secondaryHeadColor.replace("#", "0x") : '0xffffff',
      accentSprite: req.body.headAccentFur,
      accentColor: req.body.accentHeadColor ? req.body.accentHeadColor.replace("#", "0x") : '0xffffff'
    }
    //log('head = ', head);
    var headAccessories = {
      sprite: req.body.headAccessories,
      color: req.body.headAccessoriesColor ? req.body.headAccessoriesColor.replace("#", "0x") : '0xffffff'
    }
    // log('headAccessories = ', headAccessories);
    var bodyShape = {
      sprite: req.body.bodyShape
    }
    // log('bodyShape = ', bodyShape);
    var body = {
      sprite: req.body.mainBodyType,
      color: req.body.bodyColor ? req.body.bodyColor.replace("#", "0x") : '0xffffff',
      secondarySprite: req.body.bodySecondaryFur,
      secondaryColor: req.body.secondaryBodyColor ? req.body.secondaryBodyColor.replace("#", "0x") : '0xffffff',
      accentSprite: req.body.bodyAccentFur,
      accentColor: req.body.accentBodyColor ? req.body.accentBodyColor.replace("#", "0x") : '0xffffff'
    }
    var tail = {
      sprite: req.body.tail,
      color: req.body.tailColor ? req.body.tailColor.replace("#", "0x") : '0xffffff',
      secondarySprite: req.body.tailSecondaryFur,
      secondaryColor: req.body.secondaryTailColor ? req.body.secondaryTailColor.replace("#", "0x") : '0xffffff',
      accentSprite: req.body.tailAccentFur,
      accentColor: req.body.accentTailColor ? req.body.accentTailColor.replace("#", "0x") : '0xffffff'
    }
    var eyes = {
      outer: req.body.eyesOuter,
      iris: req.body.eyesIris,
      color: req.body.eyesColor ? req.body.eyesColor.replace("#", "0x") : '0xffffff'
    }
    var hair = {
      sprite: req.body.hair,
      color: req.body.hairColor ? req.body.hairColor.replace("#", "0x") : '0xffffff'
    }
    var ear = {
      outerSprite: req.body.outerEar,
      outerColor: req.body.outerEarColor ? req.body.outerEarColor.replace("#", "0x") : '0xffffff',
      innerSprite: req.body.innerEar,
      innerColor: req.body.innerEarColor ? req.body.innerEarColor.replace("#", "0x") : '0xffffff'
    }
    // log('ear =', ear);
    var genitles = {
      sprite: req.body.genitles,
      secondarySprite: 'empty'
    }
    var hands = {
      sprite: req.body.handsFur,
      color: req.body.handsColor
    }
    var feet = {
      sprite: req.body.feetFur,
      color: req.body.feetColor
    }
    var beak = {
      sprite: req.body.beakSprite,
      color: req.body.beakHex
    }
    var position = {
      x: 3795,
      y: 3728,
      time: null
    }
    var input = {
      left: false,
      right: false,
      down: true,
      up: false
    }
    // log('beak = ', beak);

    const { error2 } = charCreateValidation(req.body);
    if (error2) return res.status(405).send(error2.details[0].message);

    //Create a new Character
    const token = req.cookies.TastyTails;
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    //log('verified = ', verified._id);
    log.debug('token = ', token);

    // Clean logs
    // log('req = ', req.rawHeaders[33]);
    // log('verified._id = ', verified._id);
    // log('characterId = ', characterId);

    const updateChar = await DatabaseResilience.updateOne(User, { _id: verified._id }, {
      $push: {
        "characters": {
          "firstName": req.body.firstName,
          "lastName": req.body.lastName,
          "nickName": req.body.nickName,
          "speciesName": req.body.speciesName,
          "pronouns": req.body.pronouns,
          "icDescrip": req.body.icDescrip,
          "oocDescrip": req.body.oocDescrip,
          "ratings": ratings,
          "voreTypes": voreTypes,
          "head": head,
          "headAccessories": headAccessories,
          "body": body,
          "bodyShape": bodyShape,
          "tail": tail,
          "eyes": eyes,
          "hair": hair,
          "ear": ear,
          "genitles": genitles,
          "hands": hands,
          "feet": feet,
          "beak": beak,
          "position": position,
          "consumedBy": null,
          "rotation": 0,
          "isMoving": false,
          "input": input,
          "itentifier": "player",

          "deleted": false,
          "anatomyData": req.body.anatomyData || ""
        }
      }
    });
    log.debug('updateChar = ', updateChar);

    res.redirect('/character-bank');
  } catch (err) {
    log.error('Error in /createcharacter:', err);
    res.status(400).send(err);
  }
})

router.post('/editcharacter', async (req, res) => {
  try {
    //Lets make sure the character sheet was properly filled out
    var ratings = {
      ovStar: req.body.ovStar ? req.body.ovStar : null,
      avStar: req.body.avStar ? req.body.avStar : null,
      cvStar: req.body.cvStar ? req.body.cvStar : null,
      ubStar: req.body.ubStar ? req.body.ubStar : null,
      tvStar: req.body.tvStar ? req.body.tvStar : null,
      absStar: req.body.absStar ? req.body.absStar : null,
      svStar: req.body.svStar ? req.body.svStar : null,
      predStar: req.body.predStar ? req.body.predStar : null,
      preyStar: req.body.preyStar ? req.body.preyStar : null,
      softStar: req.body.softStar ? req.body.softStar : null,
      hardStar: req.body.hardStar ? req.body.hardStar : null,
      digestionStar: req.body.digestionStar ? req.body.digestionStar : null,
      disposalStar: req.body.disposalStar ? req.body.disposalStar : null,
      tfStar: req.body.tfStar ? req.body.tfStar : null,
      btfStar: req.body.btfStar ? req.body.btfStar : null,
      bsStar: req.body.bsStar ? req.body.bsStar : null,
      gStar: req.body.gStar ? req.body.gStar : null,
      sStar: req.body.sStar ? req.body.sStar : null,
      iaoStar: req.body.iaoStar ? req.body.iaoStar : null
    };
    const { error3 } = ratingsValidation(ratings);
    if (error3) return res.status(405).send(error3.details[0].message);

    // log('ratings = ', ratings);

    var voreTypes = [];

    // NEW: Priority - Parse from anatomyData if available (Preserves graphNodeId)
    if (req.body.anatomyData && req.body.anatomyData.length > 2) {
      try {
        const graph = JSON.parse(req.body.anatomyData);
        if (graph.nodes) {
          voreTypes = graph.nodes
            .filter(node => node.type === 'destination')
            .map(node => ({
              id: node.id,
              graphNodeId: String(node.id),
              destination: node.properties.name || 'Unknown',
              verb: node.properties.verb || 'eats',
              type: node.type,
              digestionTimer: node.properties.digestionTimer,
              destinationDescrip: node.properties.destinationDescrip,
              examineMsgDescrip: node.properties.examineMsgDescrip,
              struggleInsideMsgDescrip: node.properties.struggleInsideMsgDescrip,
              struggleOutsideMsgDescrip: node.properties.struggleOutsideMsgDescrip,
              digestionInsideMsgDescrip: node.properties.digestionInsideMsgDescrip,
              digestionOutsideMsgDescrip: node.properties.digestionOutsideMsgDescrip,
              audioEntry: node.properties.enterSound || 'none',
              audioAmbient: node.properties.ambientSound || 'none',
              audioStruggle: node.properties.struggleSound || 'none',
              audioExit: node.properties.exitSound || 'none',
              contents: []
            }));
        }
      } catch (e) {
        log.warn("Failed to parse anatomyData during char edit");
      }
    }

    // Fallback / Legacy Support
    if (voreTypes.length === 0 && req.body.destination && Array.isArray(req.body.destination)) {
      for (i = 0; i < req.body.destination.length; i++) {
        //log('req.body.destination[i] = ', req.body.destination[i]);
        var voreType = {
          id: i,
          destination: req.body.destination[i],
          verb: req.body.verb[i],
          digestionTimer: req.body.digestionTimer[i],
          animation: req.body.animation[i],
          destinationDescrip: req.body.destinationDescrip[i],
          examineMsgDescrip: req.body.examineMsgDescrip[i],
          struggleInsideMsgDescrip: req.body.struggleInsideMsgDescrip[i],
          struggleOutsideMsgDescrip: req.body.struggleOutsideMsgDescrip[i],
          digestionInsideMsgDescrip: req.body.digestionInsideMsgDescrip[i],
          digestionOutsideMsgDescrip: req.body.digestionOutsideMsgDescrip[i]
        }
        voreTypes.push(voreType);
        const { error1 } = voreTypeValidation(voreType);
        if (error1) return res.status(405).send(error1.details[0].message);
      };
    }

    var head = {
      sprite: req.body.head,
      color: req.body.primaryHeadColor ? req.body.primaryHeadColor.replace("#", "0x") : '0xffffff',
      secondarySprite: req.body.headSecondaryFur,
      secondaryColor: req.body.secondaryHeadColor ? req.body.secondaryHeadColor.replace("#", "0x") : '0xffffff',
      accentSprite: req.body.headAccentFur,
      accentColor: req.body.accentHeadColor ? req.body.accentHeadColor.replace("#", "0x") : '0xffffff'
    }
    //log('head = ', head);
    var headAccessories = {
      sprite: req.body.headAccessories,
      color: req.body.headAccessoriesColor ? req.body.headAccessoriesColor.replace("#", "0x") : '0xffffff'
    }
    // log('headAccessories = ', headAccessories);
    var bodyShape = {
      sprite: req.body.bodyShape
    }
    // log('bodyShape = ', bodyShape);
    var body = {
      sprite: req.body.mainBodyType,
      color: req.body.bodyColor ? req.body.bodyColor.replace("#", "0x") : '0xffffff',
      secondarySprite: req.body.bodySecondaryFur,
      secondaryColor: req.body.secondaryBodyColor ? req.body.secondaryBodyColor.replace("#", "0x") : '0xffffff',
      accentSprite: req.body.bodyAccentFur,
      accentColor: req.body.accentBodyColor ? req.body.accentBodyColor.replace("#", "0x") : '0xffffff'
    }
    var tail = {
      sprite: req.body.tail,
      color: req.body.tailColor ? req.body.tailColor.replace("#", "0x") : '0xffffff',
      secondarySprite: req.body.tailSecondaryFur,
      secondaryColor: req.body.secondaryTailColor ? req.body.secondaryTailColor.replace("#", "0x") : '0xffffff',
      accentSprite: req.body.tailAccentFur,
      accentColor: req.body.accentTailColor ? req.body.accentTailColor.replace("#", "0x") : '0xffffff'
    }
    var eyes = {
      outer: req.body.eyesOuter,
      iris: req.body.eyesIris,
      color: req.body.eyesColor ? req.body.eyesColor.replace("#", "0x") : '0xffffff'
    }
    var hair = {
      sprite: req.body.hair,
      color: req.body.hairColor ? req.body.hairColor.replace("#", "0x") : '0xffffff'
    }
    var ear = {
      outerSprite: req.body.outerEar,
      outerColor: req.body.outerEarColor ? req.body.outerEarColor.replace("#", "0x") : '0xffffff',
      innerSprite: req.body.innerEar,
      innerColor: req.body.innerEarColor ? req.body.innerEarColor.replace("#", "0x") : '0xffffff'
    }
    // log('ear =', ear);
    var genitles = {
      sprite: req.body.genitles,
      secondarySprite: 'empty'
    }
    var hands = {
      sprite: req.body.handsFur,
      color: req.body.handsColor
    }
    var feet = {
      sprite: req.body.feetFur,
      color: req.body.feetColor
    }
    var beak = {
      sprite: req.body.beakSprite,
      color: req.body.beakHex
    }

    const { error2 } = charCreateValidation(req.body);
    if (error2) return res.status(405).send(error2.details[0].message);

    //Push changes to existing Character
    const token = req.cookies.TastyTails;
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    //log('verified = ', verified._id);
    log.debug('token = ', token);

    // Safety check for character ID extraction
    let characterId = req.body.charId;

    if (!characterId && req.headers.referer) {
      // Fallback: Try to parse from Referer (e.g. .../edit/ID)
      // This is less reliable but kept as backup for legacy calls
      try {
        const parts = req.headers.referer.split('/');
        const potentialId = parts.pop();
        // Simple check if it looks like a Mongo ID (24 hex chars) to avoid "gzip" etc.
        if (/^[0-9a-fA-F]{24}$/.test(potentialId)) {
          characterId = potentialId;
        }
      } catch (e) {
        log.warn('Failed to parse character ID from Referer');
      }
    }

    // log('req = ', req.rawHeaders[33]);
    // log('verified._id = ', verified._id);
    // log('characterId = ', characterId);

    const updateChar = await DatabaseResilience.findOneAndUpdate(User, { _id: verified._id, "characters._id": characterId }, {
      $set: {
        "characters.$.firstName": req.body.firstName,
        "characters.$.lastName": req.body.lastName,
        "characters.$.nickName": req.body.nickName,
        "characters.$.speciesName": req.body.speciesName,
        "characters.$.pronouns": req.body.pronouns,
        "characters.$.icDescrip": req.body.icDescrip,
        "characters.$.oocDescrip": req.body.oocDescrip,
        "characters.$.ratings": ratings,
        "characters.$.voreTypes": voreTypes,
        "characters.$.head": head,
        "characters.$.headAccessories": headAccessories,
        "characters.$.body": body,
        "characters.$.bodyShape": bodyShape,
        "characters.$.tail": tail,
        "characters.$.eyes": eyes,
        "characters.$.hair": hair,
        "characters.$.ear": ear,
        "characters.$.genitles": genitles,
        "characters.$.hands": hands,
        "characters.$.feet": feet,
        "characters.$.feet": feet,
        "characters.$.beak": beak,
        "characters.$.anatomyData": req.body.anatomyData || ""
      }
    },
      { new: true });
    // log('updateChar = ', updateChar);

    res.redirect('/character-bank');
  } catch (err) {
    log.error('Error in /editcharacter:', err);
    res.status(400).send(err);
  }
})

router.post('/deletecharacter', async (req, res) => {
  try {
    // log.info('you are trying to delete a character');
    //Push changes to existing Character
    const token = req.cookies.TastyTails;
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    //log('verified = ', verified._id);
    log.debug('token = ', token);

    // log('req = ', req.body.charId);
    // log('verified._id = ', verified._id);
    const characterId = req.body.charId;
    log.debug('Deleting characterId = ', characterId);

    const updateChar = await DatabaseResilience.findOneAndUpdate(User, { _id: verified._id, "characters._id": characterId }, {
      $set: {
        "characters.$.deleted": true
      }
    },
      { new: true });
    // log('updateChar = ', updateChar);

    res.redirect('/character-bank');
  } catch (err) {
    log.error('Error in /deletecharacter:', err);
    res.status(400).send(err);
  }
})

router.post('/message', async (req, res) => {
  //Lets Validate the Data Before Adding a User
  const { error } = registerValidation(req.body);
  if (error) return res.status(405).send(error.details[0].message);
  try {
    log.info('you successfully left a message!');
  } catch (err) {
    log.error('Error in /message:', err);
    res.status(400).send(err);
  }
});

module.exports = router;
