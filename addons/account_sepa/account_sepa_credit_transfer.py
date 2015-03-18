# -*- coding: utf-8 -*-

import re
import time
import random
import base64

from unidecode import unidecode

from openerp import models, fields, api, _
from openerp.tools import float_round
from openerp.exceptions import UserError, ValidationError

''' TODO
    - Improve res.partner.bank
    - Check base_iban is reliable (eg. get_bban_from_iban contains a TODO)
    - Get more informations about this 'generic messages' thing
    - Add bank_account in account_payment and set it onchange_invoice_id / partner_id
    - Ask the community / an audit company to check this module can comply with weird bank practices
    (- Maybe use etree instead of a list to generate the XML file, it's less readable but more extensible)
'''

class account_sepa_credit_transfer(models.TransientModel):
    _name = "account.sepa.credit.transfer"
    _description = "SEPA files generation facilities"

    journal_id = fields.Many2one('account.journal', readonly=True)
    bank_account_id = fields.Many2one('res.partner.bank', readonly=True)
    is_generic = fields.Boolean(readonly=True)

    file = fields.Binary('SEPA XML File', readonly=True)
    filename = fields.Char(string='Filename', size=256, readonly=True)

    @api.model
    def _add_line(self, to_list, indentation, string):
        to_list.append('\t' * indentation + string)

    @api.model
    def _add_lines(self, to_list, indentation, from_list):
        for string in from_list:
            self._add_line(to_list, indentation, string)

    @api.model
    def _prepare_string(self, string):
        """ Make string comply with the recomandations of the EPC. See section 1.4 (Character Set) of document
            'sepa credit transfer scheme customer-to-bank implementation guidelines', issued by The European Payment Council.
        """
        while '//' in string: # No double slash allowed
            string = string.replace('//','/')
        while string.startswith('/'): # No leading slash allowed
            string = string[1:]
        while string.endswith('/'): # No ending slash allowed
            string = string[:-1]
        string = unicode(a, 'UTF-8') # Make sure the string is in UTF-8
        string = unidecode(string) # Try to convert unicode characters to ASCII
        string = re.sub('[^A-Za-z0-9/-?:().,\'+ ]', '', string) # Only keep allowed characters
        return string

    @api.v7
    def create_sepa_credit_transfer(self, cr, uid, payment_ids, context=None):
        payments = self.pool['account.payment'].browse(cr, uid, payment_ids, context=context)
        return self.pool['account.sepa.credit.transfer'].browse(cr, uid, [], context=context).create_sepa_credit_transfer(payments)

    @api.v8
    @api.model
    def create_sepa_credit_transfer(self, payments):
        """ Create a new instance of this model then open a wizard allowing to download the file
        """
        if len(payments) == 0:
            raise osv.except_osv(_('Programming Error'), _("No payment selected."))

        journal = payments[0].journal_id
        if any(payment.journal_id.id != journal.id for payment in payments):
            raise UserError(_("In order to export a SEPA Credit Transfer file, please only select payments belonging to the same bank journal."))

        bank_account = journal.company_id.bank_ids.filtered(lambda r: r.journal_id.id == journal.id)
        if not bank_account:
            raise UserError(_("Configuration Error:\nThere is no bank account recorded for journal '%s'") % journal.name)
        if len(bank_account) > 1:
            raise UserError(_("Configuration Error:\nThere more than one bank accounts linked to journal '%s'") % journal.name)
        if not bank_account.state or not bank_account.state == 'iban':
            raise UserError(_("The account %s, linked to journal '%s', is not of type IBAN.\nA valid IBAN account is required to use SEPA features.") % (bank_account.acc_number, journal.name))
        for payment in payments:
            if not payment.partner_id.bank_ids:
                raise UserError(_("There is no bank account recorded for partner '%s'") % payment.partner_id.name)

        res = self.create({
            'journal_id': journal.id,
            'bank_account_id': bank_account.id,
            'filename': "sct_" + bank_account.acc_number.replace(' ', '') + time.strftime("_%Y-%m-%d") + ".xml",
            'is_generic': self._require_generic_message(journal, payments),
        })

        xml_doc = res._create_pain_001_001_03_document(payments)
        res.file = base64.encodestring(xml_doc)

        payments.write({
            'payment_state': 'done',
            'payment_reference': res.filename,
        })

        # Alternatively, return the id of the transient and use a controller to download the file
        return {
            'type': 'ir.actions.act_window',
            'view_mode': 'form',
            'res_model': 'account.sepa.credit.transfer',
            'target': 'new',
            'res_id': res.id,
        }

    @api.model
    def _require_generic_message(self, journal, payments):
        """ Find out if generating a credit transfer initiation message for payments requires to use the generic rules, as opposed to the standard ones.
            The generic rules are used for payments which are not considered to be standard european credit transfers.
        """
        # A message is generic if :
        debtor_currency = journal.currency and journal.currency.name or journal.company_id.currency_id.name
        if debtor_currency != 'EUR':
            return True # The debtor account is not labelled in EUR
        for payment in payments:
            bank_account = payment.partner_id.bank_ids[0]
            if payment.journal_id.currency and payment.journal_id.currency.name != 'EUR':
                return True # Any transaction in instructed in another currency than EUR
            if not (bank_account.bank_bic or bank_account.bank and bank_account.bank.bic):
                return True # Any creditor agent is not identified by a BIC
            if not bank_account.state or not bank_account.state == 'iban':
                return True # Any creditor account is not identified by an IBAN
        return False

    def _create_pain_001_001_03_document(self, doc_payments):
        """ :param doc_payments: recordset of account.payment to be exported in the XML document returned """
        doc = []

        self._add_line(doc, 0, "<?xml version='1.0' encoding='UTF-8'?>")
        self._add_line(doc, 0, "<Document xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns='urn:iso:std:iso:20022:tech:xsd:pain.001.001.03'>")
        self._add_line(doc, 1, "<CstmrCdtTrfInitn>")

        # Set vars for this block of the XML file (GrpHdr)
        MsgId = str(int(time.time()*100))[-10:]
        MsgId = self.journal_id.company_id.name[-15:] + MsgId
        MsgId = str(random.random()) + MsgId
        MsgId = MsgId[-30:]
        CreDtTm = time.strftime("%Y-%m-%dT%H:%M:%S")
        NbOfTxs = str(len(doc_payments))
        if len(NbOfTxs) > 15:
            raise ValidationError(_("Too many transactions for a single file."))
        CtrlSum = self._get_CtrlSum(doc_payments)
        InitgPty = self._get_InitgPty()

        # Create the XML block
        self._add_line(doc, 2, "<GrpHdr>")
        self._add_line(doc, 3, "<MsgId>" + MsgId + "</MsgId>")
        self._add_line(doc, 3, "<CreDtTm>" + CreDtTm + "</CreDtTm>")
        self._add_line(doc, 3, "<NbOfTxs>" + NbOfTxs + "</NbOfTxs>")
        self._add_line(doc, 3, "<CtrlSum>" + CtrlSum + "</CtrlSum>")
        self._add_lines(doc, 3, InitgPty)
        self._add_line(doc, 2, "</GrpHdr>")

        # Set vars for this block of the XML file (PmtInf)
        PmtInfId = (MsgId + str(self.journal_id.id))[-30:]
        NbOfTxs = str(len(doc_payments))
        CtrlSum = self._get_CtrlSum(doc_payments)
        PmtTpInf = self._get_PmtTpInf()
        ReqExctnDt = time.strftime("%Y-%m-%d")
        Dbtr = self._get_Dbtr()
        DbtrAcct = self._get_DbtrAcct()
        BIC = self.bank_account_id.bank_bic or self.bank_account_id.bank.bic
        if not BIC:
            raise UserError(_("There is no Bank Identifier Code recorded for bank account '%s'") % self.bank_account_id.acc_number)

        # Create the XML block
        self._add_line(doc, 2, "<PmtInf>")
        self._add_line(doc, 3, "<PmtInfId>" + PmtInfId + "</PmtInfId>")
        self._add_line(doc, 3, "<PmtMtd>TRF</PmtMtd>")
        self._add_line(doc, 3, "<BtchBookg>false</BtchBookg>")
        self._add_line(doc, 3, "<NbOfTxs>" + NbOfTxs + "</NbOfTxs>")
        self._add_line(doc, 3, "<CtrlSum>" + CtrlSum + "</CtrlSum>")
        self._add_lines(doc, 3, PmtTpInf)
        self._add_line(doc, 3, "<ReqdExctnDt>" + ReqExctnDt + "</ReqdExctnDt>")
        self._add_lines(doc, 3, Dbtr)
        self._add_lines(doc, 3, DbtrAcct)
        self._add_line(doc, 3, "<DbtrAgt>")
        self._add_line(doc, 4, "<FinInstnId>")
        self._add_line(doc, 5, "<BIC>" + BIC + "</BIC>")
        self._add_line(doc, 4, "</FinInstnId>")
        self._add_line(doc, 3, "</DbtrAgt>")

        # One CdtTrfTxInf per transaction
        for payment in doc_payments:
            self._add_lines(doc, 3, self._get_CdtTrfTxInf(PmtInfId, payment))

        self._add_line(doc, 2, "</PmtInf>")
        self._add_line(doc, 1, "</CstmrCdtTrfInitn>")
        self._add_line(doc, 0, "</Document>")

        return '\n'.join(doc)

    def _get_CtrlSum(self, payments):
        return str(float_round(sum(payment.amount for payment in payments), 2))

    def _get_company_PartyIdentification32(self, org_id=True, postal_address=True):
        """ Returns a PartyIdentification32 element identifying the current journal's company """
        ret = []
        company = self.journal_id.company_id

        name_length = self.is_generic and 35 or 70
        self._add_line(ret, 0, "<Nm>" + company.sepa_initiating_party_name[:name_length] + "</Nm>")

        if postal_address and company.partner_id.city:
            self._add_line(ret, 0, "<PstlAdr>")
            self._add_line(ret, 1, "<AdrTp>BIZZ</AdrTp>")
            if company.partner_id.street:
                self._add_line(ret, 1, "<AdrLine>" + company.partner_id.street + "</AdrLine>")
            if company.partner_id.zip and company.partner_id.city:
                self._add_line(ret, 1, "<AdrLine>" + company.partner_id.zip + " " + company.partner_id.city + "</AdrLine>")
            if company.partner_id.state_id and company.partner_id.state_id.name:
                self._add_line(ret, 1, "<CtrySubDvsn>" + company.partner_id.state_id.name + "</CtrySubDvsn>")
            if company.partner_id.country_id and company.partner_id.country_id.code:
                self._add_line(ret, 1, "<Ctry>" + company.partner_id.country_id.code + "</Ctry>")
            self._add_line(ret, 0, "</PstlAdr>")

        org_id = company._get_ISO_20022_organisation_identification()
        if org_id:
            self._add_line(ret, 0, "<Id>")
            self._add_line(ret, 1, "<OrgId>")
            self._add_line(ret, 2, "<Othr>")
            self._add_line(ret, 3, "<Id>" + org_id['Identification'] + "</Id>")
            self._add_line(ret, 3, "<Issr>" + org_id['Issuer'] + "</Issr>")
            self._add_line(ret, 2, "</Othr>")
            self._add_line(ret, 1, "</OrgId>")
            self._add_line(ret, 0, "</Id>")

        return ret

    def _get_InitgPty(self):
        ret = []
        self._add_line(ret, 0, "<InitgPty>")
        self._add_lines(ret, 1, self._get_company_PartyIdentification32(org_id=True, postal_address=False))
        self._add_line(ret, 0, "</InitgPty>")
        return ret

    def _get_PmtTpInf(self):
        ret = []

        self._add_line(ret, 0, "<PmtTpInf>")
        self._add_line(ret, 1, "<InstrPrty>NORM</InstrPrty>")
        if not self.is_generic:
            self._add_line(ret, 1, "<SvcLvl>")
            self._add_line(ret, 2, "<Cd>SEPA</Cd>")
            self._add_line(ret, 1, "</SvcLvl>")
        self._add_line(ret, 0, "</PmtTpInf>")

        return ret

    def _get_Dbtr(self):
        ret = []
        self._add_line(ret, 0, "<Dbtr>")
        self._add_lines(ret, 1, self._get_company_PartyIdentification32(org_id=lambda: not is_generic, postal_address=True))
        self._add_line(ret, 0, "</Dbtr>")
        return ret

    def _get_DbtrAcct(self):
        ret = []

        Ccy = self.journal_id.currency and self.journal_id.currency.name or self.journal_id.company_id.currency_id.name

        self._add_line(ret, 0, "<DbtrAcct>")
        self._add_line(ret, 1, "<Id>")
        if self.is_generic:
            self._add_line(ret, 2, "<Othr>")
            self._add_line(ret, 3, "<Id>" + self.bank_account_id.get_bban_from_iban()[self.bank_account_id.id] + "</Id>")
            self._add_line(ret, 2, "</Othr>")
        else:
            self._add_line(ret, 2, "<IBAN>" + self.bank_account_id.acc_number.replace(' ', '') + "</IBAN>")
        self._add_line(ret, 1, "</Id>")
        self._add_line(ret, 1, "<Ccy>" + Ccy + "</Ccy>")
        self._add_line(ret, 0, "</DbtrAcct>")

        return ret

    def _get_CdtTrfTxInf(self, PmtInfId, payment):
        ret = []

        # Set vars for this block of the XML file (PmtInf)
        InstrId = payment.invoice_id and payment.invoice_id.number or payment.name
        EndToEndId = (PmtInfId + str(payment.id))[-30:]
        # TODO: requires currency_id in account.payment
        #Ccy = payment.currency_id and payment.currency_id.name or journal.company_id.currency_id.name
        Ccy = self.journal_id.currency and self.journal_id.currency.name or self.journal_id.company_id.currency_id.name
        InstdAmt = str(float_round(payment.amount, 2))
        max_digits = Ccy == 'EUR' and 11 or 15
        if len(re.sub('\.', '', InstdAmt)) > max_digits:
            raise ValidationError(_("The amount of the payment '%s' is too high. The maximum permitted is %s.") % (payment.name, str(9)*(max_digits-3)+".99"))
        ChrgBr = self._get_ChrgBr()
        creditor_bank_account = payment.partner_id.bank_ids[0]
        CdtrAgt = self._get_CdtrAgt(creditor_bank_account)
        Nm = payment.partner_id.name[:70]
        CdtrAcct = self._get_CdtrAcct(creditor_bank_account)
        RmtInf = self._get_RmtInf(payment)

        # Create the XML block
        self._add_line(ret, 0, "<CdtTrfTxInf>")
        self._add_line(ret, 1, "<PmtId>")
        self._add_line(ret, 2, "<InstrId>" + InstrId + "</InstrId>")
        self._add_line(ret, 2, "<EndToEndId>" + EndToEndId + "</EndToEndId>")
        self._add_line(ret, 1, "</PmtId>")
        self._add_line(ret, 1, "<Amt>")
        self._add_line(ret, 2, "<InstdAmt Ccy='" + Ccy + "'>" + InstdAmt + "</InstdAmt>")
        self._add_line(ret, 1, "</Amt>")
        self._add_lines(ret, 1, ChrgBr)
        self._add_lines(ret, 1, CdtrAgt)
        self._add_line(ret, 1, "<Cdtr>")
        self._add_line(ret, 2, "<Nm>" + Nm + "</Nm>")
        self._add_line(ret, 1, "</Cdtr>")
        self._add_lines(ret, 1, CdtrAcct)
        self._add_lines(ret, 1, RmtInf)
        self._add_line(ret, 0, "</CdtTrfTxInf>")

        return ret

    def _get_ChrgBr(self):
        ret = []
        ChrgBr = self.is_generic and "SHAR" or "SLEV"
        self._add_line(ret, 0, "<ChrgBr>" + ChrgBr + "</ChrgBr>")
        return ret

    def _get_CdtrAgt(self, bank_account):
        ret = []

        bank = bank_account.bank
        BIC = bank_account.bank_bic or bank and bank.bic
        if not self.is_generic and not BIC:
            raise UserError(_("There is no Bank Identifier Code recorded for bank account '%s'") % bank_account.acc_number)
        Nm = bank_account.bank_name or bank and bank.name

        self._add_line(ret, 0, "<CdtrAgt>")
        self._add_line(ret, 1, "<FinInstnId>")
        if BIC:
            self._add_line(ret, 2, "<BIC>" + BIC + "</BIC>")
        self._add_line(ret, 3, "<Nm>" + Nm + "</Nm>")
        if bank and bank.street and bank.city and bank.zip and bank.country:
            self._add_line(ret, 2, "<PstlAdr>")
            self._add_line(ret, 3, "<Ctry>" + bank.country.code + "</Ctry>")
            self._add_line(ret, 3, "<AdrLine>" + bank.street + "</AdrLine>")
            self._add_line(ret, 3, "<AdrLine>" + bank.zip + " " + bank.city + "</AdrLine>")
            if bank.state and bank.state.name:
                self._add_line(ret, 3, "<CtrySubDvsn>" + bank.state.name + "</CtrySubDvsn>")
            self._add_line(ret, 2, "</PstlAdr>")
        self._add_line(ret, 1, "</FinInstnId>")
        self._add_line(ret, 0, "</CdtrAgt>")

        return ret

    def _get_CdtrAcct(self, bank_account):
        ret = []

        if not self.is_generic and (not bank_account.state or not bank_account.state == 'iban'):
            raise UserError(_("The account %s, linked to partner '%s', is not of type IBAN.\nA valid IBAN account is required to use SEPA features.") % (bank_account.acc_number, bank_account.partner_id))

        self._add_line(ret, 0, "<CdtrAcct>")
        self._add_line(ret, 1, "<Id>")
        if self.is_generic:
            self._add_line(ret, 2, "<Othr>")
            self._add_line(ret, 3, "<Id>" + bank_account.acc_number + "</Id>")
            self._add_line(ret, 2, "</Othr>")
        else:
            self._add_line(ret, 2, "<IBAN>" + bank_account.acc_number.replace(' ', '') + "</IBAN>")
        self._add_line(ret, 1, "</Id>")
        self._add_line(ret, 0, "</CdtrAcct>")

        return ret

    def _get_RmtInf(self, payment):
        ret = []
        Ustrd = payment.sepa_communication
        if Ustrd:
            self._add_line(ret, 0, "<RmtInf>")
            self._add_line(ret, 1, "<Ustrd>" + Ustrd + "</Ustrd>")
            self._add_line(ret, 0, "</RmtInf>")
        return ret
