/**
 * @fileoverview edit.js - Character Editor Web Route Controller
 *
 * @description
 * Express router handling page rendering for the character creator/editor view (GET /edit/:charId).
 * Validates the user's JWT authentication token from cookies, queries the target character subdocument
 * from MongoDB via dbInterface.charSelect, and passes the character state to the create.ejs view template.
 *
 * Triggered by:
 * - GET /edit/:charId (e.g., from src/views/character-bank.ejs or navigating to /edit/new)
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const dbInterface = require('./dbInterface');
const log = require('../logger');

/**
 * Renders the character creator/editor view for a specific character ID (or 'new').
 *
 * @route GET /edit/:charId
 * @param {import('express').Request} req - Express request object containing charId in params and TastyTails JWT cookie.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Renders create.ejs on success/unauthenticated access or error.ejs on invalid session/server error.
 *
 * @contract
 * - Unauthenticated visitors (no token) are allowed through to create.ejs with `token: null` to permit character creation workflows.
 * - Authenticated users have their JWT token verified and character subdocument loaded.
 * - Invalid or expired tokens return HTTP 401. Unexpected server/DB failures return HTTP 500.
 */
router.get('/:charId', async (req, res) => {
  const token = req.cookies.TastyTails;

  // CONTRACT PRESERVATION: Allow unauthenticated visitors to view character creation screen
  if (!token) {
    return res.render('create', {
      token: null,
      loginForm: 0,
      charList: 'new'
    });
  }

  try {
    log.debug('charid (from client) = ', req.params.charId);

    // Authenticate session and decode user payload
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    req.user = verified;

    // Fetch character subdocument (or 'new' if creating a character)
    const characters = await dbInterface.charSelect(token, req.params.charId);

    res.render('create', {
      token: token,
      loginForm: 0,
      charList: characters
    });

  } catch (err) {
    log.error('Error in edit.js route:', err);

    // ERROR ISOLATION: Distinguish JWT authentication failures (401) from unexpected server errors (500)
    const isAuthError = err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError';
    const statusCode = isAuthError ? 401 : 500;
    const errorTitle = isAuthError ? 'Invalid Token' : 'Server Error';
    const errDescrip = isAuthError
      ? "Try logging out and logging back in. If you are still having issues, try clearing your browser's cache and cookies and then logging back in."
      : "An unexpected server error occurred while retrieving character data. Please try again later.";

    res.status(statusCode).render('error', {
      token: null,
      loginForm: 0,
      error: errorTitle,
      errDescrip: errDescrip
    });
  }
});

module.exports = router;
