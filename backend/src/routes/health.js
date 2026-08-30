const express = require('express');
const healthService = require('../services/healthService');

const router = express.Router();

router.get('/health', async (req, res, next) => {
  try{
    const result = await healthService.checkHealth();
    const statusCode = result.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(result);
  }catch(err){
    next(err);
  }
});

module.exports = router;
