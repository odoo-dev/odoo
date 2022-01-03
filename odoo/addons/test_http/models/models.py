# Part of Odoo. See LICENSE file for full copyright and licensing details.

import hashlib

from odoo import models, fields, api
from odoo.exceptions import UserError


DEFAULT_DHD_POWER = 1
DEFAULT_ZPM_POWER = 1000
DIAL_DISTANT_GALAXY_POWER_REQUIREMENT = 100


MILKY_WAY_REGIONS = ['P3X', 'P4X', 'P2X', 'P5C']
PEGASUS_REGIONS = ['M4R', 'P3Y', 'M6R']


class Stargate(models.Model):
    _name = 'test_http.stargate'
    _description = 'Stargate'

    name = fields.Char(required=True, store=True, compute='_compute_name', readonly=False, help="The stargate/planet common name.")
    address = fields.Char(required=True, help="The stargate's 6-glyphs address used by other stargates to dial this one.")
    sgc_designation = fields.Char(store=True, compute='_compute_sgc_designation', help="The SGC designation name of this stargate.")
    galaxy = fields.Many2one('test_http.galaxy', required=True, help="The galaxy where this stargate is.")

    power_available = fields.Float(required=True, default=DEFAULT_DHD_POWER, help="Power available in this stargate, used to dial others.")
    has_galaxy_crystal = fields.Boolean(required=True, default=lambda gate: gate.galaxy.id == gate.env.ref('test_http.milky_way').id, help="Whether this stargate can dial other galaxies.")

    _sql_constraints = [
        ('address_length', 'CHECK(LENGTH(address) = 6)', "Local addresses have 6 glyphs"),
    ]

    @api.depends('sgc_designation')
    def _compute_name(self):
        for gate in self:
            if not gate.name:
                gate.name = gate.sgc_designation

    @api.depends('address')
    def _compute_sgc_designation(self):
        for gate in self:
            if gate.galaxy.name not in ('Milky Way', 'Pegasus'):
                gate.sgc_designation = False
                continue

            region_part = (PEGASUS_REGIONS[gate.id % len(PEGASUS_REGIONS)]
                if gate.galaxy.name == 'Pegasus'
                else MILKY_WAY_REGIONS[gate.id % len(MILKY_WAY_REGIONS)])
            local_part = self.hash_address(gate.address)
            gate.sgc_designation = f'{region_part}-{local_part}'

    @api.model
    def hash_address(self, address):
        h = hashlib.sha1(address.encode()).digest()
        return str(int.from_bytes(h, 'big'))[:3]

    def attach_zpm(self):
        for gate in self:
            gate.power_available += DEFAULT_ZPM_POWER

    def detach_zpm(self):
        for gate in self:
            if gate.power_available - DEFAULT_ZPM_POWER < DEFAULT_DHD_POWER:
                raise UserError('Cannot detach a ZPM that is not attached.')
            gate.power_available - DEFAULT_ZPM_POWER

    def can_dial(self, othergate):
        self.ensure_one()

        return (
            self.id != othergate.id
            and (
                self.galaxy == othergate.galaxy
                or (
                    self.power_available > DIAL_DISTANT_GALAXY_POWER_REQUIREMENT
                    and self.has_galaxy_crystal
                )
            )
        )


class Galaxy(models.Model):
    _name = 'test_http.galaxy'
    _description = 'Galaxy'

    name = fields.Char(required=True, help='The galaxy common name.')
