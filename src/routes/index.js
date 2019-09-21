const express = require('express');
const router = express.Router();
const verify = require('./verifyToken');

router.get('/', (req, res) => {
  console.log('user = ', req.user);
  console.log('session = ', req.session);
  console.log('header = ', req.header('token'));
  res.render('index', {
    button: ['test']
  });
})

router.get('/create', verify, (req, res) => {
  console.log(req.user);
  res.render('create');
})
router.get('/api/user/login', (req, res) => {
  //console.log(req.user);
  res.render('login');
})



module.exports = router;
