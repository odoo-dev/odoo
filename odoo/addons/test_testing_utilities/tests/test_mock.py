from unittest.mock import patch

from odoo.tests.common import TransactionCase


class TestMock(TransactionCase):

    def test_mock_unlink(self):
        with patch('odoo.addons.base.models.res_partner.Partner.find_or_create') as mock_find_and_create:
            print(hasattr(mock_find_and_create, '_ondelete'))
            partner = self.env['res.partner'].create({'name': 'Meuh'})
            self.env['res.partner'].find_or_create("check@check.com")
            partner.unlink()
            mock_find_and_create.assert_called_once()
