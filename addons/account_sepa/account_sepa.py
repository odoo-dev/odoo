# -*- coding: utf-8 -*-

import re
import time
import random

from unidecode import unidecode

from openerp import models, fields, api, _
from openerp.tools import float_round
from openerp.exceptions import UserError, ValidationError

# TransientModel ? Doit pouvoir ^etre étendu, garder un état interne et potentiellement proposer un wizard
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
        """ Generate one pain.001.001.03 file per recipient financial institution.
            In Odoo, we consider 1 recipient FI ≘ 1 bank journal ≘ 1 bank account, so each file will contain only 1 <PmtInf> block.
        """
        for recordset in self._group_payments_by_journal(payment_recs):
            print self._create_pain_001_001_03_document(recordset)

    def _require_generic_message(self, payments):
        """ Find out if generating a credit transfer initiation message for payments requires to use the generic rules, as opposed to the standard ones.
            The generic rules are used for payments which are not considered to be standard european credit transfers.
        """
        for payment in payments:
            if payment.journal_id.currency and payment.journal_id.currency.name != 'EUR':
                return True
            # target bank nas no bic, return True
            # target bank nas no iban, return True
        return False

    def _create_pain_001_001_03_document(self, doc_payments):
        """ :param doc_payments: recordset of account.payment to be exported in the XML document returned """
        if len(doc_payments) < 0:
            raise osv.except_osv(_('Programming Error'), _("No payment selected."))

        # Set vars that will be useful troughout the file generation
        doc = []
        is_generic = self._require_generic_message(doc_payments)
        journal = doc_payments[0].journal_id
        debtor_bank_account = journal.company_id.bank_ids.filtered(lambda r: r.journal_id.id == journal.id)
        if not debtor_bank_account:
            raise UserError(_("Configuration Error:\nThere is no bank account recorded for journal '%s'") % journal.name)
        if len(debtor_bank_account) > 1:
            raise UserError(_("Configuration Error:\nThere more than one bank accounts linked to journal '%s'") % journal.name)
        if not debtor_bank_account.state or not debtor_bank_account.state == 'iban':
            raise UserError(_("The account %s, linked to journal '%s', is not of type IBAN.\nA valid IBAN account is required to use SEPA features.") % (debtor_bank_account.acc_number, journal.name))

        # Set vars for this block of the XML file (GrpHdr)
        MsgId = str(int(time.time()*100))[-10:]
        MsgId = self.env.user.company_id.name[-15:] + MsgId
        MsgId = str(random.random()) + MsgId
        MsgId = MsgId[-30:]
        CreDtTm = time.strftime("%Y-%m-%dT%H:%M:%S")
        NbOfTxs = str(len(doc_payments))
        if len(NbOfTxs) > 15:
            raise ValidationError(_("Too many transactions for a single file."))
        CtrlSum = self._get_CtrlSum(doc_payments)
        InitgPty = self._get_InitgPty(journal, is_generic)

        # Create the XML block
        self._add_line(doc, 0, "<?xml version='1.0' encoding='UTF-8'?>")
        self._add_line(doc, 0, "<Document xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns='urn:iso:std:iso:20022:tech:xsd:pain.001.001.03'>")
        self._add_line(doc, 1, "<CstmrCdtTrfInitn>")
        self._add_line(doc, 2, "<GrpHdr>")
        self._add_line(doc, 3, "<MsgId>" + MsgId + "</MsgId>")
        self._add_line(doc, 3, "<CreDtTm>" + CreDtTm + "</CreDtTm>")
        self._add_line(doc, 3, "<NbOfTxs>" + NbOfTxs + "</NbOfTxs>")
        self._add_line(doc, 3, "<CtrlSum>" + CtrlSum + "</CtrlSum>")
        self._add_line(doc, 3, "<InitgPty>")
        self._add_lines(doc, 4, InitgPty)
        self._add_line(doc, 3, "</InitgPty>")
        self._add_line(doc, 2, "</GrpHdr>")

        # One PmtInf per bank account (NB: loop could be removed, see docset of create_sepa_ct)
        for acc_payments in self._group_payments_by_journal(doc_payments):

            # Set vars for this block of the XML file (PmtInf)
            PmtInfId = (MsgId + str(journal.id))[-30:]
            NbOfTxs = str(len(acc_payments))
            CtrlSum = self._get_CtrlSum(acc_payments)
            PmtTpInf = self._get_PmtTpInf(is_generic)
            Dbtr = self._get_DbtrAgt(journal, is_generic)
            DbtrAcct = self._get_DbtrAcct(is_generic, debtor_bank_account)
            BIC = debtor_bank_account.bank_bic or debtor_bank_account.bank.bic
            if not BIC:
                raise UserError(_("There is no Bank Identifier Code recorded for bank account '%s'") % debtor_bank_account.acc_number)

            # Create the XML block
            self._add_line(doc, 2, "<PmtInf>")
            self._add_line(doc, 3, "<PmtInfId>" + PmtInfId + "</PmtInfId>")
            self._add_line(doc, 3, "<PmtMtd>TRF</PmtMtd>") # TODO (if CHK, generic)
            self._add_line(doc, 3, "<BtchBookg>false</BtchBookg>") # TODO
            self._add_line(doc, 3, "<NbOfTxs>" + NbOfTxs + "</NbOfTxs>")
            self._add_line(doc, 3, "<CtrlSum>" + CtrlSum + "</CtrlSum>")
            self._add_line(doc, 3, "<PmtTpInf>")
            self._add_lines(doc, 4, PmtTpInf)
            self._add_line(doc, 3, "</PmtTpInf>")
            self._add_line(doc, 3, "<Dbtr>")
            self._add_lines(doc, 4, Dbtr)
            self._add_line(doc, 3, "</Dbtr>")
            self._add_line(doc, 3, "<DbtrAcct>")
            self._add_lines(doc, 4, DbtrAcct)
            self._add_line(doc, 3, "</DbtrAcct>")
            self._add_line(doc, 3, "<DbtrAgt>")
            self._add_line(doc, 4, "<FinInstnId>")
            self._add_line(doc, 5, "<BIC>" + BIC + "</BIC>")
            self._add_line(doc, 4, "</FinInstnId>")
            self._add_line(doc, 3, "</DbtrAgt>")

            # One CdtTrfTxInf per transaction
            for payment in acc_payments:

                # Set vars for this block of the XML file (PmtInf)
                InstrId = payment.name # Used by debtor bank for reporting and bank statements
                EndToEndId = (PmtInfId + str(payment.id))[-30:]
                # TODO: a payment is always in the journal currency ?
                Ccy = journal.currency and journal.currency.name or journal.company_id.currency_id.name
                InstdAmt = str(float_round(payment.amount, 2))
                max_digits = Ccy == 'EUR' and 11 or 15
                if len(re.sub('\.', '', InstdAmt)) > max_digits:
                    raise ValidationError(_("The amount of the payment '%s' is too high. The maximum permitted is %s.") % (payment.name, str(9)*(max_digits-3)+".99"))
                if not payment.partner_id.bank_ids:
                    raise UserError(_("There is no bank account recorded for partner '%s'") % payment.partner_id.name)
                creditor_bank_account = payment.partner_id.bank_ids[0] # TODO
                CdtrAgt = self._get_CdtrAgt(is_generic, creditor_bank_account)
                Nm = payment.partner_id.name[:70]
                CdtrAcct = self._get_CdtrAcct(is_generic, creditor_bank_account)

                # Create the XML block
                self._add_line(doc, 3, "<CdtTrfTxInf>")
                self._add_line(doc, 4, "<PmtId>")
                self._add_line(doc, 5, "<InstrId>" + InstrId + "</InstrId>")
                self._add_line(doc, 5, "<EndToEndId>" + EndToEndId + "</EndToEndId>")
                self._add_line(doc, 4, "</PmtId>")
                self._add_line(doc, 4, "<Amt>")
                self._add_line(doc, 5, "<InstdAmt Ccy='" + Ccy + "'>" + InstdAmt + "</InstdAmt>")
                self._add_line(doc, 4, "</Amt>")
                self._add_line(doc, 4, "<CdtrAgt>")
                self._add_lines(doc, 5, CdtrAgt)
                self._add_line(doc, 4, "</CdtrAgt>")
                self._add_line(doc, 4, "<Cdtr>")
                self._add_line(doc, 5, "<Nm>" + Nm + "</Nm>")
                self._add_line(doc, 4, "</Cdtr>")
                self._add_line(doc, 4, "<CdtrAcct>")
                self._add_lines(doc, 5, CdtrAcct)
                self._add_line(doc, 4, "</CdtrAcct>")
                self._add_line(doc, 4, "<RmtInf>") # TODO
                self._add_line(doc, 4, "</RmtInf>")
                self._add_line(doc, 3, "</CdtTrfTxInf>")

            self._add_line(doc, 2, "</PmtInf>")
        self._add_line(doc, 1, "</CstmrCdtTrfInitn>")
        self._add_line(doc, 0, "</Document>")
        return '\n'.join(doc)

    def _get_CtrlSum(self, payment_recs):
        return str(float_round(sum(payment.amount for payment in payment_recs), 2))

    def _get_company_PartyIdentification32(self, journal, is_generic, org_id=True, postal_address=True):
        """ Returns a PartyIdentification32 element identifying the current journal's company """
        ret = []
        company = journal.company_id

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

    def _get_InitgPty(self, journal, is_generic):
        return self._get_company_PartyIdentification32(journal, is_generic, org_id=True, postal_address=False)

    def _get_PmtTpInf(self, is_generic):
        ret = []

        self._add_line(ret, 0, "<InstrPrty>NORM</InstrPrty>")
        if not is_generic:
            self._add_line(ret, 0, "<SvcLvl>")
            self._add_line(ret, 1, "<Cd>SEPA</Cd>")
            self._add_line(ret, 0, "</SvcLvl>")

        return ret

    def _get_DbtrAgt(self, journal, is_generic):
        return self._get_company_PartyIdentification32(journal, is_generic, org_id=lambda: not is_generic, postal_address=True)

    def _get_DbtrAcct(self, is_generic, bank_account):
        ret = []

        self._add_line(ret, 0, "<Id>")
        if is_generic:
            self._add_line(ret, 1, "<Othr>")
            self._add_line(ret, 2, "<Id>" + bank_account.get_bban_from_iban + "</Id>")
            self._add_line(ret, 1, "</Othr>")
        else:
            self._add_line(ret, 1, "<IBAN>" + bank_account.acc_number.replace(' ', '') + "</IBAN>")
        self._add_line(ret, 0, "</Id>")

        return ret

    def _get_CdtrAgt(self, is_generic, bank_account):
        ret = []

        bank = bank_account.bank
        BIC = bank_account.bank_bic or bank and bank.bic
        if not is_generic and not BIC:
            raise UserError(_("There is no Bank Identifier Code recorded for bank account '%s'") % bank_account.acc_number)
        Nm = bank_account.bank_name or bank and bank.name

        self._add_line(ret, 0, "<FinInstnId>")
        if BIC:
            self._add_line(ret, 1, "<BIC>" + BIC + "</BIC>")
        self._add_line(ret, 1, "<Nm>" + Nm + "</Nm>")
        if bank and bank.street and bank.city and bank.zip and bank.country:
            self._add_line(ret, 1, "<PstlAdr>")
            self._add_line(ret, 2, "<Ctry>" + bank.country.code + "</Ctry>")
            self._add_line(ret, 2, "<AdrLine>" + bank.street + "</AdrLine>")
            self._add_line(ret, 2, "<AdrLine>" + bank.zip + " " + bank.city + "</AdrLine>")
            if bank.state and bank.state.name:
                self._add_line(ret, 2, "<CtrySubDvsn>" + bank.state.name + "</CtrySubDvsn>")
            self._add_line(ret, 1, "</PstlAdr>")
        self._add_line(ret, 0, "</FinInstnId>")

        return ret

    def _get_CdtrAcct(self, is_generic, bank_account):
        ret = []

        if not is_generic and (not bank_account.state or not bank_account.state == 'iban'):
            raise UserError(_("The account %s, linked to partner '%s', is not of type IBAN.\nA valid IBAN account is required to use SEPA features.") % (bank_account.acc_number, bank_account.partner_id))

        self._add_line(ret, 0, "<Id>")
        if is_generic:
            self._add_line(ret, 1, "<Othr>")
            self._add_line(ret, 2, "<Id>" + bank_account.acc_number + "</Id>")
            self._add_line(ret, 1, "</Othr>")
        else:
            self._add_line(ret, 1, "<IBAN>" + bank_account.acc_number.replace(' ', '') + "</IBAN>")
        self._add_line(ret, 0, "</Id>")

        return ret
