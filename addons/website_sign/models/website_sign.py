# -*- coding: utf-8 -*-
import uuid,re

from openerp import tools
from openerp import SUPERUSER_ID
from openerp.tools import DEFAULT_SERVER_DATE_FORMAT
import time
from openerp.tools.translate import _
from openerp import models, api, fields

class signature_mail_message(models.Model):
    _inherit = "mail.message"

    def _message_read_dict_postprocess(self, cr, uid, messages, message_tree, context=None):
        result = super(signature_mail_message, self)._message_read_dict_postprocess(cr, uid, messages, message_tree, context=context)

        # Calculate total requested and signed on specific attachment
        sign_obj = self.pool.get('signature.request.item').search(cr, uid, [], context=context)
        request_items = self.pool.get('signature.request.item').browse(cr, SUPERUSER_ID, sign_obj)
        doc_data = {}
        for request_item in request_items:
            if request_item.signature_request.attachment.id not in doc_data:
                doc_data[request_item.signature_request.attachment.id] = {'nb_signed': 0, 'nb_toSign': 0}

            doc_data[request_item.signature_request.attachment.id]['nb_toSign'] += 1
            if request_item.state == 'closed':
                doc_data[request_item.signature_request.attachment.id]['nb_signed'] += 1
            doc_data[request_item.signature_request.attachment.id]['signature_request'] = request_item.signature_request.id

        # Update message dictionaries (attach)
        for message_dict in messages:
            attachment_ids = message_dict.get('attachment_ids')
            for attachment in attachment_ids:
                if attachment['id'] in doc_data:
                    attachment.update(doc_data[attachment['id']])

        return result

    # TODO -> should include a message with 'a signature request could be sent to you later'
    def create(self, cr, uid, values, context=None):
        # signers_data = []
        # if (context == None or 'is_signature_request' not in context) and 'attachment_ids' in values:
        #     signers_data = self.pool.get("ir.attachment").browse(cr, uid, map(lambda a: a[1], values['attachment_ids']), context=context).get_signers().keys()

        # new_context = {'ignored_signers_for_mail': signers_data}
        # if context != None:
        #     new_context.update(context)

        tmp = super(signature_mail_message, self).create(cr, uid, values, context=context)
        if 'signature_request' not in context:
            mess = self.pool.get("mail.message").browse(cr, uid, [tmp], context=context)
            signature_request = self.pool.get("signature.request").search(cr, uid, [("attachment.id", "in", map(lambda d: d.id, mess.attachment_ids))], context=context)
            signature_request = self.pool.get("signature.request").browse(cr, uid, signature_request, context=context)
            signature_request.write({'message': mess.body})

        # attachments = self.pool.get("ir.attachment").browse(cr, uid, map(lambda d: d.id, mess.attachment_ids), context=context)
        # attachments.send_signature_accesses(mess.body)
        return tmp

# class signature_mail_notification(models.Model):
#     _inherit = "mail.notification"

#     def _notify(self, cr, uid, message_id, partners_to_notify=None, context=None, force_send=False, user_signature=True):
#         if context != None and 'ignored_signers_for_mail' in context:
#             partners_to_notify = list(set(partners_to_notify) - set(context['ignored_signers_for_mail']))
#         super(signature_mail_notification, self)._notify(cr, uid, message_id, partners_to_notify=partners_to_notify, context=context, force_send=force_send, user_signature=user_signature)

class ir_attachment(models.Model):
    _inherit = 'ir.attachment'

    signature_request = fields.One2many("signature.request", "attachment")

    def set_name_and_description(self, cr, uid, id, name, description, context=None):
        attach = self.browse(cr, uid, [id], context=context)
        attach.write({'name': name, 'description': description})

class signature_request(models.Model):
    _name = "signature.request"
    _description = "Signature Request For An Attachment"
    _rec_name = 'attachment'

    attachment = fields.Many2one('ir.attachment', required=True)
    message = fields.Html()
    request_items = fields.One2many('signature.request.item', 'signature_request', 'Signers')
    # signature_items = fields.One2many('signature.item', 'signature_request')
    state = fields.Selection([
        ("draft", "Draft"),
        ("opened", "Waiting for completions"),
        ("closed", "Closed"),
        ("canceled", "Canceled")
    ], readonly=True)

    nb_draft = fields.Integer(string="Draft requests", compute="_compute_nb_draft", store=True)
    nb_wait = fields.Integer(string="Sent requests", compute="_compute_nb_wait")
    nb_closed = fields.Integer(string="Completed requests", compute="_compute_nb_closed", store=True)

    @api.one
    @api.depends('request_items.state')
    def _compute_nb_draft(self):
        self.nb_draft = 0
        for s in self.request_items:
            if s.state == "draft":
                self.nb_draft += 1

    @api.one
    @api.depends('request_items.state')
    def _compute_nb_wait(self):
        self.nb_wait = 0
        for s in self.request_items:
            if s.state == "opened":
                self.nb_wait += 1

    @api.one
    @api.depends('request_items.state')
    def _compute_nb_closed(self):
        self.nb_closed = 0
        for s in self.request_items:
            if s.state == "closed":
                self.nb_closed += 1

    @api.one
    def action_draft(self):
        self.state = 'draft'

    @api.one
    def action_opened(self): # TODO -> send from item?
        ignored_partners = []
        for request_item in self.request_items:
            if request_item.state != 'draft':
                ignored_partners.append(request_item.partner_id.id)
        self.send_signature_accesses(ignored_partners=ignored_partners)
        self.request_items.filtered(lambda r: r.partner_id.id not in ignored_partners).signal_workflow('signature_request_item_launch')
        self.state = 'opened'

    @api.one
    def action_closed(self):
        self.state = 'closed'

    @api.one
    def action_canceled(self):
        self.request_items.signal_workflow('signature_request_item_cancel')
        self.state = 'canceled'

    @api.one
    def set_signers(self, signer_ids):
        old_signatures = self.request_items
        new_signers = set(signer_ids)
        old_signers = set(map(lambda d: d.partner_id.id, old_signatures))
        if not new_signers == old_signers:
            signers_to_remove = old_signers - new_signers
            signers_to_add = new_signers - old_signers
            signers_in_common = old_signers & new_signers

            ids_to_remove = []
            for sign in old_signatures:
                if sign.partner_id.id in signers_to_remove:
                    ids_to_remove.append(sign.id)
            self.env['signature.request.item'].browse(ids_to_remove).unlink()

            for signer in signers_to_add:
                self.env['signature.request.item'].create({
                    'partner_id': signer,
                    'signature_request': self.id
                })

            return list(signers_in_common)

        return False

    @api.multi
    def get_signers(self):
        signers = self.env['signature.request.item'].search([('signature_request', 'in', self.mapped('id'))])
        signer_ids = map(lambda d: d.partner_id.id, signers)

        signers_data = {}
        for sign_id in signer_ids:
            signers_data[sign_id] = []
        for sri in signers:
            signers_data[sri.partner_id.id].append({
                'id': sri.signature_request.id,
                'name': sri.signature_request.attachment.name,
                'token': sri.access_token,
                'fname': sri.signature_request.attachment.datas_fname
            })
        
        return signers_data

    @api.multi
    def send_signature_accesses(self, ignored_partners=[]):
        signers_data = self.get_signers()
        if len(signers_data) <= 0:
            return

        for ignored in ignored_partners:
            del signers_data[ignored]

        base_context = self.env.context
        template_id = self.env.ref('website_sign.request_sign_template').id
        mail_template = self.env['mail.template'].browse(template_id)

        email_from_usr = self.env.user.partner_id.name
        email_from = str(self.env.user.partner_id.name) + "<" + str(self.env.user.partner_id.email) + ">"

        for signer in signers_data.keys():
            email_to = self.env['res.partner'].browse(signer).email

            docs, links = [], []
            for sign in signers_data[signer]:
                docs.append(sign['name'])
                link = _("sign/document/%s/%s") % (sign['id'], sign['token'])
                links.append([link, sign['fname'].split('.')[:-1][0]])
            docnames = ", ".join(docs)

            template = mail_template.sudo().with_context(base_context,
                email_from_usr = email_from_usr,
                email_from = email_from,
                email_to = email_to,
                docnames = docnames,
                msgbody = self[0].message,
                links = links,
                signature_request = True
            )

            mail_id = template.send_mail(None, force_send=False)
            mail = self.env['mail.mail'].browse(mail_id)
            attachment_ids = list(mail.attachment_ids)
            attachment_ids.append((4, self.attachment.id)) # Could attach more (other attachment next to the document to sign?)
            mail.attachment_ids = attachment_ids
            mail.send(raise_exception=False)

        return True

    @api.one
    def set_as_template(self):
        print "\nTODO\n"
        return

class signature_request_item(models.Model):
    _name = "signature.request.item"
    _description = "Signature Request Information For One Partner"
    _rec_name = 'partner_id'

    partner_id = fields.Many2one('res.partner', 'Partner', required=True)
    signature_request = fields.Many2one('signature.request', ondelete='cascade', required=True, readonly=True)
    signature = fields.Binary()
    # signature_values = fields.One2many('signature.item.value', 'signature_request_item', "Signature Item Values")
    
    signing_date = fields.Date('Signed on', readonly=True)
    # deadline_date = fields.Date(readonly=True)
    state = fields.Selection([
        ("draft", "Draft"),
        ("opened", "Waiting for completion"),
        ("closed", "Completed")
    ], readonly=True)

    def _default_access_token(self):
        return str(uuid.uuid4())
    access_token = fields.Char('Security Token', size=256, required=True, default=_default_access_token, readonly=True)

    signer_name = fields.Char(size=256)
    signer_email = fields.Char(related='partner_id.email')

    @api.one
    def action_draft(self):
        self.signature = None
        self.signing_date = None
        self.access_token = self._default_access_token()
        self.signer_name = ""
        self.state = 'draft'

    @api.one
    def action_opened(self):
        self.state = 'opened'

    @api.one
    def action_closed(self):
        self.signing_date = time.strftime(DEFAULT_SERVER_DATE_FORMAT)
        self.state = 'closed'

    @api.one
    def sign(self, signer, signature):
        self.signer_name = signer

        if not isinstance(signature, dict):
            self.signature = signature
        # else:
        #     value_obj = self.env['signature.item.value']
        #     for itemId in signature:
        #         item_value = value_obj.search([('signature_item.id', '=', itemId), ('signature_request_item.id', '=', self.id)], limit=1)
        #         if not item_value:
        #             item_value = value_obj.create({'signature_item': itemId, 'signature_request_item': self.id})
        #         item_value.setValue(signature[itemId])

        self.signal_workflow('signature_request_item_sign')
        return True

    # TODO : permit edition with this?
    # def write(self, cr, uid, ids, values, context):
    #     tmp = super(signature_request_item, self).write(cr, uid, ids, values, context=context)
    #     if 'partner_id' in values:
    #         self.browse(cr, uid, ids, context=context).reset_to_draft()
    #     return tmp

    # @api.multi
    # def reset_to_draft(self):
    #     self.signal_workflow('signature_request_item_cancel')

    # @api.onchange('partner_id')
    # def _onchange_partner(self):
    #     self.action_draft()

# class signature_item(models.Model):
#     _name = "signature.item"
#     _description = "Signature Field For Document To Sign"

#     signature_request = fields.Many2one('signature.request', required=True)
#     posx = fields.Float(digits=(3, 2), string="Position X", required=True)
#     posy = fields.Float(digits=(3, 2), string="Position Y", required=True)
#     width = fields.Float(digits=(3, 2), required=True)
#     height = fields.Float(digits=(3, 2), required=True)
#     isSignature = fields.Boolean(required=True, string="Signature field", default=False)

# class signature_item_value(models.Model):
#     _name = "signature.item.value"
#     _description = "Signature Field Value For Document To Sign"

#     signature_request_item = fields.Many2one('signature.request.item', required=True)
#     signature_item = fields.Many2one('signature.item', required=True)
#     value = fields.Char()
#     sign_img = fields.Binary('Signature image')

#     @api.one
#     def setValue(self, value):
#         if self.signature_item.isSignature:
#             self.sign_img = value
#         else:
#             self.value = value

#     @api.multi
#     def getByItem(self):
#         d = {}
#         for v in self:
#             d[v.signature_item.id] = v
#         return d