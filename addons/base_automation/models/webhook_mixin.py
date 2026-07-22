# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import traceback
from uuid import uuid4

from odoo import _, api, exceptions, fields, models
from odoo.tools import BinaryBytes, safe_eval

_logger = logging.getLogger(__name__)


class WebhookMixin(models.AbstractModel):
    _name = 'webhook.mixin'
    _description = ('Mixin to have a webhook on a model. \
        The webhook is requested with a payload to identify a recordset, on which actions can then be performed.\
        See _compute_url documentation for more information.')

    webhook_url = fields.Char(compute='_compute_webhook_url', help="Use this URL in the third-party app to call the webhook.")
    webhook_uuid = fields.Char(string="Webhook UUID", readonly=True, copy=False, default=lambda self: str(uuid4()))
    webhook_record_getter = fields.Char(default="model.env[payload.get('_model')].browse(int(payload.get('_id')))",
                                help="This code will be run to find on which record the automation rule should be run.")
    log_webhook_calls = fields.Boolean(string="Log Calls", default=False)

    @api.depends('webhook_uuid')
    def _compute_webhook_url(self):
        """
        Webhook is enabled on a model if _is_webhook_enabled evaluates to True.
        When that happens, an URL is attributed.
        A webhook has a webhook_record_getter field, a piece of code which will be evaluated with a request payload to return a recordset.
        An external service visiting that URL with the appropriate payload will result in _process_webhook being called with the recordset as argument.
        The inheriting model may then act on that recordset by overriding the method.

        The inheriting method needs to have a defined model_name field, to store the name of the target model.


        What to implement when inheriting:
        - _process_webhook() method override
        - model_name field
        - controller inheriting from WebhookController with a call_webhook_http route override
        """
        if not 'model_name' in self:
            raise exceptions.ValidationError(_('Model %(model)s inheriting from webhook.mixin is missing model_name field',
                model=self._name,
            ))

        webhook_enabled = self.filtered(lambda rec: rec._is_webhook_enabled())
        for webhook in webhook_enabled:
            webhook.webhook_url = "%s/web/hook/%s" % (webhook.get_base_url(), webhook.webhook_uuid)
        (self - webhook_enabled).webhook_url = ''

    def _is_webhook_enabled(self):
        return True

    def action_rotate_webhook_uuid(self):
        for webhook in self:
            webhook.webhook_uuid = str(uuid4())

    def _get_eval_context(self, payload=None):
        """ Prepare the context used when evaluating python code
            :returns: dict -- evaluation context given to safe_eval
        """
        self.ensure_one()
        model = self.env[self.model_name]
        eval_context = {
            'BinaryBytes': BinaryBytes,
            'datetime': safe_eval.datetime,
            'dateutil': safe_eval.dateutil,
            'time': safe_eval.time,
            'uid': self.env.uid,
            'user': self.env.user,
            'model': model,
        }
        if payload is not None:
            eval_context['payload'] = payload
        return eval_context

    def action_view_webhook_logs(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Webhook Logs'),
            'res_model': 'ir.logging',
            'view_mode': 'list,form',
            'domain': [('path', '=', "%s(%s)" % (self._name, self.id))],
        }

    def _prepare_loggin_values(self, **values):
        self.ensure_one()
        defaults = {
            'name': _("Webhook Log"),
            'type': 'server',
            'dbname': self.env.cr.dbname,
            'level': 'INFO',
            'path': "%s(%s)" % (self._name, self.id),
            'func': '',
            'line': '',
        }
        defaults.update(**values)
        return defaults

    def _execute_webhook(self, payload):
        """ Execute the webhook for the given payload.
        The payload is a dictionnary that can be used by the `webhook_record_getter` to
        identify the record on which the automation should be run.
        """
        self.ensure_one()
        ir_logging_sudo = self.env['ir.logging'].sudo()

        # info logging is done by the ir.http logger
        msg = "Webhook #%s triggered with payload %s"
        msg_args = (self.id, payload)
        _logger.debug(msg, *msg_args)
        if self.log_webhook_calls:
            ir_logging_sudo.create(self._prepare_loggin_values(message=msg % msg_args))

        record = self.env[self.model_name]
        if self.webhook_record_getter:
            try:
                record = safe_eval.safe_eval(self.webhook_record_getter, self._get_eval_context(payload=payload))
            except Exception:  # noqa: BLE001
                msg = "Webhook #%s could not be triggered because the webhook_record_getter failed:\n%s"
                msg_args = (self.id, traceback.format_exc())
                _logger.warning(msg, *msg_args)
                if self.log_webhook_calls:
                    ir_logging_sudo.create(self._prepare_loggin_values(message=msg % msg_args, level="ERROR"))
                raise

        if not record.exists():
            msg = "Webhook #%s could not be triggered because no record to run it on was found."
            msg_args = (self.id,)
            _logger.warning(msg, *msg_args)
            if self.log_webhook_calls:
                ir_logging_sudo.create(self._prepare_loggin_values(message=msg % msg_args, level="ERROR"))
            raise exceptions.ValidationError(_("No record to run the automation on was found."))

        try:
            return self._process_webhook(record)
        except Exception:  # noqa: BLE001
            msg = "Webhook #%s failed with error:\n%s"
            msg_args = (self.id, traceback.format_exc())
            _logger.warning(msg, *msg_args)
            if self.log_webhook_calls:
                ir_logging_sudo.create(self._prepare_loggin_values(message=msg % msg_args, level="ERROR"))
            raise

    def _process_webhook(self, records):
        raise exceptions.ValidationError(_('Model %(model_name)s inheriting from webhook.mixin is missing _process_webhook() override',
            model_name=self._name,
        ))
