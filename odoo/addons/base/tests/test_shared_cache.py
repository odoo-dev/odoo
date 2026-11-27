# Part of Odoo. See LICENSE file for full copyright and licensing details.
import os
import warnings
from unittest.mock import patch

from odoo.orm.cache import get_cache_key_counter
from odoo.tests.common import BaseCase, TransactionCase
from odoo.tools.lru import LRU
from odoo.tools import config
from odoo.tools import shared_memory
from odoo.tools.shared_memory import (
    LocalTable, SharedHashTable, get_cache_tables, parse_shared_memory, shared_state_key,
)


class TestSharedHashTable(BaseCase):

    def test_get_set(self):
        table = SharedHashTable(size=1 << 20, slots=64)
        self.assertIsNone(table.get(b'a'))
        self.assertTrue(table.set(b'a', b'value a'))
        self.assertTrue(table.set(b'b', b''))
        self.assertEqual(table.get(b'a'), b'value a')
        self.assertEqual(table.get(b'b'), b'')
        # values are never replaced
        self.assertTrue(table.set(b'a', b'other'))
        self.assertEqual(table.get(b'a'), b'value a')
        # too big for the table
        with self.assertLogs('odoo.tools.shared_memory', 'WARNING'):
            self.assertFalse(table.set(b'c', bytes(1 << 20)))
        self.assertIsNone(table.get(b'c'))

    def test_parse(self):
        self.assertEqual(parse_shared_memory('templates:64, default:16,'), {
            'templates': (64 << 20, None), 'default': (16 << 20, None),
        })
        self.assertEqual(parse_shared_memory('templates:64,lru=False,default:0,lru=True'), {
            'templates': (64 << 20, False), 'default': (0, True),
        })
        self.assertEqual(parse_shared_memory(''), {})
        for value in ('templates', 'templates:', ':64', 'templates:6.5', 'templates:-1',
                      'lru=True', 'templates:64,lru=yes', 'templates:64,size=1'):
            with self.assertRaises(ValueError):
                parse_shared_memory(value)

    def test_slots(self):
        self.assertEqual(SharedHashTable(64 << 20).slots, 16384)  # one per 4 KB
        self.assertEqual(SharedHashTable(1 << 20).slots, 256)
        self.assertEqual(SharedHashTable(1 << 16).slots, 64)  # minimum

    def test_cache_tables(self):
        def tables(option, shared=()):
            self.patch(shared_memory, '_cache_tables', {})
            self.patch(shared_memory, '_shared_tables', {name: SharedHashTable(1 << 20, name=name) for name in shared})
            with patch.dict(config.options, {'shared_memory': option}):
                local, shared_table = get_cache_tables('templates')
            return type(local).__name__ if local else None, type(shared_table).__name__ if shared_table else None

        # without workers: local table by default
        self.assertEqual(tables('templates:64'), ('LocalTable', None))
        self.assertEqual(tables('templates:64,lru=False'), (None, None))
        self.assertEqual(tables('templates:0'), ('LocalTable', None))
        self.assertEqual(tables('default:16'), (None, None))
        self.assertEqual(tables(''), (None, None))
        # with workers: shared table, and local table on demand
        self.assertEqual(tables('templates:1', shared=['templates']), (None, 'SharedHashTable'))
        self.assertEqual(tables('templates:1,lru=True', shared=['templates']), ('LocalTable', 'SharedHashTable'))

    def test_alias(self):
        table = SharedHashTable(size=1 << 20, slots=64)
        self.assertFalse(table.alias(b'b', b'a'), "no target")
        self.assertIsNone(table.get(b'b'))
        table.set(b'a', b'value a')
        end = table._mm[16:24]
        self.assertTrue(table.alias(b'b', b'a'))
        self.assertEqual(table.get(b'b'), b'value a')
        self.assertEqual(int.from_bytes(table._mm[16:24], 'little') - int.from_bytes(end, 'little'), 1,
                         "only the key is written")
        # keys are never replaced
        table.set(b'c', b'value c')
        self.assertTrue(table.alias(b'b', b'c'))
        self.assertEqual(table.get(b'b'), b'value a')

    def test_local_table(self):
        table = LocalTable(entries=8)
        value = {'not': 'serialized'}
        self.assertTrue(table.set(b'a', value))
        self.assertIs(table.get(b'a'), value)
        self.assertTrue(table.alias(b'b', b'a'))
        self.assertIs(table.get(b'b'), value)
        self.assertFalse(table.alias(b'c', b'missing'))
        table.set(b'a', {})
        self.assertIs(table.get(b'a'), value, "values are never replaced")

    def key(self, registry_seq, seq, name, db='db', oid=1):
        return shared_state_key(db, oid, registry_seq, None if seq is None else [seq], name.encode())

    def test_evict_old_states_first(self):
        # 16 slots: 12 entries max; evict 25%: 3 entries at least
        table = SharedHashTable(size=1 << 20, slots=16, name='test', evict_percent=25)
        keys = [
            self.key(9, 7, 'registry 9'),           # older registry
            self.key(10, 5, 'signaling 5'),         # older signaling
            self.key(10, 6, 'current a'),
            self.key(10, 6, 'old db', oid=0),       # database removed then created again
            *(self.key(10, 6, f'current {i}') for i in range(8)),
        ]
        keys.insert(3, self.key(10, 6, 'current b'))
        self.assertEqual(len(keys), 13)
        for key in keys[:12]:
            table.set(key, b'value of ' + key)
        with self.assertLogs('odoo.tools.shared_memory', 'INFO') as logs:
            table.set(keys[12], b'value of ' + keys[12])
        self.assertEqual(len(logs.output), 1)
        self.assertIn("INFO", logs.output[0])
        self.assertIn("full (slots): evicted 3 entries of old states and 0 of current states", logs.output[0])
        # the removed database first, then the registry 9, then the signaling 5
        self.assertIsNone(table.get(self.key(10, 6, 'old db', oid=0)))
        self.assertIsNone(table.get(self.key(9, 7, 'registry 9')))
        self.assertIsNone(table.get(self.key(10, 5, 'signaling 5')))
        for key in keys:
            if b'current' in key:
                self.assertEqual(table.get(key), b'value of ' + key)
        self.assertEqual(table.usage[0], 10)
        self.assertEqual(table.evictions, 1)

    def test_evict_stops_at_percent(self):
        table = SharedHashTable(size=1 << 20, slots=16, name='test', evict_percent=10)  # 1 entry
        for seq in range(12):
            table.set(self.key(10, seq, 'x'), b'v')
        with self.assertLogs('odoo.tools.shared_memory', 'INFO') as logs:
            table.set(self.key(10, 12, 'x'), b'v')
        self.assertIn("evicted 1 entries of old states", logs.output[0])
        self.assertIsNone(table.get(self.key(10, 0, 'x')))
        self.assertEqual(table.get(self.key(10, 1, 'x')), b'v')

    def test_evict_current_states(self):
        """ Without enough old states, evict the oldest entries of the current
        states, with a warning. """
        table = SharedHashTable(size=1 << 20, slots=16, name='test', evict_percent=25)
        table.set(self.key(10, 5, 'old'), b'v')
        for i in range(11):
            table.set(self.key(10, 6, f'current {i}'), b'v')
        with self.assertLogs('odoo.tools.shared_memory', 'WARNING') as logs:
            table.set(self.key(10, 6, 'current 11'), b'v')
        self.assertIn("evicted 1 entries of old states and 2 of current states", logs.output[0])
        self.assertIn("too small", logs.output[0])
        self.assertIsNone(table.get(self.key(10, 6, 'current 0')))
        self.assertIsNone(table.get(self.key(10, 6, 'current 1')))
        self.assertEqual(table.get(self.key(10, 6, 'current 2')), b'v')
        self.assertEqual(table.get(self.key(10, 6, 'current 11')), b'v')

    def test_evict_data_full(self):
        """ Evict enough data for the new value, and compact the data. """
        table = SharedHashTable(size=1 << 20, slots=64, name='test', evict_percent=5)
        value = bytes(300_000)
        table.set(self.key(10, 5, 'old'), b'a' * 300_000)
        table.set(self.key(10, 6, 'current 0'), b'b' * 300_000)
        table.set(self.key(10, 6, 'current 1'), b'c' * 300_000)
        with self.assertLogs('odoo.tools.shared_memory', 'INFO') as logs:
            table.set(self.key(10, 6, 'current 2'), value)
        self.assertIn("full (data): evicted 1 entries of old states and 0 of current states", logs.output[0])
        self.assertIsNone(table.get(self.key(10, 5, 'old')))
        # moved to the start of the data
        self.assertEqual(table.get(self.key(10, 6, 'current 0')), b'b' * 300_000)
        self.assertEqual(table.get(self.key(10, 6, 'current 1')), b'c' * 300_000)
        self.assertEqual(table.get(self.key(10, 6, 'current 2')), value)
        self.assertEqual(table.usage[0], 3)

    def test_evict_other_keys(self):
        """ Keys without state are evicted by order of writing. """
        table = SharedHashTable(size=1 << 20, slots=8, name='test', evict_percent=10)  # 6 entries max
        for i in range(6):
            table.set(b'%d' % i, b'v%d' % i)
        with self.assertLogs('odoo.tools.shared_memory', 'WARNING'):
            table.set(b'6', b'v6')
        self.assertIsNone(table.get(b'0'))
        self.assertEqual([table.get(b'%d' % i) for i in range(1, 7)], [b'v%d' % i for i in range(1, 7)])
        table.clear()
        self.assertEqual(table.usage, (0, 0))
        self.assertIsNone(table.get(b'1'))

    def test_evict_fingerprint_keys(self):
        """ The keys by fingerprint are current for the current registry of
        their database, whatever the signaling sequences. """
        table = SharedHashTable(size=1 << 20, slots=16, name='test', evict_percent=10)  # 1 entry
        table.set(self.key(9, None, 'fingerprint of registry 9'), b'v')
        table.set(self.key(10, None, 'fingerprint'), b'v')
        table.set(self.key(10, 5, 'signaling 5'), b'v')
        for i in range(9):
            table.set(self.key(10, 6, f'current {i}'), b'v')
        with self.assertLogs('odoo.tools.shared_memory', 'INFO') as logs:
            table.set(self.key(10, 6, 'current 9'), b'v')
            table.set(self.key(10, 6, 'current 10'), b'v')
        self.assertIn("evicted 1 entries of old states", logs.output[0])
        self.assertIn("evicted 1 entries of old states", logs.output[1])
        self.assertIsNone(table.get(self.key(9, None, 'fingerprint of registry 9')))
        self.assertIsNone(table.get(self.key(10, 5, 'signaling 5')))
        self.assertEqual(table.get(self.key(10, None, 'fingerprint')), b'v')

    def test_evict_aliases(self):
        """ Evicting a value evicts its aliases; the compaction moves the value
        of the aliases that are kept. """
        table = SharedHashTable(size=1 << 20, slots=16, name='test', evict_percent=10)  # 1 entry
        table.set(self.key(10, None, 'old value'), b'old')
        table.set(self.key(10, None, 'value'), b'value')
        table.alias(self.key(10, 6, 'alias of old value'), self.key(10, None, 'old value'))
        table.alias(self.key(10, 6, 'alias of value'), self.key(10, None, 'value'))
        for i in range(8):
            table.set(self.key(10, 6, f'current {i}'), b'v')
        self.assertEqual(table.usage[0], 12)
        with self.assertLogs('odoo.tools.shared_memory', 'WARNING') as logs:
            table.set(self.key(10, 6, 'current 8'), b'v')
        # the oldest entry and its alias
        self.assertIn("evicted 0 entries of old states and 2 of current states", logs.output[0])
        self.assertIsNone(table.get(self.key(10, None, 'old value')))
        self.assertIsNone(table.get(self.key(10, 6, 'alias of old value')))
        # moved
        self.assertEqual(table.get(self.key(10, None, 'value')), b'value')
        self.assertEqual(table.get(self.key(10, 6, 'alias of value')), b'value')
        self.assertEqual(table.get(self.key(10, 6, 'current 8')), b'v')
        self.assertEqual(table.usage[0], 11)

    def test_shared_with_forked_process(self):
        table = SharedHashTable(size=1 << 20, slots=64)
        table.set(b'parent', b'from parent')
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', DeprecationWarning)  # multi-threaded process
            pid = os.fork()
        if not pid:
            status = 0 if table.get(b'parent') == b'from parent' else 1
            table.set(b'child', b'from child')
            os._exit(status)
        _pid, status = os.waitpid(pid, 0)
        self.assertEqual(os.waitstatus_to_exitcode(status), 0)
        self.assertEqual(table.get(b'child'), b'from child')


class TestSharedQwebCode(TransactionCase):
    use_shared_cache = True

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.view = cls.env['ir.ui.view'].create({
            'name': 'test shared code',
            'type': 'qweb',
            'arch': '<t t-name="test_shared_code"><div t-out="name"/></t>',
        })

    def setUp(self):
        super().setUp()
        self.table = SharedHashTable(size=1 << 22)
        self.startPatcher(patch('odoo.orm.cache.get_cache_tables', return_value=(None, self.table)))
        # as if the creation of the view was committed: the cache of the worker
        # is not invalidated by the transaction
        cache, _key, _counter = get_cache_key_counter(self.env['ir.qweb']._generate_code_shared, self.view.id)
        while hasattr(cache, 'parent'):
            if cache.parent is None:
                self.patch(cache, 'parent', LRU(1024))
            cache = cache.parent
        self.wrote = False
        self.cold_worker()
        self.compiled = []
        generate_code_raw = type(self.env['ir.qweb'])._generate_code_raw

        def counting_generate_code_raw(qweb, template):
            self.compiled.append(template)
            return generate_code_raw(qweb, template)

        self.patch(type(self.env['ir.qweb']), '_generate_code_raw', counting_generate_code_raw)

    def cold_worker(self):
        """ Forget the code like a new worker: empty the worker's caches,
        without invalidating them. """
        cache, _key, _counter = get_cache_key_counter(self.env['ir.qweb']._generate_code_shared, self.view.id)
        while hasattr(cache, 'parent'):
            cache.data.clear()
            cache = cache.parent
        cache.clear()

    def render(self):
        # as a transaction that did not write (unless self.wrote)
        with patch.object(self.env.transaction, '_wrote__', self.wrote):
            return str(self.env['ir.qweb']._render(self.view.id, {'name': 'World'}))

    def test_cold_worker_reuses_shared_code(self):
        self.assertEqual(self.render(), '<div>World</div>')
        self.assertEqual(self.compiled, [self.view.id])

        self.cold_worker()
        self.assertEqual(self.render(), '<div>World</div>')
        self.assertEqual(self.compiled, [self.view.id], "the code comes from the shared memory")

    def test_not_shared_after_invalidation(self):
        self.render()
        self.env.transaction.invalidate_ormcache('templates')
        self.view.arch = '<t t-name="test_shared_code"><span t-out="name"/></t>'
        self.assertEqual(self.render(), '<span>World</span>')
        self.assertEqual(self.compiled, [self.view.id, self.view.id])

    def without_revalidation(self):
        self.patch(type(self.env['ir.qweb']), '_get_template_fingerprint', lambda qweb, ref: None)

    def count_fingerprints(self):
        fingerprints = []
        get_template_fingerprint = type(self.env['ir.qweb'])._get_template_fingerprint

        def counting_get_template_fingerprint(qweb, ref):
            fingerprints.append(ref)
            return get_template_fingerprint(qweb, ref)

        self.patch(type(self.env['ir.qweb']), '_get_template_fingerprint', counting_get_template_fingerprint)
        return fingerprints

    def signal(self):
        """ Another state of the database: the 'templates' cache was invalidated
        by another worker. """
        registry_caches = dict(self.env.transaction._registry_caches__)
        seq, data = registry_caches['templates']
        registry_caches['templates'] = (seq + 1, data)
        self.patch(self.env.transaction, '_registry_caches__', registry_caches)

    def test_not_shared_when_wrote(self):
        self.without_revalidation()
        self.wrote = True
        self.render()
        self.cold_worker()
        self.render()
        self.assertEqual(self.compiled, [self.view.id, self.view.id])

    def test_shared_by_fingerprint_when_wrote(self):
        self.wrote = True
        self.render()
        self.cold_worker()
        self.wrote = False
        fingerprints = self.count_fingerprints()
        self.render()
        self.assertEqual(self.compiled, [self.view.id], "the code is found by fingerprint")
        self.assertEqual(fingerprints, [self.view.id], "the code was not shared by sequences")

    def test_signaling_changes_the_key(self):
        self.without_revalidation()
        self.render()
        self.cold_worker()
        self.signal()
        self.render()
        self.assertEqual(self.compiled, [self.view.id, self.view.id])

    def test_signaling_revalidates(self):
        self.render()
        self.cold_worker()
        self.signal()
        fingerprints = self.count_fingerprints()
        self.render()
        self.assertEqual(self.compiled, [self.view.id], "the view did not change: same code")
        self.assertEqual(fingerprints, [self.view.id])

        # the code is now shared under the new sequences
        self.cold_worker()
        self.render()
        self.assertEqual(self.compiled, [self.view.id])
        self.assertEqual(fingerprints, [self.view.id], "no fingerprint needed")

    def test_revalidation_in_invalidated_transaction(self):
        self.render()
        self.env.transaction.invalidate_ormcache('templates')
        self.render()
        self.assertEqual(self.compiled, [self.view.id], "the view did not change: same code")

    def test_no_shared_memory(self):
        """ Without table for the cache (not in --shared-memory), this is an
        ormcache. """
        with patch('odoo.orm.cache.get_cache_tables', return_value=(None, None)):
            self.render()
            self.cold_worker()
            self.render()
        self.assertEqual(self.compiled, [self.view.id, self.view.id])

    def test_local_and_shared(self):
        """ With lru, the local table keeps the values loaded from the shared
        table. """
        local = LocalTable(64)
        with patch('odoo.orm.cache.get_cache_tables', return_value=(local, self.table)):
            self.render()
            self.assertEqual((local.writes, self.table.writes), (2, 2), "content key and its alias")
            local.clear()
            self.cold_worker()
            self.render()
            self.assertEqual(self.compiled, [self.view.id], "from the shared table")
            self.assertEqual(local.writes, 3, "kept in the local table")
            self.cold_worker()
            hits = self.table.hits
            self.render()
            self.assertEqual(self.table.hits, hits, "from the local table")

    def test_disabled_in_tests(self):
        self.patch(type(self), 'use_shared_cache', False)
        fingerprints = self.count_fingerprints()
        self.render()
        self.cold_worker()
        self.render()
        self.assertEqual(self.compiled, [self.view.id], "the fingerprint does not depend on the sequences")
        self.assertEqual(fingerprints, [self.view.id, self.view.id], "not shared by sequences")
