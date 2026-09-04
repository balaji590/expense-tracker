const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validate } = require('../middleware/validate');
const settlementService = require('../services/settlementService');

const router = express.Router();

router.get('/groups/:groupId/settlements',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const settlements = await settlementService.listSettlements(req.user.id, req.params.groupId);
      res.status(200).json({ settlements });
    }catch(err){ next(err); }
  }
);

router.post('/groups/:groupId/settlements',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const settlement = await settlementService.createSettlement(req.user.id, req.params.groupId, req.body || {});
      res.status(201).json({ settlement });
    }catch(err){ next(err); }
  }
);

module.exports = router;
