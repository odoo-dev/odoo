from odoo.tests import tagged

from odoo.addons.base.tests.common import TransactionCaseWithUserDemo


@tagged('at_install', '-post_install')  # LEGACY at_install
class TestMonetaryAccess(TransactionCaseWithUserDemo):

    def test_monetary_access_create(self):
        """Monetary fields that depend on compute/related currency
           have never really been supported by the ORM.
           However, most currency fields are related.
           This limitation can cause monetary fields to not be rounded,
           as well as trigger spurious ACL errors.
        """
        user_admin = self.env.ref("base.user_admin")
        user_demo = self.user_demo.with_user(user_admin)

        # this would raise without the fix introduced in this commit
        new_user = user_demo.copy({'monetary': 1 / 3})
        new_user.partner_id.company_id = new_user.company_id

        # The following is here to document how the ORM behaves, not really part of the test;
        # The ORM has correct values in cache event before invalidation.
        self.assertEqual(new_user.currency_id.rounding, 0.01,
                         "The cache contains the right value for currency.")
        self.assertEqual(new_user.monetary, 0.33,
                         "Rounding was done in cache.")

        self.env.invalidate_all()

        self.assertEqual(new_user.currency_id.rounding, 0.01,
                         "We now get the correct currency.")
        self.assertEqual(new_user.monetary, 0.33,
                         "The value was rounded when added to the cache.")
