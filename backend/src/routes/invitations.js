const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { validate } = require('../middleware/validate');
const invitationService = require('../services/invitationService');

const router = express.Router();

// ---- Group-scoped: create / list / revoke (owner only) ----

router.post('/groups/:groupId/invitations',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const { invitation, devInvitationLink } = await invitationService.createInvitation(
        req.user.id, req.params.groupId, req.body && req.body.email
      );
      const body = { invitation };
      if(devInvitationLink) body.devInvitationLink = devInvitationLink;
      res.status(201).json(body);
    }catch(err){ next(err); }
  }
);

router.get('/groups/:groupId/invitations',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      const invitations = await invitationService.listInvitations(req.user.id, req.params.groupId);
      res.status(200).json({ invitations });
    }catch(err){ next(err); }
  }
);

router.delete('/groups/:groupId/invitations/:invitationId',
  requireAuth,
  validate({ params: { groupId: { type: 'uuid', required: true }, invitationId: { type: 'uuid', required: true } } }),
  async (req, res, next) => {
    try{
      await invitationService.revokeInvitation(req.user.id, req.params.groupId, req.params.invitationId);
      res.status(204).send();
    }catch(err){ next(err); }
  }
);

// ---- Token-scoped: preview (public) / accept (requires auth) ----

// Public — lets the frontend show "You've been invited to X" (or a clean
// sign-in prompt) before the user has necessarily authenticated at all.
// Never reveals who invited them, and reveals nothing at all once the
// token is invalid/expired/used (a generic 400, same as accept's failure).
router.get('/invitations/:token/preview', async (req, res, next) => {
  try{
    const preview = await invitationService.previewInvitation(req.params.token);
    res.status(200).json(preview);
  }catch(err){ next(err); }
});

router.post('/invitations/:token/accept', requireAuth, async (req, res, next) => {
  try{
    const { group, member } = await invitationService.acceptInvitation(req.user.id, req.params.token);
    res.status(200).json({ group, member });
  }catch(err){ next(err); }
});

module.exports = router;
