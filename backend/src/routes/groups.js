const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validate } = require('../middleware/validate');
const groupService = require('../services/groupService');

const router = express.Router();

router.get('/groups', requireAuth, async (req, res, next) => {
  try{
    const groups = await groupService.listGroupsForUser(req.user.id);
    res.status(200).json({ groups });
  }catch(err){ next(err); }
});

router.post('/groups', requireAuth, async (req, res, next) => {
  try{
    const { group, membership } = await groupService.createGroup(req.user.id, req.body && req.body.name);
    res.status(201).json({ group, membership });
  }catch(err){ next(err); }
});

router.put('/groups/:id',
  requireAuth,
  validate({ params: { id: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const group = await groupService.renameGroup(req.user.id, req.params.id, req.body && req.body.name);
      res.status(200).json({ group });
    }catch(err){ next(err); }
  }
);

router.delete('/groups/:id',
  requireAuth,
  validate({ params: { id: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      await groupService.deleteGroupById(req.user.id, req.params.id);
      res.status(204).send();
    }catch(err){ next(err); }
  }
);

router.get('/groups/:groupId/members',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const members = await groupService.listMembers(req.user.id, req.params.groupId);
      res.status(200).json({ members });
    }catch(err){ next(err); }
  }
);

router.post('/groups/:groupId/members',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      await groupService.addMemberByName(req.user.id, req.params.groupId, req.body && req.body.name);
      // addMemberByName always throws (see groupService.js) — this line is unreachable but kept for shape clarity.
      res.status(201).json({});
    }catch(err){ next(err); }
  }
);

router.delete('/groups/:groupId/members/:memberId',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true }, memberId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      await groupService.removeMember(req.user.id, req.params.groupId, req.params.memberId);
      res.status(204).send();
    }catch(err){ next(err); }
  }
);

module.exports = router;
