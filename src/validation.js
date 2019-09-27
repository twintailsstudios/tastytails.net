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
    firstName: Joi.string().required()
  }
  return Joi.validate(data, schema);
};


module.exports.registerValidation = registerValidation;
module.exports.loginValidation = loginValidation;
module.exports.charCreateValidation = charCreateValidation;
