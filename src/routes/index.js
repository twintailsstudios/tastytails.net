/**
 * @fileoverview index.js - Primary Page View Controller for TastyTails.net
 * 
 * @description
 * Server-side route handler for HTML page views (home, character bank, chat archives).
 * Decodes and validates JWT cookies, fetches user character data, and dispatches to EJS view templates.
 * 
 * Triggered by:
 * - Express app root mounting (`app.use('/', indexRoute)` in `src/index.js`)
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const verify = require('./verifyToken');
const dbInterface = require('./dbInterface');
const log = require('../logger');

/**
 * Helper to render pages that have optional JWT authentication (e.g. index, loginForm, registered).
 * Reads the `TastyTails` cookie, verifies the token signature if present, and renders the specified EJS template.
 * If token signature verification fails, renders the standard 400 Invalid Token error page.
 * 
 * @optimization DRY CONSOLIDATION: Prevents repeating JWT cookie parsing and 400 error handling across optional-auth page routes.
 * 
 * @param {express.Request} req - Express incoming request
 * @param {express.Response} res - Express response object
 * @param {string} viewName - EJS template name to render
 * @param {object} [extraData={}] - Additional template variables
 */
function renderOptionalAuthView(req, res, viewName, extraData = {}) {
  const token = req.cookies.TastyTails;
  if (!token) {
    return res.render(viewName, {
      token: null,
      loginForm: 0,
      ...extraData
    });
  }

  try {
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    res.render(viewName, {
      token: token,
      loginForm: 0,
      user: verified,
      ...extraData
    });
  } catch (err) {
    log.error(`[IndexRoute] JWT verification failed on ${viewName} page load: ${err.message}`);
    res.status(400).render('error', {
      error: 'Invalid Token',
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
}

/** GET / - Main homepage view handler */
router.get('/', (req, res) => {
  renderOptionalAuthView(req, res, 'index', { loginForm: 0 });
});

/** GET /create - Protected character creation view handler */
router.get('/create', verify, (req, res) => {
  const token = req.cookies.TastyTails;
  res.render('create', {
    token: token,
    loginForm: 0,
    charList: 'new'
  });
});

/** GET /error - Static error view diagnostic route */
router.get('/error', (req, res) => {
  const token = req.cookies.TastyTails;
  res.render('error', {
    token: token || null,
    loginForm: 0,
    error: 'Everything is fine~',
    errDescrip: 'What? Are you just searching for something wrong? There are no errors with your most recent request'
  });
});

/** GET /loginForm - Homepage rendering with active login modal */
router.get('/loginForm', (req, res) => {
  renderOptionalAuthView(req, res, 'index', { loginForm: 1 });
});

/** GET /registered - Post-registration landing view */
router.get('/registered', (req, res) => {
  renderOptionalAuthView(req, res, 'registered');
});

/**
 * GET /character-bank - Protected character bank view handler
 * @optimization CPU FIX: Relies on verifyToken middleware to validate JWT, eliminating redundant local jwt.verify() calls.
 */
router.get('/character-bank', verify, async (req, res) => {
  log.debug('ran /character-bank');
  const token = req.cookies.TastyTails;
  log.debug('req.cookies.TastyTails = ', req.cookies.TastyTails);

  try {
    const characters = await dbInterface.charList(token);
    log.debug('successfully called dbInterface.charList() function.');

    res.render('character-bank', {
      token: token,
      loginForm: 0,
      charList: characters
    });
  } catch (err) {
    log.error('Error fetching character bank:', err);
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: 'Character Bank Error',
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
});

/** GET /chat-archives - Protected chat archives view handler */
router.get('/chat-archives', verify, async (req, res) => {
  const token = req.cookies.TastyTails;
  res.render('chat-archives', {
    token: token,
    loginForm: 0
  });
});

/** GET /job-demos & /job-demos/* - Legacy route redirect to home */
router.get(['/job-demos', '/job-demos/*'], (req, res) => {
  res.redirect('/');
});

module.exports = router;
