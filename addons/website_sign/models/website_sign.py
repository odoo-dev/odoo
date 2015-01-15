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
        sign_obj = self.pool.get('ir.attachment.signature').search(cr, uid, [], context=context)
        signatures = self.pool.get('ir.attachment.signature').browse(cr, SUPERUSER_ID, sign_obj)
        doc_data = {}
        for signature in signatures:
            if signature.document_id.id not in doc_data:
                doc_data[signature.document_id.id] = {'nb_signed': 0, 'nb_toSign': 0}

            doc_data[signature.document_id.id]['nb_toSign'] += 1
            if signature.state == 'closed':
                doc_data[signature.document_id.id]['nb_signed'] += 1

        # Update message dictionaries (attach)
        for message_dict in messages:
            attachment_ids = message_dict.get('attachment_ids')
            for attachment in attachment_ids:
                if attachment['id'] in doc_data:
                    attachment.update(doc_data[attachment['id']])

        return result

    @api.one
    def send_signature_accesses(self, attachment_ids=None, ignored_partners=[]):
        if attachment_ids == None:
            attachment_ids = map(lambda d: d.id, self.attachment_ids)

        # Get signers data
        signers = self.env['ir.attachment.signature'].search([('document_id', 'in', attachment_ids)])
        signer_ids = map(lambda d: d.partner_id.id, signers)

        signers_data = {}
        for sign_id in signer_ids:
            signers_data[sign_id] = []
        for doc in signers:
            signers_data[doc.partner_id.id].append({'id': doc.document_id.id,'name': doc.document_id.name, 'token': doc.access_token, 'fname': doc.document_id.datas_fname})
        
        if len(signers_data) <= 0:
            return

        # Exclude some signers
        for ignored in ignored_partners:
            del signers_data[ignored]

        # Send mail to not-excluded signers
        base_context = self.env.context
        template_id = self.env.ref('website_sign.request_sign_template').id
        mail_template = self.env['mail.template'].browse([template_id])

        email_from_usr = self.author_id.name
        email_from = str(self.author_id.name) + "<" + str(self.author_id.email) + ">"

        for signer in signers_data.keys():
            email_to = self.env['res.partner'].search([('id', '=', signer)], limit=1).email

            docs, links = [], []
            for sign in signers_data[signer]:
                docs.append(sign['name'])
                link = _("sign/document/%s/%s") % (sign['id'], sign['token'])
                links.append([link, sign['fname'].split('.')[:-1][0]])
            docnames = ", ".join(docs)

            template = mail_template.with_context(base_context,
                email_from_usr = email_from_usr,
                email_from = email_from,
                email_to = email_to,
                docnames = docnames,
                msgbody = self.body,
                links = links
            )

            template.send_mail(None, force_send=True)

        return True

    def create(self, cr, uid, values, context=None):
        tmp = super(signature_mail_message, self).create(cr, uid, values, context=context)
        mess = self.pool.get("mail.message").browse(cr, uid, [tmp], context=context)
        mess.send_signature_accesses()
        return tmp

class ir_attachment(models.Model):
    _inherit = 'ir.attachment'

    signature_ids = fields.One2many('ir.attachment.signature', 'document_id', 'Signatures')

    @api.one
    def set_signers(self, signer_ids):
        vals = {}
        old_signatures = self.signature_ids
        new_signers = set(signer_ids)
        old_signers = set(map(lambda d: d['partner_id']['id'], old_signatures))
        if not new_signers == old_signers:
            signers_to_remove = old_signers - new_signers
            signers_to_add = new_signers - old_signers
            signers_in_common = old_signers & new_signers

            ids_to_remove = []
            for sign in old_signatures:
                if sign.partner_id.id in signers_to_remove:
                    ids_to_remove.append(sign.id)
            self.env['ir.attachment.signature'].browse(ids_to_remove).unlink()

            for signer in signers_to_add:
                vals['partner_id'] = signer
                vals['document_id'] = self.id
                vals['state'] = 'draft'
                vals['date'] = time.strftime(DEFAULT_SERVER_DATE_FORMAT)
                self.env['ir.attachment.signature'].create(vals)

            return list(signers_in_common)

        return False

    def set_name_and_description(self, cr, uid, id, name, description, context=None):
        attach = self.browse(cr, uid, [id], context=context)
        attach.write({'name': name, 'description': description})

class ir_attachment_signature(models.Model):
    _name = "ir.attachment.signature"
    _description = "Signature For Attachments"

    partner_id = fields.Many2one('res.partner', 'Partner')
    document_id = fields.Many2one('ir.attachment', 'Attachment', ondelete='cascade')
    signature = fields.Binary('Signature')
    date = fields.Date('Creation Date', help="Date of requesting Signature.")
    signing_date = fields.Date('Creation Date', help="Date of signing Attachment .")
    deadline_date = fields.Date('Creation Date', readonly=True, select=True, help="Deadline to sign Attachment.")
    state = fields.Selection([
        ('draft', 'To be signed'),
        ('closed', 'Signed'),
        ('cancelled', 'Cancelled'),
    ])
    access_token = fields.Char('Security Token', size=256, required=True, default=(lambda self: str(uuid.uuid4())))
    signer_name = fields.Char('Signer Name', size=256)

    @api.one
    def sign(self, signer, signature):
        self.write({'state': 'closed', 'signing_date': time.strftime(DEFAULT_SERVER_DATE_FORMAT), 'signature': signature, 'signer_name': signer})
