/**
 * @fileoverview play.js - Main Gameplay Web Route Controller
 *
 * @description
 * Express router handling page rendering for the primary game view (GET /play/:charId).
 * Validates the user's JWT authentication token from cookies, queries character details
 * from MongoDB via dbInterface.charSelect, injects active map configuration, and passes
 * the state to the play.ejs view template for client-side game engine initialization.
 *
 * Triggered by:
 * - GET /play/:charId (e.g., clicking "Play" on a character card in src/views/character-bank.ejs)
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const dbInterface = require('./dbInterface');
const log = require('../logger');
const mapConfig = require('../server/mapConfig');

/**
 * Renders the main gameplay canvas view for a specific character ID.
 *
 * @route GET /play/:charId
 * @param {import('express').Request} req - Express request object containing charId in params and TastyTails JWT cookie.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Renders play.ejs on success, create.ejs on missing token, or error.ejs on invalid session/server error.
 *
 * @contract
 * - Unauthenticated visitors (no token) are redirected to create.ejs to prompt character creation or login.
 * - Authenticated users have their JWT token verified and character subdocument loaded.
 * - Pre-verified user claims are passed to dbInterface.charSelect to eliminate redundant jwt.verify operations.
 * - Invalid or expired tokens return HTTP 401. Unexpected server failures return HTTP 500.
 */
router.get('/:charId', async (req, res) => {
  const token = req.cookies.TastyTails;

  // CONTRACT PRESERVATION: Direct unauthenticated visitors to character creation screen
  if (!token) {
    return res.render('create', {
      token: null,
      loginForm: 0,
      charList: 'new'
    });
  }

  try {
    log.debug('getting the play.js function.');
    log.debug('charid (from client) = ', req.params.charId);

    // Authenticate session and decode user payload
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    log.debug('verified successfully.');
    req.user = verified;

    // OPTIMIZATION: Pass pre-verified user claims to dbInterface.charSelect to eliminate duplicate jwt.verify crypto overhead
    const characters = await dbInterface.charSelect(token, req.params.charId, verified);

    res.render('play', {
      token: token,
      loginForm: 0,
      mapFilename: mapConfig.mapFilename, // Pass map filename to client
      charList: characters
    });

  } catch (err) {
    log.error('Error in play.js route:', err);

    // ERROR ISOLATION: Distinguish JWT authentication failures (401) from unexpected server errors (500)
    const isAuthError = err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError';
    const statusCode = isAuthError ? 401 : 500;
    const errorTitle = isAuthError ? 'Invalid Token' : 'Server Error';
    const errDescrip = isAuthError
      ? "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
      : "An unexpected server error occurred while launching the game session. Please try again later.";

    res.status(statusCode).render('error', {
      token: null,
      loginForm: 0,
      error: errorTitle,
      errDescrip: errDescrip
    });
  }
});

module.exports = router;
