const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const verify = require('./verifyToken');
const dbInterface = require('./dbInterface');

router.get('/:charId', async (req, res) => {
  const token = req.cookies.TastyTails;
  //console.log('req = ', req.params);
  if(!token) return res.render('create', {
      token: null,
      loginForm: 0
    });
    //res.send('this is the edit page');
  try {
    console.log('getting the play.js function.');
    console.log('charid (from client) = ', req.params.charId);
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    console.log('verified successfully.');
    const characters = await dbInterface.charSelect(token, req.params.charId);
    console.log('characters in the index.js = ', characters);
    req.user = verified;
    res.render('play', {
      token: token,
      loginForm: 0,
      charList: JSON.stringify(characters)

    });

  } catch (err) {
    console.log(err);
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: err,
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
})

module.exports = router;
