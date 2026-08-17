/**
 * @fileoverview Request Payload Validation Module (src/validation.js)
 * 
 * @description
 * Server-side data validation layer for TastyTails.net. Enforces structural Joi schema
 * contracts on user registration, login, character creation/editing, and preference rating payloads.
 * 
 * Triggered by: Express POST endpoint handlers in src/routes/auth.js (/register, /login, /createcharacter, /editcharacter).
 */

const Joi = require('@hapi/joi');

/**
 * Returns a Date object corresponding to exactly 18 years ago from the current moment.
 * Evaluated dynamically at runtime to prevent stale date cutoffs over long server uptimes.
 * @returns {Date} 18-year cutoff date threshold
 */
const getEighteenYearsAgoDate = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
};

// --- PRE-COMPILED MODULE-SCOPED SCHEMAS ---
// OPTIMIZATION: Schemas are pre-compiled at top-level module load time to eliminate per-request Joi AST parsing & GC overhead.

/**
 * Pre-compiled schema for user login payloads.
 */
const loginSchema = Joi.object({
  email: Joi.string().min(6).required().email(),
  password: Joi.string().min(6).required()
});

/**
 * Shared Star Rating Field Definitions.
 * OPTIMIZATION: Shared across charCreateSchema and ratingsSchema to maintain single-source-of-truth and avoid shotgun surgery.
 */
const starRatingSchemaMap = {
  ovStar: Joi.number().optional().allow(null),
  avStar: Joi.number().optional().allow(null),
  cvStar: Joi.number().optional().allow(null),
  ubStar: Joi.number().optional().allow(null),
  tvStar: Joi.number().optional().allow(null),
  absStar: Joi.number().optional().allow(null),
  svStar: Joi.number().optional().allow(null),
  predStar: Joi.number().optional().allow(null),
  preyStar: Joi.number().optional().allow(null),
  softStar: Joi.number().optional().allow(null),
  hardStar: Joi.number().optional().allow(null),
  digestionStar: Joi.number().optional().allow(null),
  disposalStar: Joi.number().optional().allow(null),
  tfStar: Joi.number().optional().allow(null),
  btfStar: Joi.number().optional().allow(null),
  bsStar: Joi.number().optional().allow(null),
  gStar: Joi.number().optional().allow(null),
  sStar: Joi.number().optional().allow(null),
  iaoStar: Joi.number().optional().allow(null),
  shvStar: Joi.number().optional().allow(null),
  bvStar: Joi.number().optional().allow(null),
  pvStar: Joi.number().optional().allow(null),
  uvStar: Joi.number().optional().allow(null),
  sfStar: Joi.number().optional().allow(null),
  tatStar: Joi.number().optional().allow(null),
  wgStar: Joi.number().optional().allow(null),
  microStar: Joi.number().optional().allow(null),
  macroStar: Joi.number().optional().allow(null),
  pawStar: Joi.number().optional().allow(null),
  burpStar: Joi.number().optional().allow(null),
  fartStar: Joi.number().optional().allow(null),
  wsStar: Joi.number().optional().allow(null)
};

/**
 * Pre-compiled schema for character creation and profile modification payloads.
 */
const charCreateSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  nickName: Joi.string().optional().allow(''),
  speciesName: Joi.string().required(),
  pronouns: Joi.number().required(),
  icDescrip: Joi.string().required(),
  oocDescrip: Joi.string().required(),
  ...starRatingSchemaMap,
  destination: Joi.array().optional(),
  verb: Joi.array().optional(),
  digestivePower: Joi.array().optional(),
  animation: Joi.array().optional(),
  destinationDescrip: Joi.array().optional(),
  examineMsgDescrip: Joi.array().optional(),
  struggleInsideMsgDescrip: Joi.array().optional(),
  struggleOutsideMsgDescrip: Joi.array().optional(),
  digestionInsideMsgDescrip: Joi.array().optional(),
  digestionOutsideMsgDescrip: Joi.array().optional(),
  anatomyData: Joi.string().allow('').optional()
}).unknown(true);

/**
 * Pre-compiled schema for individual vore preference entries.
 */
const voreTypeSchema = Joi.object({
  destination: Joi.string().optional().allow(''),
  verb: Joi.string().optional().allow(''),
  digestivePower: Joi.string().optional().allow(''),
  animation: Joi.number().optional(),
  destinationDescrip: Joi.string().optional().allow(''),
  examineMsgDescrip: Joi.string().optional().allow(''),
  struggleInsideMsgDescrip: Joi.string().optional().allow(''),
  struggleOutsideMsgDescrip: Joi.string().optional().allow(''),
  digestionInsideMsgDescrip: Joi.string().optional().allow(''),
  digestionOutsideMsgDescrip: Joi.string().optional().allow('')
});

/**
 * Pre-compiled schema for preference rating star metrics.
 */
const ratingsSchema = Joi.object(starRatingSchemaMap).unknown(true);

// --- EXPORTED VALIDATION FUNCTIONS ---

/**
 * Validates user registration payload. Enforces minimum 18 years age requirement.
 * @param {Object} data - Request body containing email, password, password_confirmation, and birthday.
 * @returns {Object} Joi validation result object containing { value, error }
 */
const registerValidation = (data) => {
  const schema = Joi.object({
    email: Joi.string().min(6).required().email(),
    password: Joi.string().min(6).required(),
    password_confirmation: Joi.string().valid(Joi.ref('password')).min(6).required(),
    birthday: Joi.date().max(getEighteenYearsAgoDate()).required()
  });
  return schema.validate(data);
};

/**
 * Validates user login payload.
 * @param {Object} data - Request body containing email and password.
 * @returns {Object} Joi validation result object containing { value, error }
 */
const loginValidation = (data) => loginSchema.validate(data);

/**
 * Validates character creation and editing payloads.
 * @param {Object} data - Request body containing character attributes, sprite, and preference arrays.
 * @returns {Object} Joi validation result object containing { value, error }
 */
const charCreateValidation = (data) => charCreateSchema.validate(data);

/**
 * Validates an individual vore preference object structure.
 * @param {Object} data - Vore type data containing destination, verb, and message descriptions.
 * @returns {Object} Joi validation result object containing { value, error }
 */
const voreTypeValidation = (data) => voreTypeSchema.validate(data);

/**
 * Validates star rating metrics payload.
 * @param {Object} data - Rating star properties object.
 * @returns {Object} Joi validation result object containing { value, error }
 */
const ratingsValidation = (data) => ratingsSchema.validate(data);

module.exports.registerValidation = registerValidation;
module.exports.loginValidation = loginValidation;
module.exports.charCreateValidation = charCreateValidation;
module.exports.voreTypeValidation = voreTypeValidation;
module.exports.ratingsValidation = ratingsValidation;

