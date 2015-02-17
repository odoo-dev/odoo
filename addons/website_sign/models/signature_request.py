# -*- coding: utf-8 -*-
from openerp import models, fields, api, _

from openerp import tools
from openerp import SUPERUSER_ID
from openerp.tools import DEFAULT_SERVER_DATE_FORMAT
import time, uuid, re, StringIO, base64
from pyPdf import PdfFileWriter, PdfFileReader
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

class signature_request_template(models.Model):
    _name = "signature.request.template"
    _description = "Signature Request Template"
    _rec_name = "attachment"

    # FP: Is this PDF document only or any format? Put a help="..."
    attachment = fields.Many2one('ir.attachment', string="Document", required=True, ondelete='cascade')
    signature_items = fields.One2many('signature.item', 'signature_request_template')

    signature_requests = fields.One2many('signature.request', 'template')

    @api.multi
    def go_to_custom_template(self):
        return {
            'name': 'Edit Document To Sign',
            'type': 'ir.actions.act_url',
            'url': '/sign/template/' + str(self[0].id),
            'target': 'self',
        }


class signature_request(models.Model):
    _name = "signature.request"
    _description = "Document To Sign"
    _rec_name = 'template'

    template = fields.Many2one('signature.request.template')

    # FP: I would not put this on this document but on the wizard that sends the email.
    message = fields.Html()

    request_items = fields.One2many('signature.request.item', 'signature_request', 'Signers')

    # I would rename the keys to: draft, sent, signed, canceled
    state = fields.Selection([
        ("draft", "Draft"),
        ("opened", "Sent"),
        ("closed", "Signed"),
        ("canceled", "Canceled")
    ], readonly=True)

    # FP: I don't think we need nb_draft! Remove this field
    nb_draft = fields.Integer(string="Draft Requests", compute="_compute_count", store=True)
    nb_wait = fields.Integer(string="Missing Signatures", compute="_compute_count", store=True)
    nb_closed = fields.Integer(string="Completed Signatures", compute="_compute_count", store=True)

    completed_document = fields.Binary(readonly=True)

    # FP: I change to use the same method for all fields
    @api.one
    @api.depends('request_items.state')
    def _compute_nb_draft(self):
        draft, wait, closed = 0, 0, 0
        for s in self.request_items:
            if s.state == "draft":
                nb_draft += 1
            if s.state == "opened":
                nb_wait += 1
            if s.state == "closed":
                nb_closed += 1
        self.nb_draft = draft
        self.nb_wait = wait
        self.nb_closed = closed

    # FP: you can remove, I merged 3 computations in 1 method
    # FP: self.nb_wait += 1 is not good: it makes several .write in the DB!
    # @api.one
    # @api.depends('request_items.state')
    # def _compute_nb_wait(self):
    #     self.nb_wait = 0
    #     for s in self.request_items:
    #         if s.state == "opened":
    #             self.nb_wait += 1

    # @api.one
    # @api.depends('request_items.state')
    # def _compute_nb_closed(self):
    #     self.nb_closed = 0
    #     for s in self.request_items:
    #         if s.state == "closed":
    #             self.nb_closed += 1

    @api.one
    def action_draft(self):
        self.completed_document = None
        self.state = 'draft'

    @api.one
    def action_opened(self): # TODO -> send from item?
        ignored_partners = []
        for request_item in self.request_items:
            if request_item.state != 'draft':
                ignored_partners.append(request_item.partner_id.id)
        included_request_items = self.request_items.filtered(lambda r: r.partner_id.id not in ignored_partners)
        included_request_items.action_opened()
        if not self.send_signature_accesses(ignored_partners=ignored_partners):
            included_request_items.action_draft() # TODO and warn the user when because of missing role
        self.state = 'opened'

    @api.one
    def action_closed(self):
        self.send_completed_document()
        self.state = 'closed'

    @api.one
    def action_canceled(self):
        self.completed_document = None
        self.request_items.action_draft()
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
                'name': sri.signature_request.template.attachment.name,
                'token': sri.access_token,
                'fname': sri.signature_request.template.attachment.datas_fname
            })
        
        return signers_data

    @api.multi
    def send_signature_accesses(self, ignored_partners=[]):
        signers_data = self.get_signers()
        if len(signers_data) <= 0:
            return False

        roles = self.request_items.mapped('role')
        for item in self.template.signature_items:
            if not item.responsible:
                continue
            if item.responsible not in roles:
                return False

        for ignored in ignored_partners:
            del signers_data[ignored]

        base_context = self.env.context
        template_id = self.env.ref('website_sign.signature_access_mail_template').id
        mail_template = self.env['mail.template'].browse(template_id)

        email_from_usr = self.env.user.partner_id.name
        email_from = str(self.env.user.partner_id.name) + "<" + str(self.env.user.partner_id.email) + ">"

        for signer in signers_data.keys():
            email_to = self.env['res.partner'].browse(signer).email

            docs, links = [], []
            for sign in signers_data[signer]:
                docs.append(sign['name'])
                link = "sign/document/%s/%s" % (sign['id'], sign['token'])
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
            attachment_ids.append((4, self.template.attachment.id))
            mail.attachment_ids = attachment_ids
            mail.send(raise_exception=False)
        return True

    @api.multi
    def send_completed_document(self):
        signers_data = self.get_signers()
        if len(signers_data) <= 0:
            return False

        if not self.completed_document:
            self.generate_completed_document()

        base_context = self.env.context
        template_id = self.env.ref('website_sign.completed_signature_mail_template').id
        mail_template = self.env['mail.template'].browse(template_id)

        email_from_usr = self.env.user.partner_id.name
        email_from = str(self.env.user.partner_id.name) + "<" + str(self.env.user.partner_id.email) + ">"

        for signer in signers_data.keys():
            email_to = self.env['res.partner'].browse(signer).email

            docs, links = [], []
            for sign in signers_data[signer]:
                docs.append(sign['name'])
                link = "/sign/download/%s/%s/completed" % (sign['id'], sign['token'])
                links.append([link, sign['fname'].split('.')[:-1][0]])
            docnames = ", ".join(docs)

            template = mail_template.sudo().with_context(base_context,
                email_from_usr = email_from_usr,
                email_from = email_from,
                email_to = email_to,
                docnames = docnames,
                links = links,
            )

            template.send_mail(None, force_send=True)
        return True

    @api.one
    def generate_completed_document(self):
        if len(self.template.signature_items) <= 0:
            self.completed_document = self.template.attachment.datas
            return True

        old_pdf = PdfFileReader(StringIO.StringIO(base64.b64decode(self.template.attachment.datas)))
        box = old_pdf.getPage(0).mediaBox
        width = box.getUpperRight_x()
        height = box.getUpperRight_y()
        font = "Helvetica"
        fontsize = height/75 # TODO

        packet = StringIO.StringIO()
        can = canvas.Canvas(packet)
        can.setFont(font, fontsize)
        itemsByPage = self.template.signature_items.getByPage()
        for p in range(0, old_pdf.getNumPages()):
            if (p+1) not in itemsByPage:
                can.showPage()
                continue
            items = itemsByPage[p+1]
            for item in items:
                value = item.valueFor(self.id)
                if not value:
                    continue
                if item.type.type == "text":
                    can.drawCentredString(width*(item.posX+item.width/2), height*(1-item.posY)-fontsize, value)
                elif item.type.type == "textarea":
                    lines = value.split('\n')
                    y = height*(1-item.posY)-fontsize
                    for line in lines:
                        can.drawString(width*item.posX, y, line)
                        y -= fontsize*1.5
                elif item.type.type == "signature" or item.type.type == "initial":
                    img = base64.b64decode(value[value.find(',')+1:])
                    can.drawImage(ImageReader(StringIO.StringIO(img)), width*item.posX, height*(1-item.posY-item.height), width*item.width, height*item.height, 'auto', True) 
            can.showPage()
        can.save()

        item_pdf = PdfFileReader(packet)
        new_pdf = PdfFileWriter()

        for p in range(0, old_pdf.getNumPages()):
            page = old_pdf.getPage(p)
            page.mergePage(item_pdf.getPage(p))
            new_pdf.addPage(page)

        output = StringIO.StringIO()
        new_pdf.write(output)
        self.completed_document = base64.b64encode(output.getvalue())
        output.close()

        return True

    @api.one
    def set_as_template(self):
        # TODO add template functionnality
        return

    @api.multi
    def go_to_sign_document(self):
        return {
            'name': 'Document to Sign',
            'type': 'ir.actions.act_url',
            'url': '/sign/document/' + str(self[0].id) + '?viewmode=1',
            'target': 'self',
        }

    @api.multi
    def get_completed_document(self):
        if not self.completed_document:
            self.generate_completed_document()

        return {
            'name': 'Signed Document',
            'type': 'ir.actions.act_url',
            'url': '/sign/download/%s/%s/completed' % (self[0].id, self[0].request_items[0].access_token),
            'target': 'self',
        }

class signature_request_item(models.Model):
    _name = "signature.request.item"
    _description = "Signature Request"
    _rec_name = 'partner_id'

    partner_id = fields.Many2one('res.partner', 'Partner', required=True, ondelete='cascade')

    # FP: Why is this readonly? In the view maybe, but not in the object
    signature_request = fields.Many2one('signature.request', ondelete='cascade', required=True, readonly=True)
    signature = fields.Binary()

    signing_date = fields.Date('Signed on', readonly=True)
    # FP: rename closed into completed, opened into to do
    state = fields.Selection([
        ("draft", "Draft"),
        ("opened", "Waiting for completion"),
        ("closed", "Completed")
    ], readonly=True, default="draft")

    # FP: Remove size=256, it's usually much lower than 256, better not put a size
    def _default_access_token(self):
        return str(uuid.uuid4())
    access_token = fields.Char('Security Token', size=256, required=True, default=_default_access_token, readonly=True)

    # FP: Do we need those fields?
    signer_name = fields.Char(size=256)
    signer_email = fields.Char(related='partner_id.email')

    role = fields.Many2one('signature.item.party', string="Role")

    @api.one
    def action_draft(self):
        self.signature = None
        self.signing_date = None
        self.access_token = self._default_access_token()
        self.signer_name = ""
        for item in self.signature_request.template.signature_items:
            if item.responsible == self.role or not item.responsible:
                item.values.resetFor(self.signature_request.id)
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
        else:
            for itemId in signature:
                item_value = self.env['signature.item.value'].search([('signature_item', '=', int(itemId)), ('signature_request', '=', self.signature_request.id)])
                if not item_value:
                    item_value = self.env['signature.item.value'].create({'signature_item': int(itemId), 'signature_request': self.signature_request.id})
                item_value.value = signature[itemId]

        self.action_closed()
        return True

# FP: I don't think it's correct to inherit mail.message. The template should CALL
# FP: message with the right arguments directly. Remove this
class signature_mail_message(models.Model):
    _inherit = "mail.message"

    def _message_read_dict_postprocess(self, cr, uid, messages, message_tree, context=None):
        result = super(signature_mail_message, self)._message_read_dict_postprocess(cr, uid, messages, message_tree, context=context)

        # Calculate total requested and signed on specific attachment
        sign_obj = self.pool.get('signature.request.item').search(cr, uid, [], context=context)
        request_items = self.pool.get('signature.request.item').browse(cr, SUPERUSER_ID, sign_obj)
        doc_data = {}
        for request_item in request_items:
            if request_item.signature_request.template.attachment.id not in doc_data:
                doc_data[request_item.signature_request.template.attachment.id] = {'nb_signed': 0, 'nb_toSign': 0}

            doc_data[request_item.signature_request.template.attachment.id]['nb_toSign'] += 1
            if request_item.state == 'closed':
                doc_data[request_item.signature_request.template.attachment.id]['nb_signed'] += 1
            doc_data[request_item.signature_request.template.attachment.id]['signature_request'] = request_item.signature_request.id

        # Update message dictionaries (attach)
        for message_dict in messages:
            attachment_ids = message_dict.get('attachment_ids')
            for attachment in attachment_ids:
                if attachment['id'] in doc_data:
                    attachment.update(doc_data[attachment['id']])

        return result

    # TODO should include a message with 'a signature request could be sent to you later' ?
    def create(self, cr, uid, values, context=None):
        tmp = super(signature_mail_message, self).create(cr, uid, values, context=context)
        if 'signature_request' not in context:
            mess = self.pool.get("mail.message").browse(cr, uid, [tmp], context=context)
            signature_request = self.pool.get("signature.request").search(cr, uid, [("template.attachment.id", "in", map(lambda d: d.id, mess.attachment_ids))], context=context)
            signature_request = self.pool.get("signature.request").browse(cr, uid, signature_request, context=context)
            signature_request.write({'message': mess.body})
        return tmp

# FP: can we remove this helper function? no need, it's just one write
# FP: moreover, it's old API
class ir_attachment(models.Model):
    _inherit = 'ir.attachment'

    def set_name_and_description(self, cr, uid, id, name, description, context=None):
        attach = self.browse(cr, uid, [id], context=context)
        attach.write({'name': name, 'description': description})
