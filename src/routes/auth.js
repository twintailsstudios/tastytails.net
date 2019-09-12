const router = require('express').Router();
const User = require('../model/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { registerValidation, loginValidation } = require('../validation');




//Registering new users
router.post('/register', async (req, res) => {
//Lets Validate the Data Before Adding a User
const { error } = registerValidation(req.body);
if (error) return res.status(405).send(error.details[0].message);

  //Checking if the user is already in the database
  const emailExist = await User.findOne({email: req.body.email});
  if (emailExist) return res.status(401).send('Email already exists');

  //Hash the passwords
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(req.body.password, salt);

  //Create a new user
  const user = new User({
    email: req.body.email,
    password: hashedPassword
  });
  try {
    const savedUser = await user.save();
    res.send({ user: user._id });
  } catch(err){
    res.status(400).send(err);
  }
});

//User Login Request
router.post('/login', async (req, res) => {
  //Lets Validate the Data Before Allowing the User to Login
  const { error } = loginValidation(req.body);
  if (error) return res.status(402).send(error.details[0].message);
  //Checking if the email exists
  const user = await User.findOne({email: req.body.email});
  if (!user) return res.status(403).send('Email or password is incorrect (bad email)');
  //Check if password is correct
  const validPass = await bcrypt.compare(req.body.password, user.password);
  if(!validPass) return res.status(404).send('Email or password is incorrect (bad password)');

  //Create and Assign a Token
  const token = jwt.sign({ _id: user._id }, process.env.TOKEN_SECRET);
  res.header('auth-token', token).send(token);
})





module.exports = router;
