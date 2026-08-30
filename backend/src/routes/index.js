const express = require('express');
const healthRoute = require('./health');
const authRoute = require('./auth');

const router = express.Router();

router.use(healthRoute);
router.use(authRoute);

module.exports = router;
