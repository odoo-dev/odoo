# -*- coding: utf-8 -*-

import re
import time
import random

from unidecode import unidecode

from openerp import models, fields, api, _
from openerp.tools import float_round
from openerp.exceptions import UserError, ValidationError

# TransientModel ? Doit pouvoir ^etre étendu, garder un état interne et potentiellement proposer un wizard
# Pour l'extensibilité, diviser _create_pain_001_001_03_document en une myriade de petites méthodes ?
# Message "generic": _require_generic() ? Puis des if un peu partout ?

class account_sepa(models.TransientModel):
    _name = "account.sepa"
    _description = "SEPA files generation facilities"

    def _add_line(self, to_list, indentation, string):
        to_list.append('\t' * indentation + string)

    def _add_lines(self, to_list, indentation, from_list):
        for string in from_list:
            self._add_line(to_list, indentation, string)

    def _group_payments_by_journal(self, payment_recs):
        """ Return a list of account.payment recordsets, one for each journal """
        journal_ids = list(set(map(lambda r: r.journal_id.id, payment_recs)))
        return map(lambda journal_id: payment_recs.filtered(lambda r: r.journal_id.id == journal_id), journal_ids)

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
        # Without third-party module but not perfect (eg. will drop œ or €) :
        # return unicodedata.normalize('NFD', unicode(string, 'UTF-8')).encode('ascii', 'ignore')

    @api.v7
    def create_sepa_ct(self, cr, uid, payment_ids, context=None):
        payment_recs = self.pool['account.payment'].browse(cr, uid, payment_ids, context=context)
        self.pool['account.sepa'].browse(cr, uid, [], context=context).create_sepa_ct(payment_recs)

    @api.v8
    def create_sepa_ct(self, payment_recs):
        # One file per recipient financial institution
        for recordset in self._group_payments_by_journal(payment_recs):
            print self._create_pain_001_001_03_document(recordset)

    def _require_generic_message(self, payments):
        """ Find out if generating a credit transfer initiation message for payments requires to use the generic rules, as opposed to the standard ones.
            The generic rules are used for payments which are not considered to be standard european credit transfers.
        """
        return False

    def _create_pain_001_001_03_document(self, doc_payments):
        """ :param doc_payments: recordset of account.payment to be exported in the XML document returned """
        if len(doc_payments) < 0:
            raise osv.except_osv(_('Programming Error'), _("No payment selected."))

        doc = []
        is_generic = self._require_generic_message(doc_payments)

        MsgId = str(int(time.time()*100))[-10:]
        MsgId = self.env.user.company_id.name[-15:] + MsgId
        MsgId = str(random.random()) + MsgId
        MsgId = MsgId[-30:]
        CreDtTm = time.strftime("%Y-%m-%dT%H:%M:%S")
        NbOfTxs = str(len(doc_payments))
        if len(NbOfTxs) > 15:
            raise ValidationError(_("Too many transactions for a single file."))
        CtrlSum = self._get_CtrlSum(doc_payments)
        Nm = self.env.user.company_id.sepa_initiating_party_name[:70]

        self._add_line(doc, 0, "<?xml version='1.0' encoding='UTF-8'?>")
        self._add_line(doc, 0, "<Document xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns='urn:iso:std:iso:20022:tech:xsd:pain.001.001.03'>")
        self._add_line(doc, 1, "<CstmrCdtTrfInitn>")
        self._add_line(doc, 2, "<GrpHdr>")
        self._add_line(doc, 3, "<MsgId>" + MsgId + "</MsgId>")
        self._add_line(doc, 3, "<CreDtTm>" + CreDtTm + "</CreDtTm>")
        self._add_line(doc, 3, "<NbOfTxs>" + NbOfTxs + "</NbOfTxs>")
        self._add_line(doc, 3, "<CtrlSum>" + CtrlSum + "</CtrlSum>")
        self._add_line(doc, 3, "<InitgPty>")
        self._add_lines(doc, 4, self._get_company_PartyIdentification32(is_generic, org_id=True, postal_address=False))
        self._add_line(doc, 3, "</InitgPty>")
        self._add_line(doc, 2, "</GrpHdr>")

        # One PmtInf per bank account
        for acc_payments in self._group_payments_by_journal(doc_payments):
            PmtInfId = (MsgId + str(acc_payments[0].journal_id.id))[-30:] # or account IBAN
            NbOfTxs = str(len(acc_payments))
            CtrlSum = self._get_CtrlSum(acc_payments)
            BIC = "TODO" # TODO

            self._add_line(doc, 2, "<PmtInf>")
            self._add_line(doc, 3, "<PmtInfId>" + PmtInfId + "</PmtInfId>")
            self._add_line(doc, 3, "<PmtMtd>TRF</PmtMtd>") # TODO (if CHK, generic)
            self._add_line(doc, 3, "<BtchBookg>false</BtchBookg>") # TODO
            self._add_line(doc, 3, "<NbOfTxs>" + NbOfTxs + "</NbOfTxs>")
            self._add_line(doc, 3, "<CtrlSum>" + CtrlSum + "</CtrlSum>")
            self._add_line(doc, 3, "<Dbtr>")
            self._add_lines(doc, 4, self._get_company_PartyIdentification32(is_generic, org_id=lambda: not is_generic, postal_address=True))
            self._add_line(doc, 3, "</Dbtr>")
            self._add_line(doc, 3, "<DbtrAcct>")
            self._add_lines(doc, 4, self._get_DbtrAcct(is_generic))
            self._add_line(doc, 3, "</DbtrAcct>")
            self._add_line(doc, 3, "<DbtrAgt>")
            self._add_line(doc, 4, "<FinInstnId>")
            self._add_line(doc, 5, "<BIC>" + BIC + "</BIC>")
            self._add_line(doc, 4, "</FinInstnId>")
            self._add_line(doc, 3, "</DbtrAgt>")

            # One CdtTrfTxInf per transaction
            for payments in acc_payments:
                InstrId = "TODO" # Used in the debtor bank for reporting and bank statements
                EndToEndId = (PmtInfId + str(payments.id))[-30:]
                InstdAmt = str(float_round(payments.amount, 2))
                if len(payments.partner_id.bank_ids) <= 0:
                    raise UserError(_("There is no bank account recorded for partner '%s'") % payments.partner_id.name)
                partner_bank = payments.partner_id.bank_ids[0] # TODO
                BIC = partner_bank.bank_bic
                Nm = payments.partner_id.name[:70]
                IBAN = partner_bank.state == "iban" and partner_bank.acc_number or 'TODO'

                self._add_line(doc, 3, "<CdtTrfTxInf>")
                self._add_line(doc, 4, "<PmtId>")
                self._add_line(doc, 5, "<InstrId>" + InstrId + "</InstrId>")
                self._add_line(doc, 5, "<EndToEndId>" + EndToEndId + "</EndToEndId>")
                self._add_line(doc, 4, "</PmtId>")
                self._add_line(doc, 4, "<Amt>")
                self._add_line(doc, 5, "<InstdAmt>" + InstdAmt + "</InstdAmt>")
                self._add_line(doc, 4, "</Amt>")
                if BIC:
                    self._add_line(doc, 4, "<CdtrAgt>")
                    self._add_line(doc, 5, "<FinInstnId>")
                    self._add_line(doc, 6, "<BIC>" + BIC + "</BIC>")
                    self._add_line(doc, 5, "</FinInstnId>")
                    self._add_line(doc, 4, "</CdtrAgt>")
                self._add_line(doc, 4, "<Cdtr>")
                self._add_line(doc, 5, "<Nm>" + Nm + "</Nm>")
                self._add_line(doc, 4, "</Cdtr>")
                self._add_line(doc, 4, "<CdtrAcct>")
                self._add_line(doc, 5, "<Id>")
                self._add_line(doc, 6, "<IBAN>" + IBAN + "<IBAN>")
                self._add_line(doc, 5, "</Id>")
                self._add_line(doc, 4, "</CdtrAcct>")
                self._add_line(doc, 3, "</CdtTrfTxInf>")

            self._add_line(doc, 2, "</PmtInf>")
        self._add_line(doc, 1, "</CstmrCdtTrfInitn>")
        self._add_line(doc, 0, "</Document>")
        return '\n'.join(doc)

    def _get_CtrlSum(self, payment_recs):
        return str(float_round(sum(payment.amount for payment in payment_recs), 2))

    def _get_company_PartyIdentification32(self, is_generic, org_id=True, postal_address=True):
        """ Returns a PartyIdentification32 element identifying the current user's company """
        ret = []
        company = self.env.user.company_id

        name_length = is_generic and 35 or 70
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

    def _get_DbtrAcct(self, is_generic):
        ret = []

        # If is_generic, IBAN required
        # else use BBAN

        self._add_line(doc, 0, "<Id>")
        self._add_line(doc, 1, "<IBAN>" + "TODO" + "<IBAN>")
        self._add_line(doc, 0, "</Id>")

        return ret
