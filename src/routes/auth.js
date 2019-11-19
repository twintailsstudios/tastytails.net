const router = require('express').Router();
const User = require('../model/User');
//const Character = require('../model/Character');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { registerValidation, loginValidation, charCreateValidation, voreTypeValidation, ratingsValidation } = require('../validation');




//Registering new users
router.post('/register', async (req, res) => {
//Lets Validate the Data Before Adding a User
const { error } = registerValidation(req.body);
if (error) return res.status(405).send(error.details[0].message);

  //Checking if the user is already in the database
  const emailExist = await User.findOne({email: req.body.email});
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
  try {
    const savedUser = await user.save();
    //res.send({ user: user._id });
    res.redirect('/registered');
  } catch(err){
    res.status(400).send(err);
  }
});

//User Login Request
router.post('/login', async (req, res) => {
  //Lets Validate the Data Before Allowing the User to Login
  const { error } = loginValidation(req.body);
  if (error) return res.status(402).send(error.details[0].message);
  //Checking if the email exists
  const user = await User.findOne({email: req.body.email});
  if (!user) return res.status(403).send('Email or password is incorrect (bad email)');
  //Check if password is correct
  const validPass = await bcrypt.compare(req.body.password, user.password);
  if(!validPass) return res.status(404).send('Email or password is incorrect (bad password)');

  //Create and Assign a Token
  const token = jwt.sign({ _id: user._id }, process.env.TOKEN_SECRET);
  //Redirect user to home page and send token to response header
  res.cookie('TastyTails', token, {
    expiresIn: "7d"
  }), {
    httpOnly: true
  }
  res.set('token', token).redirect('/');
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

// //Going to Character-Bank
// router.post('/character-bank', async (req, res) => {
//   const user = await User.findOne({_id: req.cookies.TastyTails});
//   const charList = user.characters;
//   console.log('user.characters = ', user.characters)
//   res.redirect('/character-bank');
// })

//Create a new Character
router.post('/createcharacter', async (req, res) => {
  //Lets make sure the character sheet was properly filled out
  //console.log('req.body = ', req.body);
  var ratings = {
    ovStar: req.body.ovStar,
    avStar: req.body.avStar,
    cvStar: req.body.cvStar,
    ubStar: req.body.ubStar,
    tvStar: req.body.tvStar,
    absStar: req.body.absStar,
    svStar: req.body.svStar,
    predStar: req.body.predStar,
    preyStar: req.body.preyStar,
    softStar: req.body.softStar,
    hardStar: req.body.hardStar,
    digestionStar: req.body.digestionStar,
    disposalStar: req.body.disposalStar,
    tfStar: req.body.tfStar,
    btfStar: req.body.btfStar,
    bsStar: req.body.bsStar,
    gStar: req.body.gStar,
    sStar: req.body.sStar,
    iaoStar: req.body.iaoStar
  };
    const { error3 } = ratingsValidation(ratings);
    if (error3) return res.status(405).send(error3.details[0].message);

    //console.log('ratings = ', ratings);

  var voreTypes = [];
  //console.log('req.body = ', req.body);
  for(i = 0; i < req.body.destination.length; i++) {
    //console.log('req.body.destination[i] = ', req.body.destination[i]);
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

  var head = {
    sprite: req.body.head,
    color: req.body.primaryHeadColor.replace("#", "0x"),
    secondarySprite: req.body.headSecondaryFur,
    secondaryColor: req.body.secondaryHeadColor.replace("#", "0x"),
    accentSprite: req.body.headAccentFur,
    accentColor: req.body.accentHeadColor.replace("#", "0x")
  }
  //console.log('head = ', head);
  var body = {
    sprite: req.body.body,
    color: req.body.bodyColor.replace("#", "0x"),
    secondarySprite: req.body.bodySecondaryFur,
    secondaryColor: req.body.secondaryBodyColor.replace("#", "0x"),
    accentSprite: req.body.bodyAccentFur,
    accentColor: req.body.accentBodyColor.replace("#", "0x")
  }
  var tail = {
    sprite: req.body.tail,
    color: req.body.tailColor.replace("#", "0x"),
    secondarySprite: req.body.tailSecondaryFur,
    secondaryColor: req.body.secondaryTailColor.replace("#", "0x"),
    accentSprite: req.body.tailAccentFur,
    accentColor: req.body.accentTailColor.replace("#", "0x")
  }
  var eyes = {
    outer: 'eyes_01',
    iris: 'eyes_02',
    color: req.body.eyesColor.replace("#", "0x")
  }
  var hair = {
    sprite: req.body.hair,
    color: req.body.hairColor.replace("#", "0x")
  }
  var ear = {
    sprite: req.body.ear,
    color: req.body.earColor.replace("#", "0x")
  }
  var genitles = {
    sprite: req.body.genitles,
    secondarySprite: 'empty'
  }

  const { error2 } = charCreateValidation(req.body);
  if (error2) return res.status(405).send(error2.details[0].message);

  //Create a new Character
  const token = req.cookies.TastyTails;
  const verified = jwt.verify(token, process.env.TOKEN_SECRET);
  //console.log('verified = ', verified._id);
  try {
    const updateChar = await User.updateOne({_id: verified._id}, {$push: {"characters": {
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
      "body": body,
      "tail": tail,
      "eyes": eyes,
      "hair": hair,
      "ear": ear,
      "genitles": genitles
    }}});
    // try {
    //   const user = await User.findOne({_id: verified._id});
    //   charList = user.characters;
    //
    // } catch(err){
    //   res.status(400).send(err);
    // }
    res.redirect('/character-bank');
  } catch(err){
    res.status(400).send(err);
  }
})

router.post('/editcharacter', async (req, res) => {
  //Lets make sure the character sheet was properly filled out
  var ratings = {
    ovStar: req.body.ovStar,
    avStar: req.body.avStar,
    cvStar: req.body.cvStar,
    ubStar: req.body.ubStar,
    tvStar: req.body.tvStar,
    absStar: req.body.absStar,
    svStar: req.body.svStar,
    predStar: req.body.predStar,
    preyStar: req.body.preyStar,
    softStar: req.body.softStar,
    hardStar: req.body.hardStar,
    digestionStar: req.body.digestionStar,
    disposalStar: req.body.disposalStar,
    tfStar: req.body.tfStar,
    btfStar: req.body.btfStar,
    bsStar: req.body.bsStar,
    gStar: req.body.gStar,
    sStar: req.body.sStar,
    iaoStar: req.body.iaoStar
  };
    const { error3 } = ratingsValidation(ratings);
    if (error3) return res.status(405).send(error3.details[0].message);

    //console.log('ratings = ', ratings);

  var voreTypes = [];
  //console.log('req.body = ', req.body);
  for(i = 0; i < req.body.destination.length; i++) {
    //console.log('req.body.destination[i] = ', req.body.destination[i]);
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

  var head = {
    sprite: req.body.head,
    color: req.body.primaryHeadColor.replace("#", "0x"),
    secondarySprite: req.body.headSecondaryFur,
    secondaryColor: req.body.secondaryHeadColor.replace("#", "0x"),
    accentSprite: req.body.headAccentFur,
    accentColor: req.body.accentHeadColor.replace("#", "0x")
  }
  //console.log('head = ', head);
  var body = {
    sprite: req.body.body,
    color: req.body.bodyColor.replace("#", "0x"),
    secondarySprite: req.body.bodySecondaryFur,
    secondaryColor: req.body.secondaryBodyColor.replace("#", "0x"),
    accentSprite: req.body.bodyAccentFur,
    accentColor: req.body.accentBodyColor.replace("#", "0x")
  }
  var tail = {
    sprite: req.body.tail,
    color: req.body.tailColor.replace("#", "0x"),
    secondarySprite: req.body.tailSecondaryFur,
    secondaryColor: req.body.secondaryTailColor.replace("#", "0x"),
    accentSprite: req.body.tailAccentFur,
    accentColor: req.body.accentTailColor.replace("#", "0x")
  }
  var eyes = {
    outer: 'eyes_01',
    iris: 'eyes_02',
    color: req.body.eyesColor.replace("#", "0x")
  }
  var hair = {
    sprite: req.body.hair,
    color: req.body.hairColor.replace("#", "0x")
  }
  var ear = {
    sprite: req.body.ear,
    color: req.body.earColor.replace("#", "0x")
  }
  var genitles = {
    sprite: req.body.genitles,
    secondarySprite: 'empty'
  }

  const { error2 } = charCreateValidation(req.body);
  if (error2) return res.status(405).send(error2.details[0].message);

  //Create a new Character
  const token = req.cookies.TastyTails;
  const verified = jwt.verify(token, process.env.TOKEN_SECRET);
  //console.log('verified = ', verified._id);
  try {
    const updateChar = await User.updateOne({_id: verified._id}, {$set: {"characters": {
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
      "body": body,
      "tail": tail,
      "eyes": eyes,
      "hair": hair,
      "ear": ear,
      "genitles": genitles
    }}});
    // try {
    //   const user = await User.findOne({_id: verified._id});
    //   charList = user.characters;
    //
    // } catch(err){
    //   res.status(400).send(err);
    // }
    res.redirect('/character-bank');
  } catch(err){
    res.status(400).send(err);
  }
})



module.exports = router;
