const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const verify = require('./verifyToken');
const dbInterface = require('./dbInterface');
const edit = require('./edit');
const log = require('../logger');

router.get('/', (req, res) => {
  const token = req.cookies.TastyTails;
  if (!token) return res.render('index', {
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
  if (!token) {
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
  if (!token) {
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
  if (!token) return res.render('index', {
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
  if (!token) return res.render('registered', {
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
  log.debug('ran /character-bank');
  const token = req.cookies.TastyTails;
  log.debug('req.cookies.TastyTails = ', req.cookies.TastyTails);
  // log.debug('req = ', req);
  if (!token) return res.render('character-bank', {
    token: null,
    loginForm: 0
  });

  try {
    log.debug('trying');
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    log.debug('process.env.TOKEN_SECRET')
    log.info('verified = ', verified);
    let characters = await dbInterface.charList(token);
    // log.debug('characters in the index.js = ', characters);
    log.debug('successfully called dbInterface.charList() function.');

    // characters = characters.map(character => {
    //   return {
    //     ...character,
    //     _id: character._id.toString()
    //   };
    // });

    req.user = verified;
    res.render('character-bank', {
      token: token,
      loginForm: 0,
      // charList: JSON.stringify(characters)
      charList: characters
    });
  } catch (err) {
    log.error('err = ', err)
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: err,
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
})

router.get('/chat-archives', verify, async (req, res) => {
  const token = req.cookies.TastyTails;
  if (!token) return res.render('index', { token: null, loginForm: 0 });

  try {
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    req.user = verified;
    res.render('chat-archives', {
      token: token,
      loginForm: 0
    });
  } catch (err) {
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: 'Invalid Token',
      errDescrip: "Try logging out and logging back in."
    });
  }
})

router.get('/job-demos', verify, (req, res) => {
  const token = req.cookies.TastyTails;
  res.render('job-demos', {
    token: token,
    loginForm: 0
  });
})

router.get('/job-demos/:jobName', verify, (req, res) => {
  const token = req.cookies.TastyTails;
  const jobName = req.params.jobName;

  if (jobName.toLowerCase() === 'blacksmith') {
    return res.render('job-blacksmith', {
      token: token,
      loginForm: 0
    });
  }

  // Basic validation or mapping could go here if needed

  res.render('job-play', {
    token: token,
    loginForm: 0,
    jobName: jobName
  });
})

// router.use('/edit', edit) //tell the router to use edit.js for child routes


module.exports = router;
