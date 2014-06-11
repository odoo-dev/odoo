# -*- coding: utf-8 -*-
import uuid,re

from openerp import tools
from openerp import SUPERUSER_ID
from openerp.osv import osv, orm, fields
from openerp.tools.translate import _

class prepare_signers(osv.Model):
    _inherit = "mail.compose.message"

    def get_mail_values(self, cr, uid, wizard, res_ids, context=None):
        attachment_ids = [attach.id for attach in wizard.attachment_ids]
        ir_attachment_signature = self.pool.get('ir.attachment.signature')
        signer_obj = ir_attachment_signature.search(cr, uid, [('document_id', 'in', attachment_ids)], context=context)
        signers = ir_attachment_signature.browse(cr, SUPERUSER_ID, signer_obj)
        signer_ids = map(lambda d: d.partner_id.id, signers)

        signers_data = {}
        for sign_id in signer_ids:
            signers_data[sign_id] = []
            for doc in signers:
                if sign_id == doc.partner_id.id:
                    signers_data[sign_id].append({'id': doc.document_id.id,'name': doc.document_id.name, 'token': doc.access_token, 'fname': doc.document_id.datas_fname})
        if signers_data:
            context.update({'signers_data': signers_data})
        return super(prepare_signers, self).get_mail_values(cr, uid, wizard, res_ids, context=context)

class preprocess_attachment(osv.Model):
    _inherit = "mail.message"

    def _message_read_dict_postprocess(self, cr, uid, messages, message_tree, context=None):
        """ Post-processing on values given by message_read. This method will
            handle partners in batch to avoid doing numerous queries.

            :param list messages: list of message, as get_dict result
            :param dict message_tree: {[msg.id]: msg browse record}
        """
        res_partner_obj = self.pool.get('res.partner')
        ir_attachment_obj = self.pool.get('ir.attachment')
        pid = self.pool['res.users'].browse(cr, SUPERUSER_ID, uid, context=context).partner_id.id

        # 1. Aggregate partners (author_id and partner_ids) and attachments
        partner_ids = set()
        attachment_ids = set()
        for key, message in message_tree.iteritems():
            if message.author_id:
                partner_ids |= set([message.author_id.id])
            if message.subtype_id and message.notified_partner_ids:  # take notified people of message with a subtype
                partner_ids |= set([partner.id for partner in message.notified_partner_ids])
            elif not message.subtype_id and message.partner_ids:  # take specified people of message without a subtype (log)
                partner_ids |= set([partner.id for partner in message.partner_ids])
            if message.attachment_ids:
                attachment_ids |= set([attachment.id for attachment in message.attachment_ids])
        # Read partners as SUPERUSER -> display the names like classic m2o even if no access
        partners = res_partner_obj.name_get(cr, SUPERUSER_ID, list(partner_ids), context=context)
        partner_tree = dict((partner[0], partner) for partner in partners)

        # calculate total requested and signed on specific attachment.
        sign_obj = self.pool.get('ir.attachment.signature').search(cr, uid, [('document_id', 'in', list(attachment_ids))], context=context)
        req_ids = self.pool.get('ir.attachment.signature').browse(cr, SUPERUSER_ID, sign_obj)
        req_doc_ids = map(lambda d: d.document_id.id, req_ids)
        doc_data = {}
        for doc_id in req_doc_ids:
            doc_count = []
            doc_state = []
            for ids in req_ids:
                if doc_id == ids.document_id.id:
                    doc_count.append(doc_id)
                    if ids.state == 'closed':
                        doc_state.append(ids.state)
                doc_data[doc_id] = {'signed': len(doc_state), 'count': len(doc_count)}

        # 2. Attachments as SUPERUSER, because could receive msg and attachments for doc uid cannot see
        attachments = ir_attachment_obj.read(cr, SUPERUSER_ID, list(attachment_ids), ['id', 'datas_fname', 'name', 'file_type_icon'], context=context)
        attachments_tree = dict((attachment['id'], {
            'id': attachment['id'],
            'filename': attachment['datas_fname'],
            'name': attachment['name'],
            'file_type_icon': attachment['file_type_icon'],
        }) for attachment in attachments)

        #add attachment data(count and draft state) into main attachment tree
        for item in doc_data:
            if item in attachments_tree:
                for leaf in doc_data[item]:
                    attachments_tree[item][leaf] = doc_data[item][leaf]
            else:
                attachments_tree[item] = doc_data[item]

        # 3. Update message dictionaries
        for message_dict in messages:
            message_id = message_dict.get('id')
            message = message_tree[message_id]
            if message.author_id:
                author = partner_tree[message.author_id.id]
            else:
                author = (0, message.email_from)
            partner_ids = []
            if message.subtype_id:
                partner_ids = [partner_tree[partner.id] for partner in message.notified_partner_ids
                               if partner.id in partner_tree]
            else:
                partner_ids = [partner_tree[partner.id] for partner in message.partner_ids
                               if partner.id in partner_tree]
            attachment_ids = []
            for attachment in message.attachment_ids:
                if attachment.id in attachments_tree:
                    attachment_ids.append(attachments_tree[attachment.id])
            message_dict.update({
                'is_author': pid == author[0],
                'author_id': author,
                'partner_ids': partner_ids,
                'attachment_ids': attachment_ids,
                'user_pid': pid
                })
        return True

class website_sign(osv.Model):
    _inherit = 'mail.notification'

    def get_partners_to_email(self, cr, uid, ids, message, context=None):
        """ Return the list of partners to notify, based on their preferences.

            :param browse_record message: mail.message to notify
            :param list partners_to_notify: optional list of partner ids restricting
                the notifications to process
        """
        notify_pids = []
        for notification in self.browse(cr, uid, ids, context=context):
            if notification.read:
                continue
            partner = notification.partner_id
            # Do not send to partners without email address defined
            if not partner.email:
                continue
            # Do not send to partners having same email address than the author (can cause loops or bounce effect due to messy database)
            if message.author_id and message.author_id.email == partner.email:
                if not context.get('notify_author'):
                    continue
            # Partner does not want to receive any emails or is opt-out
            if partner.notify_email == 'none':
                continue
            notify_pids.append(partner.id)
        return notify_pids

    def _notify(self, cr, uid, message_id, partners_to_notify=None, context=None, force_send=False, user_signature=True):
        if context.get('signers_data'):
            for ids in context.get('signers_data'):
                super(website_sign, self)._notify(cr, uid, message_id, partners_to_notify=[int(ids)], context=context, force_send=force_send, user_signature=user_signature)
        else:
            super(website_sign, self)._notify(cr, uid, message_id, partners_to_notify=partners_to_notify, context=context, force_send=force_send, user_signature=user_signature)

    def _notify_email(self, cr, uid, ids, message_id, force_send=False, user_signature=True, context=None):
        message = self.pool['mail.message'].browse(cr, uid, message_id, context=context)
        sign_pool = self.pool['ir.attachment.signature']
        attachment_pool = self.pool['ir.attachment']
        partner_pool = self.pool['res.partner']

        # compute partners
        email_pids = self.get_partners_to_email(cr, uid, ids, message, context=context)
        if not email_pids:
            return True

        # compute epartners_to_notify mail body (signature, company data)
        if context.get('signers_data'):
            local_context = context.copy()
            local_context['email_from_usr'] = re.sub('<.*>','',message.email_from)
            local_context['email_from'] = message.email_from
            docs, links = [], []
            signers_data = context.get('signers_data')
            template_id = self.pool['ir.model.data'].get_object_reference(cr, uid, 'website_sign', 'request_sign_template')[1]
            email_to = partner_pool.search_read(cr, uid, [('id', '=', email_pids[0])], ['email'],context=context)[0]
            local_context['email_to'] = email_to['email']
            for signer_ids in signers_data:
                if email_pids[0] == int(signer_ids):
                    for signers in signers_data[signer_ids]:
                        docs.append(signers['name'])
                        res_id = attachment_pool.search_read(cr, uid, [('id', '=', signers['id'])], ['res_id'], context=context)[0]
                        link = _("sign/document/%s/%s") % (signers['id'], signers['token'])
                        links.append([link, signers['fname'].split('.')[:-1][0]])
            local_context['docnames'] = ", ".join(docs)
            local_context['msgbody'] = message.body
            local_context['links'] = links
            sign_template = self.pool['email.template'].generate_email_batch(cr, uid, template_id, [res_id['res_id']], context=local_context)
            body_html = sign_template[res_id['res_id']]['body_html']
        else:
            body_html = message.body

        user_id = message.author_id and message.author_id.user_ids and message.author_id.user_ids[0] and message.author_id.user_ids[0].id or None
        if user_signature:
            signature_company = self.get_signature_footer(cr, uid, user_id, res_model=message.model, res_id=message.res_id, context=context)
            body_html = tools.append_content_to_html(body_html, signature_company, plaintext=False, container_tag='div')

        # compute email references
        references = message.parent_id.message_id if message.parent_id else False

        # create email values
        mail_values = {
            'mail_message_id': message.id,
            'auto_delete': True,
            'body_html': body_html,
            'recipient_ids': [(4, id) for id in email_pids],
            'references': references,
        }
        email_notif_id = self.pool.get('mail.mail').create(cr, uid, mail_values, context=context)
        if force_send:
            self.pool.get('mail.mail').send(cr, uid, [email_notif_id], context=context)
        return True

class ir_attachment(osv.Model):
    _inherit = 'ir.attachment'
    _columns = {
        'signature_ids': fields.one2many('ir.attachment.signature', 'document_id', 'Signatures')
    }

class ir_attachment_signature(osv.Model):
    _name = "ir.attachment.signature"
    _description = "Signature For Attachments"
    _columns = {
        'partner_id' : fields.many2one('res.partner', 'Partner'),
        'document_id' : fields.many2one('ir.attachment', 'Attachment', ondelete='cascade'),
        'sign': fields.binary('Signature'),
        'date': fields.date('Creation Date', help="Date of requesting Signature."),
        'signing_date': fields.date('Creation Date', help="Date of signing Attachment ."),
        'deadline_date': fields.date('Creation Date', readonly=True, select=True, help="Deadline to sign Attachment."),
        'state': fields.selection([
            ('draft', 'To be signed'),
            ('closed', 'Signed'),
            ('cancelled', 'Cancelled'),
        ]),
        'access_token': fields.char('Security Token', size=256, required=True),
        'signer_name': fields.char('Signer Name', size=256),
    }
    _defaults = {
        'access_token': lambda self, cr, uid, ctx={}: str(uuid.uuid4())
    }
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
