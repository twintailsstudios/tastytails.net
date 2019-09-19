const express = require('express');
const router = express.Router();
const verify = require('./verifyToken');

router.get('/', (req, res) => {
  console.log(req.user);
  console.log(req.session);
  res.render('index');
})

router.get('/create', verify, (req, res) => {
  console.log(req.user);
  res.render('create');
})
router.get('/login', (req, res) => {
  //console.log(req.user);
  res.render('login');
})



module.exports = router;
