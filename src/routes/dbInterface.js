/**
 * @fileoverview dbInterface.js - Character Data Access & Filtering Interface
 *
 * @description
 * Server-side data retrieval gateway for TastyTails.net player characters.
 * Decodes JSON Web Tokens (JWT) to securely scope queries to the authenticated account,
 * retrieves character subdocuments from MongoDB via the User Mongoose model,
 * and applies subdocument field cleaning and filtering for view templates.
 * 
 * Triggered by:
 * - GET / (src/routes/index.js -> charList)
 * - GET /edit/:charId (src/routes/edit.js -> charSelect)
 * - GET /play/:charId (src/routes/play.js -> charSelect)
 */

const router = require('express').Router();
const jwt = require('jsonwebtoken');
// Removed index and play imports to prevent circular dependency
const User = require('../model/User');
const log = require('../logger');

log.info('dbInterfaceRoute is connected.');

/**
 * Retrieves the list of active (non-deleted) characters for an authenticated user session.
 * 
 * @param {string} data - JWT authentication token containing user session identity.
 * @returns {Promise<Array<Object>>} Array of active character plain objects, or [] on failure.
 * 
 * @optimization
 * - OPTIMIZATION: Uses .select('characters').lean() to avoid loading full User documents and Mongoose model overhead.
 * - CONCURRENCY FIX: Uses block-scoped array methods (.filter/.map) to eliminate global loop variable corruption.
 * - SAFETY: Encloses jwt.verify inside try/catch to trap expired/malformed token errors gracefully.
 */
const charList = async (data) => {
  log.debug('You have successfully called the dbInterface.charList function!');
  log.debug('data = ', data);
  try {
    const verified = jwt.verify(data, process.env.TOKEN_SECRET);
    log.debug('verified = ', verified._id);

    // OPTIMIZATION: Fetch only character subdocuments as plain JS objects
    const user = await User.findOne({ _id: verified._id }).select('characters').lean();
    if (!user || !Array.isArray(user.characters)) {
      return [];
    }

    log.debug('user.characters.length = ', user.characters.length);

    // CONCURRENCY & MEMORY FIX: Clean subdocument IDs and filter non-deleted characters using scoped array methods
    const activeChars = user.characters
      .filter(char => char && char.deleted === false)
      .map(char => {
        if (Array.isArray(char.voreTypes)) {
          char.voreTypes.forEach(vt => {
            if (vt) delete vt._id;
          });
        }
        return char;
      });

    return activeChars;
  } catch (err) {
    log.error('charList err = ', err);
    return []; // Return empty array to prevent view engine crashes
  }
};

/**
 * Retrieves a single character by ID for an authenticated user session.
 * 
 * @param {string} token - JWT authentication token containing user session identity.
 * @param {string} charId - Unique identifier of the requested character (or 'new').
 * @returns {Promise<Object|string|null>} Character object if found, 'new' for creation/not found, or null on error.
 * 
 * @optimization
 * - OPTIMIZATION: Uses .select('characters').lean() and Array.prototype.find() for O(N) in-memory lookup on plain objects.
 * - CONTRACT PRESERVATION: Explicitly returns 'new' when charId is not found to preserve character creation workflows in create.ejs.
 * - SAFETY: Encloses jwt.verify inside try/catch to prevent unhandled exceptions on invalid tokens.
 */
const charSelect = async (token, charId, decodedUser = null) => {
  log.debug('You have successfully called the dbInterface.charSelect function!');
  log.debug('charId in the charSelect function = ', charId);
  try {
    const verified = decodedUser || jwt.verify(token, process.env.TOKEN_SECRET);

    // OPTIMIZATION: Fetch only character subdocuments as plain JS objects
    const user = await User.findOne({ _id: verified._id }).select('characters').lean();
    if (!user || !Array.isArray(user.characters)) {
      return 'new';
    }

    // CONTRACT FIX: Match character ID safely using string coercion
    const character = user.characters.find(c => c._id && c._id.toString() === charId.toString());
    if (character) {
      log.debug('You selected charId#: ', character._id);
      return character;
    }

    // CONTRACT PRESERVATION: Return 'new' when character is not found for new character views
    return 'new';
  } catch (err) {
    log.error('charSelect err = ', err);
    return null; // Return null so callers can handle view errors gracefully
  }
};

// Maintain Express Router export structure for backward compatibility with src/index.js
router.charList = charList;
router.charSelect = charSelect;
module.exports = router;

