from odoo import models

# Practice companies, numerous enough that a dropdown cannot show them all.
TRADES = ("Plumbing", "Heating", "Tiling", "Electrics", "Roofing")
TOWNS = ("Namur", "Liege", "Ghent", "Bruges", "Mons", "Leuven", "Arlon", "Wavre", "Hasselt", "Ypres")


class LearningSetup(models.AbstractModel):
    _inherit = 'learning.setup'

    def _practice_partner(self, name, **values):
        """A practice contact, reset to ``values``. Emails use example.com,
        which never receives anything."""
        partner = self._practice_record('res.partner', {'name': name, **values})
        partner.write(values)
        return partner

    def _setup_first_customer_start(self):
        return self._menu_location('res.partner', 'contacts.action_contacts', ('contacts.menu_contacts',))

    def _setup_link_company_start(self):
        company = self._practice_partner(self.env._("Dupont Plumbing"), email='contact@dupont-plumbing.example.com')
        person = self._practice_partner(self.env._("Jean Dupont"), parent_id=False, email='jean.dupont@example.com')
        return {
            'location': self._form_location(person, 'contacts.action_contacts'),
            # the company the lesson suggests; the learner may pick another
            'params': {'person': person.name, 'company': company.name},
        }

    def _setup_search_more_start(self):
        for trade in TRADES:
            for town in TOWNS:
                self._practice_partner(f"{trade} {town}")
        person = self._practice_partner(self.env._("Jean Dupont"), parent_id=False, email='jean.dupont@example.com')
        return self._form_location(person, 'contacts.action_contacts')
