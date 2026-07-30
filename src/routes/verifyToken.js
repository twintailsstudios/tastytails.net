/**
 * @fileoverview Authentication Middleware for TastyTails.net
 * 
 * @description
 * Express middleware that intercepts incoming HTTP requests to verify user authentication.
 * It extracts JWT tokens from either the `TastyTails` cookie or `Authorization: Bearer <token>`
 * header, validates the signature against `process.env.TOKEN_SECRET`, and populates `req.user`
 * with decoded claims.
 * 
 * Includes content-negotiation to return JSON error responses for API/AJAX requests
 * while continuing to render HTML error views (`views/error.ejs`) for page navigation.
 */

const jwt = require('jsonwebtoken');
const log = require('../logger');

/**
 * Express Authentication Middleware Guard.
 * 
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware function.
 * @returns {void}
 */
module.exports = function (req, res, next) {
  // SAFETY: Use optional chaining to safely extract token from cookie or Authorization header without throwing if req.cookies is undefined
  const authHeader = req.headers?.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = req.cookies?.TastyTails || headerToken;

  // COMPATIBILITY: Determine if caller expects JSON (e.g. /api/* endpoints or AJAX fetch) vs traditional HTML page render
  const isApiRequest = req.path?.startsWith('/api') || 
                       req.baseUrl?.startsWith('/api') || 
                       req.xhr || 
                       (req.headers?.accept && req.headers.accept.includes('application/json'));

  // 1. Guard against unauthenticated requests (missing token)
  if (!token) {
    if (isApiRequest) {
      return res.status(401).json({ 
        error: 'Access Denied', 
        errDescrip: 'You will need to log in in order to go there' 
      });
    }
    return res.status(401).render('error', {
      token: null,
      loginForm: 0,
      error: 'Access Denied',
      errDescrip: 'You will need to log in in order to go there'
    });
  }

  // 2. Cryptographic verification & claims enrichment
  try {
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    req.user = verified;
    
    // OPTIMIZATION: Debug logging gated behind NODE_ENV check to prevent hot-path I/O overhead in production
    if (process.env.NODE_ENV === 'development') {
      log.debug(`verifyToken: User ${verified._id || 'verified'} verified successfully`);
    }
    
    next();
  } catch (err) {
    // DIAGNOSTIC: Log technical error details for server debugging without exposing raw JWTs or secret keys
    log.error(`verifyToken: JWT verification failed - ${err.message}`);
    
    if (isApiRequest) {
      return res.status(400).json({ 
        error: 'Invalid Token', 
        errDescrip: "Try logging out and logging back in." 
      });
    }
    
    res.status(400).render('error', {
      token: null,
      loginForm: 0,
      error: 'Invalid Token',
      errDescrip: "Try logging out and logging back in. If you are still having issues, you can try clearing your browser's cache and cookies and then logging back in."
    });
  }
};


