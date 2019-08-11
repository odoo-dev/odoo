# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime
import logging
import string
import re

_logger = logging.getLogger(__name__)
try:
    import vatnumber
except ImportError:
    _logger.warning("VAT validation partially unavailable because the `vatnumber` Python library cannot be found. "
                    "Install it to support more countries, for example with `easy_install vatnumber`.")
    vatnumber = None

from odoo import api, models, _
from odoo.tools.misc import ustr
from odoo.exceptions import ValidationError
from stdnum.at.uid import compact as compact_at
from stdnum.be.vat import compact as compact_be
from stdnum.bg.vat import compact as compact_bg
from stdnum.ch.vat import compact as compact_ch
from stdnum.cy.vat import compact as compact_cy
from stdnum.cz.dic import compact as compact_cz
from stdnum.de.vat import compact as compact_de
from stdnum.ee.kmkr import compact as compact_ee
# el not in stdnum
from stdnum.es.nif import compact as compact_es
from stdnum.fi.alv import compact as compact_fi
from stdnum.fr.tva import compact as compact_fr
from stdnum.gb.vat import compact as compact_gb
from stdnum.gr.vat import compact as compact_gr
from stdnum.hu.anum import compact as compact_hu
from stdnum.hr.oib import compact as compact_hr
from stdnum.ie.vat import compact as compact_ie
from stdnum.it.iva import compact as compact_it
from stdnum.lt.pvm import compact as compact_lt
from stdnum.lu.tva import compact as compact_lu
from stdnum.lv.pvn import compact as compact_lv
from stdnum.mt.vat import compact as compact_mt
from stdnum.mx.rfc import compact as compact_mx
from stdnum.nl.btw import compact as compact_nl
from stdnum.no.mva import compact as compact_no
# pe is not in stdnum
from stdnum.pl.nip import compact as compact_pl
from stdnum.pt.nif import compact as compact_pt
from stdnum.ro.cf import compact as compact_ro
from stdnum.se.vat import compact as compact_se
from stdnum.si.ddv import compact as compact_si
from stdnum.sk.dph import compact as compact_sk
from stdnum.ar.cuit import compact as compact_ar
# tr compact vat is not in stdnum


_eu_country_vat = {
    'GR': 'EL'
}

_eu_country_vat_inverse = {v: k for k, v in _eu_country_vat.items()}

_ref_vat = {
    'at': 'ATU12345675',
    'be': 'BE0477472701',
    'bg': 'BG1234567892',
    'ch': 'CHE-123.456.788 TVA or CH TVA 123456',  # Swiss by Yannick Vaucher @ Camptocamp
    'cy': 'CY12345678F',
    'cz': 'CZ12345679',
    'de': 'DE123456788',
    'dk': 'DK12345674',
    'ee': 'EE123456780',
    'el': 'EL12345670',
    'es': 'ESA12345674',
    'fi': 'FI12345671',
    'fr': 'FR32123456789',
    'gb': 'GB123456782',
    'gr': 'GR12345670',
    'hu': 'HU12345676',
    'hr': 'HR01234567896',  # Croatia, contributed by Milan Tribuson
    'ie': 'IE1234567FA',
    'it': 'IT12345670017',
    'lt': 'LT123456715',
    'lu': 'LU12345613',
    'lv': 'LV41234567891',
    'mt': 'MT12345634',
    'mx': 'ABC123456T1B',
    'nl': 'NL123456782B90',
    'no': 'NO123456785',
    'pe': 'PER10254824220 or PED10254824220',
    'pl': 'PL1234567883',
    'pt': 'PT123456789',
    'ro': 'RO1234567897',
    'se': 'SE123456789701',
    'si': 'SI12345679',
    'sk': 'SK0012345675',
    'tr': 'TR1234567890 (VERGINO) veya TR12345678901 (TCKIMLIKNO)'  # Levent Karakas @ Eska Yazilim A.S.
}


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _split_vat(self, vat):
        vat_country, vat_number = vat[:2].lower(), vat[2:].replace(' ', '')
        return vat_country, vat_number

    @api.model
    def simple_vat_check(self, country_code, vat_number):
        '''
        Check the VAT number depending of the country.
        http://sima-pc.com/nif.php
        '''
        if not ustr(country_code).encode('utf-8').isalpha():
            return False
        check_func_name = 'check_vat_' + country_code
        check_func = getattr(self, check_func_name, None) or getattr(vatnumber, check_func_name, None)
        if not check_func:
            # No VAT validation available, default to check that the country code exists
            if country_code.upper() == 'EU':
                # Foreign companies that trade with non-enterprises in the EU
                # may have a VATIN starting with "EU" instead of a country code.
                return True
            country_code = _eu_country_vat_inverse.get(country_code, country_code)
            return bool(self.env['res.country'].search([('code', '=ilike', country_code)]))
        return check_func(vat_number)

    @api.model
    def vies_vat_check(self, country_code, vat_number):
        try:
            # Validate against  VAT Information Exchange System (VIES)
            # see also http://ec.europa.eu/taxation_customs/vies/
            return vatnumber.check_vies(country_code.upper() + vat_number)
        except Exception:
            # see http://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl
            # Fault code may contain INVALID_INPUT, SERVICE_UNAVAILABLE, MS_UNAVAILABLE,
            # TIMEOUT or SERVER_BUSY. There is no way we can validate the input
            # with VIES if any of these arise, including the first one (it means invalid
            # country code or empty VAT number), so we fall back to the simple check.
            return self.simple_vat_check(country_code, vat_number)

    @api.model
    def fix_eu_vat_number(self, country_id, vat):
        europe = self.env.ref('base.europe')
        country = self.env["res.country"].browse(country_id)
        if not europe:
            europe = self.env["res.country.group"].search([('name', '=', 'Europe')], limit=1)
        if europe and country and country.id in europe.country_ids.ids:
            vat = re.sub('[^A-Za-z0-9]', '', vat).upper()
            country_code = _eu_country_vat.get(country.code, country.code).upper()
            if vat[:2] != country_code:
                vat = country_code + vat
        return vat

    @api.constrains('vat', 'country_id')
    def check_vat(self):
        if self.env.context.get('company_id'):
            company = self.env['res.company'].browse(self.env.context['company_id'])
        else:
            company = self.env.company
        if company.vat_check_vies:
            # force full VIES online check
            check_func = self.vies_vat_check
        else:
            # quick and partial off-line checksum validation
            check_func = self.simple_vat_check
        for partner in self:
            if not partner.vat:
                continue
            #check with country code as prefix of the TIN
            vat_country, vat_number = self._split_vat(partner.vat)
            if not check_func(vat_country, vat_number):
                #if fails, check with country code from country
                country_code = partner.commercial_partner_id.country_id.code
                if country_code:
                    if not check_func(country_code.lower(), partner.vat):
                        msg = partner._construct_constraint_msg(country_code.lower())
                        raise ValidationError(msg)

    def _construct_constraint_msg(self, country_code):
        self.ensure_one()
        vat_no = "'CC##' (CC=Country Code, ##=VAT Number)"
        vat_no = _ref_vat.get(country_code) or vat_no
        if self.env.context.get('company_id'):
            company = self.env['res.company'].browse(self.env.context['company_id'])
        else:
            company = self.env.company
        if company.vat_check_vies:
            return '\n' + _('The VAT number [%s] for partner [%s] either failed the VIES VAT validation check or did not respect the expected format %s.') % (self.vat, self.name, vat_no)
        return '\n' + _('The VAT number [%s] for partner [%s] does not seem to be valid. \nNote: the expected format is %s') % (self.vat, self.name, vat_no)

    __check_vat_ch_re1 = re.compile(r'(MWST|TVA|IVA)[0-9]{6}$')
    __check_vat_ch_re2 = re.compile(r'E([0-9]{9}|-[0-9]{3}\.[0-9]{3}\.[0-9]{3})(MWST|TVA|IVA)$')

    def check_vat_ch(self, vat):
        '''
        Check Switzerland VAT number.
        '''
        # VAT number in Switzerland will change between 2011 and 2013
        # http://www.estv.admin.ch/mwst/themen/00154/00589/01107/index.html?lang=fr
        # Old format is "TVA 123456" we will admit the user has to enter ch before the number
        # Format will becomes such as "CHE-999.999.99C TVA"
        # Both old and new format will be accepted till end of 2013
        # Accepted format are: (spaces are ignored)
        #     CH TVA ######
        #     CH IVA ######
        #     CH MWST #######
        #
        #     CHE#########MWST
        #     CHE#########TVA
        #     CHE#########IVA
        #     CHE-###.###.### MWST
        #     CHE-###.###.### TVA
        #     CHE-###.###.### IVA
        #
        if self.__check_vat_ch_re1.match(vat):
            return True
        match = self.__check_vat_ch_re2.match(vat)
        if match:
            # For new TVA numbers, do a mod11 check
            num = [s for s in match.group(1) if s.isdigit()]        # get the digits only
            factor = (5, 4, 3, 2, 7, 6, 5, 4)
            csum = sum([int(num[i]) * factor[i] for i in range(8)])
            check = (11 - (csum % 11)) % 11
            return check == int(num[8])
        return False

    def _ie_check_char(self, vat):
        vat = vat.zfill(8)
        extra = 0
        if vat[7] not in ' W':
            if vat[7].isalpha():
                extra = 9 * (ord(vat[7]) - 64)
            else:
                # invalid
                return -1
        checksum = extra + sum((8-i) * int(x) for i, x in enumerate(vat[:7]))
        return 'WABCDEFGHIJKLMNOPQRSTUV'[checksum % 23]

    def check_vat_ie(self, vat):
        """ Temporary Ireland VAT validation to support the new format
        introduced in January 2013 in Ireland, until upstream is fixed.
        TODO: remove when fixed upstream"""
        if len(vat) not in (8, 9) or not vat[2:7].isdigit():
            return False
        if len(vat) == 8:
            # Normalize pre-2013 numbers: final space or 'W' not significant
            vat += ' '
        if vat[:7].isdigit():
            return vat[7] == self._ie_check_char(vat[:7] + vat[8])
        elif vat[1] in (string.ascii_uppercase + '+*'):
            # Deprecated format
            # See http://www.revenue.ie/en/online/third-party-reporting/reporting-payment-details/faqs.html#section3
            return vat[7] == self._ie_check_char(vat[2:7] + vat[0] + vat[8])
        return False

    # Mexican VAT verification, contributed by Vauxoo
    # and Panos Christeas <p_christ@hol.gr>
    __check_vat_mx_re = re.compile(br"(?P<primeras>[A-Za-z\xd1\xf1&]{3,4})" \
                                   br"[ \-_]?" \
                                   br"(?P<ano>[0-9]{2})(?P<mes>[01][0-9])(?P<dia>[0-3][0-9])" \
                                   br"[ \-_]?" \
                                   br"(?P<code>[A-Za-z0-9&\xd1\xf1]{3})$")

    def check_vat_mx(self, vat):
        ''' Mexican VAT verification

        Verificar RFC México
        '''
        # we convert to 8-bit encoding, to help the regex parse only bytes
        vat = ustr(vat).encode('iso8859-1')
        m = self.__check_vat_mx_re.match(vat)
        if not m:
            #No valid format
            return False
        try:
            ano = int(m.group('ano'))
            if ano > 30:
                ano = 1900 + ano
            else:
                ano = 2000 + ano
            datetime.date(ano, int(m.group('mes')), int(m.group('dia')))
        except ValueError:
            return False

        # Valid format and valid date
        return True

    # Norway VAT validation, contributed by Rolv Råen (adEgo) <rora@adego.no>
    # Support for MVA suffix contributed by Bringsvor Consulting AS (bringsvor@bringsvor.com)
    def check_vat_no(self, vat):
        """
        Check Norway VAT number.See http://www.brreg.no/english/coordination/number.html
        """
        if len(vat) == 12 and vat.upper().endswith('MVA'):
            vat = vat[:-3] # Strictly speaking we should enforce the suffix MVA but...

        if len(vat) != 9:
            return False
        try:
            int(vat)
        except ValueError:
            return False

        sum = (3 * int(vat[0])) + (2 * int(vat[1])) + \
            (7 * int(vat[2])) + (6 * int(vat[3])) + \
            (5 * int(vat[4])) + (4 * int(vat[5])) + \
            (3 * int(vat[6])) + (2 * int(vat[7]))

        check = 11 - (sum % 11)
        if check == 11:
            check = 0
        if check == 10:
            # 10 is not a valid check digit for an organization number
            return False
        return check == int(vat[8])

    # Peruvian VAT validation, contributed by Vauxoo
    def check_vat_pe(self, vat):

        vat_type, vat = vat and len(vat) >= 2 and (vat[0], vat[1:]) or (False, False)

        if vat_type and vat_type.upper() == 'D':
            # DNI
            return True
        elif vat_type and vat_type.upper() == 'R':
            # verify RUC
            factor = '5432765432'
            sum = 0
            dig_check = False
            if len(vat) != 11:
                return False
            try:
                int(vat)
            except ValueError:
                return False

            for f in range(0, 10):
                sum += int(factor[f]) * int(vat[f])

            subtraction = 11 - (sum % 11)
            if subtraction == 10:
                dig_check = 0
            elif subtraction == 11:
                dig_check = 1
            else:
                dig_check = subtraction

            return int(vat[10]) == dig_check
        else:
            return False

    # VAT validation in Turkey, contributed by # Levent Karakas @ Eska Yazilim A.S.
    def check_vat_tr(self, vat):

        if not (10 <= len(vat) <= 11):
            return False
        try:
            int(vat)
        except ValueError:
            return False

        # check vat number (vergi no)
        if len(vat) == 10:
            sum = 0
            check = 0
            for f in range(0, 9):
                c1 = (int(vat[f]) + (9-f)) % 10
                c2 = (c1 * (2 ** (9-f))) % 9
                if (c1 != 0) and (c2 == 0):
                    c2 = 9
                sum += c2
            if sum % 10 == 0:
                check = 0
            else:
                check = 10 - (sum % 10)
            return int(vat[9]) == check

        # check personal id (tc kimlik no)
        if len(vat) == 11:
            c1a = 0
            c1b = 0
            c2 = 0
            for f in range(0, 9, 2):
                c1a += int(vat[f])
            for f in range(1, 9, 2):
                c1b += int(vat[f])
            c1 = ((7 * c1a) - c1b) % 10
            for f in range(0, 10):
                c2 += int(vat[f])
            c2 = c2 % 10
            return int(vat[9]) == c1 and int(vat[10]) == c2

        return False

    def check_vat_al(self, vat):
        try:
            import stdnum.al
            return stdnum.al.vat.is_valid(vat)
        except ImportError:
            return True

    # Argentinian VAT validation, contributed by ADHOC
    def check_vat_ar(self, vat):
        try:
            import stdnum.ar
            return stdnum.ar.cuit.is_valid(vat)
        except ImportError:
            return True

    def default_compact(self, vat):
        return vat

    def _fix_vat_number(self, vat):
        vat_country, vat_number = self._split_vat(vat)
        check_func_name = 'compact_' + vat_country
        check_func = globals().get(check_func_name) or getattr(self, 'default_compact')
        vat_number = check_func(vat_number)
        return vat_country.upper() + vat_number

    @api.model
    def create(self, values):
        if values.get('vat'):
            values['vat'] = self._fix_vat_number(values['vat'])
        return super(ResPartner, self).create(values)

    def write(self, values):
        if values.get('vat'):
            values['vat'] = self._fix_vat_number(values['vat'])
        return super(ResPartner, self).write(values)
