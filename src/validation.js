//VALIDATION
const Joi = require('@hapi/joi');

//Register Validation
const registerValidation = (data) => {
  const date = new Date();
  const validDate = ((date.getMonth() + 1) + '-' + date.getDate() + '-' +  (date.getFullYear() - 18));

  const schema = {
    email: Joi.string().min(6).required().email(),
    password: Joi.string().min(6).required(),
    password_confirmation: Joi.string().valid(Joi.ref('password')).min(6).required(),
    birthday: Joi.date().max(validDate).iso().required()
  }
  return Joi.validate(data, schema);
};

//Login Validation
const loginValidation = (data) => {
  const schema = {
    email: Joi.string().min(6).required().email(),
    password: Joi.string().min(6).required()
  }
  return Joi.validate(data, schema);
};

//Character Creation Validation
const charCreateValidation = (data) => {

  const schema = {
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    nickName: Joi.string(),
    speciesName: Joi.string().required(),
    pronouns: Joi.number().required(),
    icDescrip: Joi.string().required(),
    oocDescrip: Joi.string().required(),
    ovStar: Joi.number(),
    avStar: Joi.number(),
    cvStar: Joi.number(),
    ubStar: Joi.number(),
    tvStar: Joi.number(),
    absStar: Joi.number(),
    svStar: Joi.number(),
    predStar: Joi.number(),
    preyStar: Joi.number(),
    softStar: Joi.number(),
    hardStar: Joi.number(),
    digestionStar: Joi.number(),
    disposalStar: Joi.number(),
    tfStar: Joi.number(),
    btfStar: Joi.number(),
    bsStar: Joi.number(),
    gStar: Joi.number(),
    sStar: Joi.number(),
    iaoStar: Joi.number(),
    destination: Joi.array(),
    verb: Joi.array(),
    digestionTimer: Joi.array(),
    animation: Joi.array(),
    destinationDescrip: Joi.array(),
    examineMsgDescrip: Joi.array(),
    struggleInsideMsgDescrip: Joi.array(),
    struggleOutsideMsgDescrip: Joi.array(),
    digestionInsideMsgDescrip: Joi.array(),
    digestionOutsideMsgDescrip: Joi.array()


  }
  return Joi.validate(data, schema);
};

const voreTypeValidation = (data) => {

  const schema = {
    destination: Joi.string(),
    verb: Joi.string(),
    digestionTimer: Joi.number(),
    animation: Joi.number(),
    destinationDescrip: Joi.string(),
    examineMsgDescrip: Joi.string(),
    struggleInsideMsgDescrip: Joi.string(),
    struggleOutsideMsgDescrip: Joi.string(),
    digestionInsideMsgDescrip: Joi.string(),
    digestionOutsideMsgDescrip: Joi.string()
  }
  return Joi.validate(data, schema);
};

const ratingsValidation = (data) => {

  const schema = {
    ovStar: Joi.number(),
    avStar: Joi.number(),
    cvStar: Joi.number(),
    ubStar: Joi.number(),
    tvStar: Joi.number(),
    absStar: Joi.number(),
    svStar: Joi.number(),
    predStar: Joi.number(),
    preyStar: Joi.number(),
    softStar: Joi.number(),
    hardStar: Joi.number(),
    digestionStar: Joi.number(),
    disposalStar: Joi.number(),
    tfStar: Joi.number(),
    btfStar: Joi.number(),
    bsStar: Joi.number(),
    gStar: Joi.number(),
    sStar: Joi.number(),
    iaoStar: Joi.number()
  }
  return Joi.validate(data, schema);
};


module.exports.registerValidation = registerValidation;
module.exports.loginValidation = loginValidation;
module.exports.charCreateValidation = charCreateValidation;
module.exports.voreTypeValidation = voreTypeValidation;
module.exports.ratingsValidation = ratingsValidation;
