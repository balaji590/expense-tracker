const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validate } = require('../middleware/validate');
const sharedExpenseService = require('../services/sharedExpenseService');

const router = express.Router();

router.get('/groups/:groupId/expenses',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const expenses = await sharedExpenseService.listSharedExpenses(req.user.id, req.params.groupId);
      res.status(200).json({ expenses });
    }catch(err){ next(err); }
  }
);

router.post('/groups/:groupId/expenses',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const expense = await sharedExpenseService.createSharedExpense(req.user.id, req.params.groupId, req.body || {});
      res.status(201).json({ expense });
    }catch(err){ next(err); }
  }
);

router.put('/groups/:groupId/expenses/:expenseId',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true }, expenseId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const expense = await sharedExpenseService.updateSharedExpense(req.user.id, req.params.groupId, req.params.expenseId, req.body || {});
      res.status(200).json({ expense });
    }catch(err){ next(err); }
  }
);

router.delete('/groups/:groupId/expenses/:expenseId',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true }, expenseId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      await sharedExpenseService.deleteSharedExpense(req.user.id, req.params.groupId, req.params.expenseId);
      res.status(204).send();
    }catch(err){ next(err); }
  }
);

module.exports = router;
