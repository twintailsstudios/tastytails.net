/**
 * @fileoverview Authentication & Character Management Routes (auth.js)
 * 
 * @description
 * Primary Express routing module handling user account registration, login, logout,
 * JWT session cookie management, and player character lifecycle operations (creation,
 * editing, soft deletion, character bank navigation).
 * 
 * Mounted in src/index.js under the base path '/api/user'.
 */
const router = require('express').Router();
const User = require('../model/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { registerValidation, loginValidation, charCreateValidation, voreTypeValidation, ratingsValidation } = require('../validation');
const log = require('../logger');
const DatabaseResilience = require('../classes/DatabaseResilience');

// --- HELPER FUNCTIONS FOR SPIRIT SPRITE & PALETTE PROCESSING ---

/**
 * Converts a hex string representation (#RRGGBB or 0xRRGGBB) to an RGB integer object.
 * @param {string} hex - Input hex string
 * @returns {{r: number, g: number, b: number}} RGB color component object
 */
const hexToRgb = (hex) => {
  if (!hex) return { r: 255, g: 255, b: 255 };
  let safeHex = String(hex).replace('0x', '#');
  if (!safeHex.startsWith('#')) safeHex = '#' + safeHex;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(safeHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
};

/**
 * Blends an original RGB color with a magic color using additive light math.
 * @param {{r: number, g: number, b: number}} originalRGB
 * @param {{r: number, g: number, b: number}} magicColor
 * @param {number} intensity - Blend intensity factor (0.0 to 1.0)
 * @returns {{r: number, g: number, b: number}} Blended RGB color
 */
const calculateMagicColor = (originalRGB, magicColor, intensity = 0.5) => ({
  r: Math.min(255, Math.round(originalRGB.r + (magicColor.r * intensity))),
  g: Math.min(255, Math.round(originalRGB.g + (magicColor.g * intensity))),
  b: Math.min(255, Math.round(originalRGB.b + (magicColor.b * intensity)))
});

/**
 * Converts RGB numbers to 0x-prefixed hexadecimal strings for Phaser graphics engine.
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @returns {string} Formatted 0xRRGGBB string
 */
const rgbToHex = (r, g, b) => "0x" + [r, g, b].map(x => {
  const hex = x.toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}).join('');

/**
 * Generates a spectral blue spirit sprite color variant from a standard hex color string.
 * @param {string} originalHex - Base sprite color hex
 * @returns {string} Spectral spirit color hex string
 */
const generateSpiritColor = (originalHex) => {
  if (!originalHex) return '0xffffff';
  const originalRGB = hexToRgb(originalHex);
  const spectralBlue = { r: 60, g: 220, b: 255 };
  const newRGB = calculateMagicColor(originalRGB, spectralBlue, 0.5);
  return rgbToHex(newRGB.r, newRGB.g, newRGB.b);
};

/**
 * Parses and constructs character customization components (ratings, vore types graph,
 * multi-layer sprites, and spirit sprite variants) from an HTTP request body.
 * 
 * OPTIMIZATION: Extracted to top-level module scope to eliminate 250+ lines of duplicate
 * code between creation and edit route handlers, preventing closure allocation overhead.
 * 
 * @param {Object} body - HTTP POST request body
 * @returns {Object} Extracted character customization data payload
 */
const parseCharacterCustomization = (body) => {
  const ratings = {
    ovStar: body.ovStar ? body.ovStar : null,
    avStar: body.avStar ? body.avStar : null,
    cvStar: body.cvStar ? body.cvStar : null,
    ubStar: body.ubStar ? body.ubStar : null,
    tvStar: body.tvStar ? body.tvStar : null,
    absStar: body.absStar ? body.absStar : null,
    svStar: body.svStar ? body.svStar : null,
    predStar: body.predStar ? body.predStar : null,
    preyStar: body.preyStar ? body.preyStar : null,
    softStar: body.softStar ? body.softStar : null,
    hardStar: body.hardStar ? body.hardStar : null,
    digestionStar: body.digestionStar ? body.digestionStar : null,
    disposalStar: body.disposalStar ? body.disposalStar : null,
    tfStar: body.tfStar ? body.tfStar : null,
    btfStar: body.btfStar ? body.btfStar : null,
    bsStar: body.bsStar ? body.bsStar : null,
    gStar: body.gStar ? body.gStar : null,
    sStar: body.sStar ? body.sStar : null,
    iaoStar: body.iaoStar ? body.iaoStar : null
  };

  let voreTypes = [];

  if (body.anatomyData && body.anatomyData.length > 2) {
    try {
      const graph = JSON.parse(body.anatomyData);
      if (graph.nodes) {
        voreTypes = graph.nodes.map(node => ({
          id: node.id,
          graphNodeId: String(node.id),
          destination: node.properties.name || 'Unknown',
          verb: node.properties.verb || 'eats',
          type: node.type,
          digestivePower: node.properties.digestivePower || 'Normal',
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
      log.warn("Failed to parse anatomyData during char customization parse");
    }
  }

  if (voreTypes.length === 0 && body.destination && Array.isArray(body.destination)) {
    for (let i = 0; i < body.destination.length; i++) {
      const voreType = {
        id: i,
        destination: body.destination[i],
        verb: body.verb ? body.verb[i] : 'eats',
        digestivePower: body.digestivePower ? body.digestivePower[i] : 'Normal',
        animation: body.animation ? body.animation[i] : null,
        destinationDescrip: body.destinationDescrip ? body.destinationDescrip[i] : null,
        examineMsgDescrip: body.examineMsgDescrip ? body.examineMsgDescrip[i] : null,
        struggleInsideMsgDescrip: body.struggleInsideMsgDescrip ? body.struggleInsideMsgDescrip[i] : null,
        struggleOutsideMsgDescrip: body.struggleOutsideMsgDescrip ? body.struggleOutsideMsgDescrip[i] : null,
        digestionInsideMsgDescrip: body.digestionInsideMsgDescrip ? body.digestionInsideMsgDescrip[i] : null,
        digestionOutsideMsgDescrip: body.digestionOutsideMsgDescrip ? body.digestionOutsideMsgDescrip[i] : null
      };
      voreTypes.push(voreType);
      const { error1 } = voreTypeValidation(voreType);
      if (error1) log.warn(`Vore type validation warning: ${error1.details[0].message}`);
    }
  }

  const formatColor = (hex) => hex ? hex.replace("#", "0x") : '0xffffff';

  const head = {
    sprite: body.head,
    color: formatColor(body.primaryHeadColor),
    secondarySprite: body.headSecondaryFur,
    secondaryColor: formatColor(body.secondaryHeadColor),
    accentSprite: body.headAccentFur,
    accentColor: formatColor(body.accentHeadColor)
  };
  const headAccessories = {
    sprite: body.headAccessories,
    color: formatColor(body.headAccessoriesColor)
  };
  const bodyShape = {
    sprite: body.bodyShape
  };
  const bodyComp = {
    sprite: body.mainBodyType,
    color: formatColor(body.bodyColor),
    secondarySprite: body.bodySecondaryFur,
    secondaryColor: formatColor(body.secondaryBodyColor),
    accentSprite: body.bodyAccentFur,
    accentColor: formatColor(body.accentBodyColor)
  };
  const tail = {
    sprite: body.tail,
    color: formatColor(body.tailColor),
    secondarySprite: body.tailSecondaryFur,
    secondaryColor: formatColor(body.secondaryTailColor),
    accentSprite: body.tailAccentFur,
    accentColor: formatColor(body.accentTailColor)
  };
  const eyes = {
    outer: body.eyesOuter,
    iris: body.eyesIris,
    color: formatColor(body.eyesColor)
  };
  const hair = {
    sprite: body.hair,
    color: formatColor(body.hairColor)
  };
  const ear = {
    outerSprite: body.outerEar,
    outerColor: formatColor(body.outerEarColor),
    innerSprite: body.innerEar,
    innerColor: formatColor(body.innerEarColor)
  };
  const genitals = {
    sprite: body.genitals || body.genitles,
    secondarySprite: 'empty'
  };
  const hands = {
    sprite: body.handsFur,
    color: body.handsColor
  };
  const feet = {
    sprite: body.feetFur,
    color: body.feetColor
  };
  const beak = {
    sprite: body.beakSprite,
    color: body.beakHex
  };

  const spiritSprite = {
    head: { ...head, color: generateSpiritColor(head.color), secondaryColor: generateSpiritColor(head.secondaryColor), accentColor: generateSpiritColor(head.accentColor) },
    body: { ...bodyComp, color: generateSpiritColor(bodyComp.color), secondaryColor: generateSpiritColor(bodyComp.secondaryColor), accentColor: generateSpiritColor(bodyComp.accentColor) },
    hands: { ...hands, color: generateSpiritColor(hands.color) },
    feet: { ...feet, color: generateSpiritColor(feet.color) },
    tail: { ...tail, color: generateSpiritColor(tail.color), secondaryColor: generateSpiritColor(tail.secondaryColor), accentColor: generateSpiritColor(tail.accentColor) },
    eyes: { ...eyes, color: generateSpiritColor(eyes.color) },
    hair: { ...hair, color: generateSpiritColor(hair.color) },
    ear: { ...ear, outerColor: generateSpiritColor(ear.outerColor), innerColor: generateSpiritColor(ear.innerColor) },
    genitals: { ...genitals, color: generateSpiritColor(genitals.color), secondaryColor: generateSpiritColor(genitals.secondaryColor) },
    beak: { ...beak, color: generateSpiritColor(beak.color) },
    headAccessories: { ...headAccessories, color: generateSpiritColor(headAccessories.color) }
  };

  let voiceProfile = null;
  if (body.voiceProfile) {
    if (typeof body.voiceProfile === 'string') {
      try {
        voiceProfile = JSON.parse(body.voiceProfile);
      } catch (e) {
        voiceProfile = null;
      }
    } else if (typeof body.voiceProfile === 'object') {
      voiceProfile = body.voiceProfile;
    }
  }

  return {
    ratings, voreTypes, head, headAccessories, bodyShape, body: bodyComp,
    tail, eyes, hair, ear, genitals, hands, feet, beak, spiritSprite, voiceProfile
  };
};

// --- ACCOUNT AUTHENTICATION & SESSION ROUTES ---

/**
 * Handles new user account registration.
 * Validates input, checks email uniqueness, hashes password with bcrypt (salt 10),
 * persists user via DatabaseResilience, and redirects to /registered.
 */
router.post('/register', async (req, res) => {
  try {
    const { error } = registerValidation(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    const emailExist = await User.findOne({ email: req.body.email });
    if (emailExist) return res.status(400).send('Email already exists');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    const user = new User({
      email: req.body.email,
      password: hashedPassword,
      birthday: req.body.birthday
    });
    await DatabaseResilience.save(user);
    res.redirect('/registered');
  } catch (err) {
    log.error('Error in /register:', err);
    res.status(400).send(err.message || err);
  }
});

/**
 * Handles user authentication and session creation.
 * Validates input, verifies bcrypt password hash, signs JWT payload,
 * and sets an httpOnly session cookie ('TastyTails').
 */
router.post('/login', async (req, res) => {
  try {
    const { error } = loginValidation(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(400).send('Email or password is incorrect (bad email)');

    const validPass = await bcrypt.compare(req.body.password, user.password);
    if (!validPass) return res.status(400).send('Email or password is incorrect (bad password)');

    const token = jwt.sign({ _id: user._id }, process.env.TOKEN_SECRET);
    res.cookie('TastyTails', token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });
    res.set('token', token).redirect('/');
  } catch (err) {
    log.error('Error in /login:', err);
    res.status(400).send(err.message || err);
  }
});

/**
 * Clears session cookie and redirects user to home page.
 */
router.post('/logout', async (req, res) => {
  res.clearCookie('TastyTails').redirect('/');
});

/**
 * Redirect helper for login form modal display.
 */
router.post('/loginForm', async (req, res) => {
  res.redirect('/loginForm');
});

/**
 * Redirect helper for closing registration modal.
 */
router.post('/closereg', async (req, res) => {
  res.redirect('/');
});

// --- CHARACTER LIFECYCLE & SELECTION ROUTES ---

/**
 * Validates JWT session token and redirects user to character bank interface.
 */
router.post('/character-bank', async (req, res) => {
  try {
    const token = req.cookies.TastyTails;
    let userId = token;
    if (token && token.split('.').length === 3) {
      try {
        const verified = jwt.verify(token, process.env.TOKEN_SECRET);
        userId = verified._id;
      } catch (e) { log.warn('Invalid token in bank check'); }
    }

    const user = await User.findOne({ _id: userId });
    if (!user) return res.redirect('/');

    log.debug('user.characters = ', user.characters);
    res.redirect('/character-bank');
  } catch (err) {
    log.error('Error in /character-bank:', err);
    res.redirect('/');
  }
});

/**
 * Creates a new character subdocument on the authenticated user's record.
 * Parses character customization payload, validates ratings and attributes,
 * and pushes initial stats and sprite configurations to User.characters.
 */
router.post('/createcharacter', async (req, res) => {
  try {
    const custom = parseCharacterCustomization(req.body);

    const { error: error3 } = ratingsValidation(custom.ratings);
    if (error3) return res.status(400).send(error3.details[0].message);

    const { error: error2 } = charCreateValidation(req.body);
    if (error2) return res.status(400).send(error2.details[0].message);

    const token = req.cookies.TastyTails;
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);

    const position = { x: 3795, y: 3728, time: null };
    const input = { left: false, right: false, down: true, up: false };

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
          "ratings": custom.ratings,
          "voreTypes": custom.voreTypes,
          "head": custom.head,
          "headAccessories": custom.headAccessories,
          "body": custom.body,
          "bodyShape": custom.bodyShape,
          "tail": custom.tail,
          "eyes": custom.eyes,
          "hair": custom.hair,
          "ear": custom.ear,
          "genitals": custom.genitals,
          "hands": custom.hands,
          "feet": custom.feet,
          "beak": custom.beak,
          "spiritSprite": custom.spiritSprite,
          "isDead": false,
          "position": position,
          "consumedBy": null,
          "rotation": 0,
          "isMoving": false,
          "input": input,
          "itentifier": "player",
          "deleted": false,
          "stats": {
            "health": 100,
            "maxHealth": 100,
            "stamina": 100,
            "maxStamina": 100,
            "mana": 100,
            "maxMana": 100,
            "bloodVolume": 5000,
            "maxBloodVolume": 5000,
            "bleedingRate": 0,
            "sensory": { "eyeDamage": 0, "earDamage": 0 },
            "bodyParts": {
              "leftEar": { "brute": 0, "burn": 0, "bleeding": 0 },
              "rightEar": { "brute": 0, "burn": 0, "bleeding": 0 },
              "head": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0, "toxin": 0, "suffocation": 0 },
              "eyes": { "brute": 0, "burn": 0, "bleeding": 0 },
              "mouth": { "brute": 0, "burn": 0, "bleeding": 0 },
              "torso": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0, "toxin": 0, "suffocation": 0 },
              "groin": { "brute": 0, "burn": 0, "bleeding": 0 },
              "leftArm": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0, "fractured": false },
              "rightArm": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0, "fractured": false },
              "leftHand": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0 },
              "rightHand": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0 },
              "leftLeg": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0, "fractured": false, "splinted": false },
              "rightLeg": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0, "fractured": false, "splinted": false },
              "leftFoot": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0 },
              "rightFoot": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0 },
              "tail": { "hp": 100, "maxHp": 100, "brute": 0, "burn": 0, "fractured": false }
            }
          },
          "anatomyData": req.body.anatomyData || "",
          "voiceProfile": custom.voiceProfile
        }
      }
    });
    log.debug('updateChar = ', updateChar);
    res.redirect('/character-bank');
  } catch (err) {
    log.error('Error in /createcharacter:', err);
    res.status(400).send(err.message || err);
  }
});

/**
 * Updates an existing character subdocument.
 * Preserves character stats and position while updating ratings, sprite layers,
 * spirit sprites, and vore node graph data.
 */
router.post('/editcharacter', async (req, res) => {
  try {
    const custom = parseCharacterCustomization(req.body);

    const { error: error3 } = ratingsValidation(custom.ratings);
    if (error3) return res.status(400).send(error3.details[0].message);

    const { error: error2 } = charCreateValidation(req.body);
    if (error2) return res.status(400).send(error2.details[0].message);

    const token = req.cookies.TastyTails;
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);

    let characterId = req.body.charId;
    if (!characterId && req.headers.referer) {
      try {
        const parts = req.headers.referer.split('/');
        const potentialId = parts.pop();
        if (/^[0-9a-fA-F]{24}$/.test(potentialId)) {
          characterId = potentialId;
        }
      } catch (e) {
        log.warn('Failed to parse character ID from Referer');
      }
    }

    if (!characterId) {
      return res.status(400).send('Character ID is required to edit character');
    }

    const updateChar = await DatabaseResilience.findOneAndUpdate(User, { _id: verified._id, "characters._id": characterId }, {
      $set: {
        "characters.$.firstName": req.body.firstName,
        "characters.$.lastName": req.body.lastName,
        "characters.$.nickName": req.body.nickName,
        "characters.$.speciesName": req.body.speciesName,
        "characters.$.pronouns": req.body.pronouns,
        "characters.$.icDescrip": req.body.icDescrip,
        "characters.$.oocDescrip": req.body.oocDescrip,
        "characters.$.ratings": custom.ratings,
        "characters.$.voreTypes": custom.voreTypes,
        "characters.$.head": custom.head,
        "characters.$.headAccessories": custom.headAccessories,
        "characters.$.body": custom.body,
        "characters.$.bodyShape": custom.bodyShape,
        "characters.$.tail": custom.tail,
        "characters.$.eyes": custom.eyes,
        "characters.$.hair": custom.hair,
        "characters.$.ear": custom.ear,
        "characters.$.genitals": custom.genitals,
        "characters.$.hands": custom.hands,
        "characters.$.feet": custom.feet,
        "characters.$.beak": custom.beak,
        "characters.$.spiritSprite": custom.spiritSprite,
        "characters.$.anatomyData": req.body.anatomyData || "",
        "characters.$.voiceProfile": custom.voiceProfile
      }
    }, { new: true });

    res.redirect('/character-bank');
  } catch (err) {
    log.error('Error in /editcharacter:', err);
    res.status(400).send(err.message || err);
  }
});

/**
 * Soft deletes a character by setting characters.$.deleted to true.
 */
router.post('/deletecharacter', async (req, res) => {
  try {
    const token = req.cookies.TastyTails;
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);

    const characterId = req.body.charId;
    log.debug('Deleting characterId = ', characterId);

    await DatabaseResilience.findOneAndUpdate(User, { _id: verified._id, "characters._id": characterId }, {
      $set: {
        "characters.$.deleted": true
      }
    }, { new: true });

    res.redirect('/character-bank');
  } catch (err) {
    log.error('Error in /deletecharacter:', err);
    res.status(400).send(err.message || err);
  }
});

/**
 * Legacy feedback / user message endpoint.
 */
router.post('/message', async (req, res) => {
  const { error } = registerValidation(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  try {
    log.info('you successfully left a message!');
  } catch (err) {
    log.error('Error in /message:', err);
    res.status(400).send(err.message || err);
  }
});

module.exports = router;
