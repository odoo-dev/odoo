# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class ResUsersDeletion(models.Model):
    """User deletion requests.

    Those requests are logged in a different model to keep a trace of this action and the
    deletion is done in a CRON. Indeed, removing a user can be a heavy operation on
    large database (because of create_uid, write_uid on each model, which are not always
    indexed). This model just remove the users added in the deletion queue, remaining code
    must deal with other consideration (archiving, blacklist email...).
    """
    _name = 'res.users.deletion'
    _description = 'Users Deletion Request'
    _rec_name = 'user_id'

    # Integer field because the related user might be deleted from the database
    user_id = fields.Many2one('res.users', string='User', ondelete='set null')
    user_id_int = fields.Integer('User Id', compute='_compute_user_id_int', store=True)
    state = fields.Selection([('todo', 'To Do'), ('done', 'Done'), ('fail', 'Failed')],
                             string='State', required=True, default='todo')

    @api.depends('user_id')
    def _compute_user_id_int(self):
        for user_deletion in self:
            if user_deletion.user_id:
                user_deletion.user_id_int = user_deletion.user_id.id

    @api.model
    def _gc_portal_users(self, batch_size=50):
        """Remove the portal users that asked to deactivate their account.

        (see <res.users>::_deactivate_portal_user)

        Removing a user can be an heavy operation on large database (because of
        create_uid, write_uid on each models, which are not always indexed). Because of
        that, this operation is done in a CRON.
        """
        api.process.cron_implementation(
            self,
            '_process',
            search_limit=batch_size,
        )

    _process_precondition = fields.Domain('state', '=', 'todo')

    def _process(self):
        self.ensure_one()
        user = self.user_id
        if not user:
            self.state = 'done'
            return
        user_name = user.name
        partner = user.partner_id
        requester_name = self.create_uid.name
        cron = self.env['ir.cron']

        # Step 1: Delete User
        user.unlink()
        _logger.info(
            "User #%i %r, deleted. Original request from %r.",
            self.user_id_int, user_name, requester_name)
        self.state = 'done'
        cron._commit_progress()

        # Step 2: Delete Linked Partner
        #         Could be impossible if the partner is linked to a SO for example
        try:
            partner.unlink()
            _logger.info(
                "Partner #%i %r, deleted. Original request from %r.",
                partner.id, user_name, requester_name)
            cron._commit_progress()
        except Exception as e:  # noqa: BLE001
            cron._rollback_progress()
            _logger.warning(
                "Partner #%i %r could not be deleted. Original request from %r. Related error: %s",
                partner.id, user_name, requester_name, e)

    def _process_error_handler(self, exception):
        self.ensure_one()
        user_name = self.user_id.name
        requester_name = self.create_uid.name
        _logger.error(
            "User #%i %r could not be deleted. Original request from %r. Related error: %s",
            self.user_id_int, user_name, requester_name, exception)
        self.state = 'fail'
