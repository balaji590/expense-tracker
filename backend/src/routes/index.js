const express = require('express');
const healthRoute = require('./health');
const authRoute = require('./auth');
const expensesRoute = require('./expenses');
const groupsRoute = require('./groups');
const invitationsRoute = require('./invitations');
const sharedExpensesRoute = require('./sharedExpenses');

const router = express.Router();

router.use(healthRoute);
router.use(authRoute);
router.use(expensesRoute);
router.use(groupsRoute);
router.use(invitationsRoute);
router.use(sharedExpensesRoute);

module.exports = router;
