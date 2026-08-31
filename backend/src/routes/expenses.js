const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validate } = require('../middleware/validate');
const expenseService = require('../services/expenseService');

const router = express.Router();

router.get('/expenses', requireAuth, async (req, res, next) => {
  try{
    const expenses = await expenseService.listPersonalExpenses(req.user.id);
    res.status(200).json({ expenses });
  }catch(err){ next(err); }
});

router.post('/expenses', requireAuth, async (req, res, next) => {
  try{
    const expense = await expenseService.createPersonalExpense(req.user.id, req.body || {});
    res.status(201).json({ expense });
  }catch(err){ next(err); }
});

router.put('/expenses/:id',
  requireAuth,
  validate({ params: { id: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const expense = await expenseService.updatePersonalExpense(req.user.id, req.params.id, req.body || {});
      res.status(200).json({ expense });
    }catch(err){ next(err); }
  }
);

router.delete('/expenses/:id',
  requireAuth,
  validate({ params: { id: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      await expenseService.deletePersonalExpense(req.user.id, req.params.id);
      res.status(204).send();
    }catch(err){ next(err); }
  }
);

module.exports = router;
