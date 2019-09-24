const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const verify = require('./verifyToken');

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
      loginForm: 0
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


module.exports = router;
