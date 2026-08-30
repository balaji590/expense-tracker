const express = require('express');
const healthRoute = require('./health');

const router = express.Router();

router.use(healthRoute);

module.exports = router;
