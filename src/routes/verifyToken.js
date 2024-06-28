const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const log = require('../logger');

module.exports = function(req, res, next) {
  log('running verifyToken');
  const token = req.cookies.TastyTails;
  //log(token);
  if(!token) return res.status(401).render('error', {
    token: null,
    loginForm: 0,
    error: 'Access Denied',
    errDescrip: 'You will need to log in in order to go there'
  })


  try {
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    req.user = verified;
    log('user Verified');
    next();
  } catch (err) {
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: 'Invalid Token',
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
}
