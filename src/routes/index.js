const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const verify = require('./verifyToken');
const dbInterface = require('./dbInterface');
//const edit = require('./edit');

router.get('/', (req, res) => {
  const token = req.cookies.TastyTails;
  if(!token) return res.render('index', {
      token: null,
      loginForm: 0
    });

  try {
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    req.user = verified;
    res.render('index', {
      token: token,
      loginForm: 0
    });
  } catch (err) {
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: 'Invalid Token',
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
})


router.get('/create', verify, (req, res) => {
  const token = req.cookies.TastyTails;
  if(!token) {
    res.render('create', {
      token: null,
      loginForm: 0
    });
  } else {
    res.render('create', {
      token: token,
      loginForm: 0,
      charList: 'new'
    });
  }
})


router.get('/error', (req, res) => {
  const token = req.cookies.TastyTails;
  if(!token) {
    res.render('error', {
      token: null,
      loginForm: 0,
      error: 'Everything is fine~',
      errDescrip: 'What? Are you just searching for something wrong? There are no errors with your most recent request'
    });
  } else {
    res.render('error', {
      token: token,
      loginForm: 0,
      error: 'Everything is fine~',
      errDescrip: 'What? Are you just searching for something wrong? There are no errors with your most recent request'
    });
  }
})


router.get('/loginForm', (req, res) => {
  const token = req.cookies.TastyTails;
  if(!token) return res.render('index', {
      token: null,
      loginForm: 1
    });

  try {
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    req.user = verified;
    res.render('index', {
      token: token,
      loginForm: 1
    });
  } catch (err) {
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: 'Invalid Token',
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
})


router.get('/registered', (req, res) => {
  const token = req.cookies.TastyTails;
  if(!token) return res.render('registered', {
      token: null,
      loginForm: 0
    });

  try {
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    req.user = verified;
    res.render('registered', {
      token: token,
      loginForm: 0
    });
  } catch (err) {
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: 'Invalid Token',
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
})

router.get('/character-bank', verify, async (req, res) => {
  console.log('ran /character-bank');
  const token = req.cookies.TastyTails;
  console.log('req.cookies.TastyTails = ', req.cookies.TastyTails);
  // console.log('req = ', req);
  if(!token) return res.render('character-bank', {
      token: null,
      loginForm: 0
    });

  try {
    console.log('trying');
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    console.log('process.env.TOEN_SECRET')
    console.log('verified = ', verified);
    const characters = await dbInterface.charList(token);
    // console.log('characters in the index.js = ', characters);
    console.log('successfully called dbInterface.charList() function.');
    req.user = verified;
    res.render('character-bank', {
      token: token,
      loginForm: 0,
      charList: JSON.stringify(characters)

    });
  } catch (err) {
    console.log('err = ', err)
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: err,
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
})

//router.use('/edit', edit) //tell the router to use edit.js for child routes


module.exports = router;
