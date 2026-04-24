import gc
import weakref

from odoo.tests.common import TransactionCase, tagged


@tagged('post_install')
class TestRegistry(TransactionCase):
    def test_setup_models_field_leak(self, partial_model_names=None):
        registry = self.registry
        registry._setup_models__(self.cr)  # clean start

        # Take the snapshot of instantiated fields
        weak_fields = weakref.WeakSet()
        for model in self.env.values():
            weak_fields.update(model._fields.values())
        pre_field_count = len(weak_fields)

        # Resetup models, make sure we have cached properties filled
        with self.muted_registry_logger:
            for name in dir(registry):
                getattr(registry, name)  # fill cached properties
            for field in weak_fields:
                registry.is_modifying_relations(field)
                registry.get_field_trigger_tree(field)
            registry.check_null_constraints(self.cr)
            self.env.user.read()  # run some code
        registry._setup_models__(self.cr, model_names=partial_model_names)
        if partial_model_names:
            registry.field_setup_dependents.clear()  # filled during incremental setup
        registry.clear_all_caches()  # stuff may remain in the cache

        # Now collect objects
        gc.collect(2)  # full GC
        pre_fields = set(weak_fields)

        # Current fields
        post_fields = set()
        for model in self.env.values():
            post_fields.update(model._fields.values())
        self.assertEqual(len(post_fields), pre_field_count, "Same number of fields")

        # Show detailed leaks
        remaining_fields = pre_fields - post_fields
        if remaining_fields:
            show = 10
            info = [f"Unused fields should be deallocated: {len(remaining_fields)} left of {len(post_fields)}"]

            def exclude(v):
                return v is pre_fields or v is remaining_fields or 'pydev' in type(v).__module__
            for field in remaining_fields:
                referrers = gc.get_referrers(field)
                show_referrers = {
                    repr(r)[:100]: [
                        repr(r2)[:100]
                        for r2 in gc.get_referrers(r)
                        if not exclude(r2)
                    ]
                    for r in referrers
                    if not exclude(r)
                }
                info.append(f"- left field {field}, referenced by:\n{show_referrers}")
                show -= 1
                if not show:
                    info.append('...')
                    break
            self.fail('\n'.join(info))

    def test_setup_models_field_leak_partial(self):
        self.test_setup_models_field_leak((self.env.user._name, self.env.company._name))
