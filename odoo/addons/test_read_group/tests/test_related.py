from odoo.tests import common


class TestRelated(common.TransactionCase):
    """ Test grouping by related non-stored fields. """

    def test_related(self):
        Partner = self.env['res.partner']
        Model1 = self.env['test_read_group.related1']
        Model2 = self.env['test_read_group.related2']
        Model3 = self.env['test_read_group.related3']

        country = self.env.ref('base.ru')
        state = self.env['res.country.state'].create({
            'name': 'Bashkortostan',
            'code': '02-RUS',
            'country_id': country.id,
        })

        for _ in range(2):
            Model3.create({
                'partner_id': Partner.create({
                    'name': 'Ivan',
                    'country_id': country.id,
                    'state_id': state.id,
                }).id
            })

        self.make_test(Model3, 'state_code')
        self.make_test(Model3, 'state_code2')
        self.make_test(Model3, 'state_stored_code')

        for model in (Model2, Model3):
            self.make_test(model, 'country_code2')
            self.make_test(model, 'partner_city')

        for model in (Model1, Model2, Model3):
            self.make_test(model, 'country_code')

    def make_test(self, model, field):
        res = model.read_group([], [field], [field])
        self.assertEqual(res[0][field + '_count'], 2)
        res = model.read_group([], [field], [field], orderby=field)
        self.assertEqual(res[0][field + '_count'], 2)
