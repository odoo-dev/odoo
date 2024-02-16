# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import datetime
from dateutil.relativedelta import relativedelta
import os.path
import pytz

from odoo.tools import (
    config,
    date_utils,
    file_open,
    file_path,
    merge_sequences,
    misc,
    remove_accents,
    validate_url,
)
from odoo.tests.common import TransactionCase, BaseCase


class TestCountingStream(BaseCase):
    def test_empty_stream(self):
        s = misc.CountingStream(iter([]))
        self.assertEqual(s.index, -1)
        self.assertIsNone(next(s, None))
        self.assertEqual(s.index, 0)

    def test_single(self):
        s = misc.CountingStream(range(1))
        self.assertEqual(s.index, -1)
        self.assertEqual(next(s, None), 0)
        self.assertIsNone(next(s, None))
        self.assertEqual(s.index, 1)

    def test_full(self):
        s = misc.CountingStream(range(42))
        for _ in s:
            pass
        self.assertEqual(s.index, 42)

    def test_repeated(self):
        """ Once the CountingStream has stopped iterating, the index should not
        increase anymore (the internal state should not be allowed to change)
        """
        s = misc.CountingStream(iter([]))
        self.assertIsNone(next(s, None))
        self.assertEqual(s.index, 0)
        self.assertIsNone(next(s, None))
        self.assertEqual(s.index, 0)


class TestMergeSequences(BaseCase):
    def test_merge_sequences(self):
        # base case
        seq = merge_sequences(['A', 'B', 'C'])
        self.assertEqual(seq, ['A', 'B', 'C'])

        # 'Z' can be anywhere
        seq = merge_sequences(['A', 'B', 'C'], ['Z'])
        self.assertEqual(seq, ['A', 'B', 'C', 'Z'])

        # 'Y' must precede 'C';
        seq = merge_sequences(['A', 'B', 'C'], ['Y', 'C'])
        self.assertEqual(seq, ['A', 'B', 'Y', 'C'])

        # 'X' must follow 'A' and precede 'C'
        seq = merge_sequences(['A', 'B', 'C'], ['A', 'X', 'C'])
        self.assertEqual(seq, ['A', 'B', 'X', 'C'])

        # all cases combined
        seq = merge_sequences(
            ['A', 'B', 'C'],
            ['Z'],                  # 'Z' can be anywhere
            ['Y', 'C'],             # 'Y' must precede 'C';
            ['A', 'X', 'Y'],        # 'X' must follow 'A' and precede 'Y'
        )
        self.assertEqual(seq, ['A', 'B', 'X', 'Y', 'C', 'Z'])


class TestDateRangeFunction(BaseCase):
    """ Test on date_range generator. """

    def test_date_range_with_naive_datetimes(self):
        """ Check date_range with naive datetimes. """
        start = datetime.datetime(1985, 1, 1)
        end = datetime.datetime(1986, 1, 1)

        expected = [
            datetime.datetime(1985, 1, 1, 0, 0),
            datetime.datetime(1985, 2, 1, 0, 0),
            datetime.datetime(1985, 3, 1, 0, 0),
            datetime.datetime(1985, 4, 1, 0, 0),
            datetime.datetime(1985, 5, 1, 0, 0),
            datetime.datetime(1985, 6, 1, 0, 0),
            datetime.datetime(1985, 7, 1, 0, 0),
            datetime.datetime(1985, 8, 1, 0, 0),
            datetime.datetime(1985, 9, 1, 0, 0),
            datetime.datetime(1985, 10, 1, 0, 0),
            datetime.datetime(1985, 11, 1, 0, 0),
            datetime.datetime(1985, 12, 1, 0, 0),
            datetime.datetime(1986, 1, 1, 0, 0)
        ]

        dates = [date for date in date_utils.date_range(start, end)]

        self.assertEqual(dates, expected)

    def test_date_range_with_date(self):
        """ Check date_range with naive datetimes. """
        start = datetime.date(1985, 1, 1)
        end = datetime.date(1986, 1, 1)

        expected = [
            datetime.date(1985, 1, 1),
            datetime.date(1985, 2, 1),
            datetime.date(1985, 3, 1),
            datetime.date(1985, 4, 1),
            datetime.date(1985, 5, 1),
            datetime.date(1985, 6, 1),
            datetime.date(1985, 7, 1),
            datetime.date(1985, 8, 1),
            datetime.date(1985, 9, 1),
            datetime.date(1985, 10, 1),
            datetime.date(1985, 11, 1),
            datetime.date(1985, 12, 1),
            datetime.date(1986, 1, 1),
        ]

        self.assertEqual(list(date_utils.date_range(start, end)), expected)

    def test_date_range_with_timezone_aware_datetimes_other_than_utc(self):
        """ Check date_range with timezone-aware datetimes other than UTC."""
        timezone = pytz.timezone('Europe/Brussels')

        start = datetime.datetime(1985, 1, 1)
        end = datetime.datetime(1986, 1, 1)
        start = timezone.localize(start)
        end = timezone.localize(end)

        expected = [datetime.datetime(1985, 1, 1, 0, 0),
                    datetime.datetime(1985, 2, 1, 0, 0),
                    datetime.datetime(1985, 3, 1, 0, 0),
                    datetime.datetime(1985, 4, 1, 0, 0),
                    datetime.datetime(1985, 5, 1, 0, 0),
                    datetime.datetime(1985, 6, 1, 0, 0),
                    datetime.datetime(1985, 7, 1, 0, 0),
                    datetime.datetime(1985, 8, 1, 0, 0),
                    datetime.datetime(1985, 9, 1, 0, 0),
                    datetime.datetime(1985, 10, 1, 0, 0),
                    datetime.datetime(1985, 11, 1, 0, 0),
                    datetime.datetime(1985, 12, 1, 0, 0),
                    datetime.datetime(1986, 1, 1, 0, 0)]

        expected = [timezone.localize(e) for e in expected]

        dates = [date for date in date_utils.date_range(start, end)]

        self.assertEqual(expected, dates)

    def test_date_range_with_mismatching_zones(self):
        """ Check date_range with mismatching zone should raise an exception."""
        start_timezone = pytz.timezone('Europe/Brussels')
        end_timezone = pytz.timezone('America/Recife')

        start = datetime.datetime(1985, 1, 1)
        end = datetime.datetime(1986, 1, 1)
        start = start_timezone.localize(start)
        end = end_timezone.localize(end)

        with self.assertRaises(ValueError):
            dates = [date for date in date_utils.date_range(start, end)]

    def test_date_range_with_inconsistent_datetimes(self):
        """ Check date_range with a timezone-aware datetime and a naive one."""
        context_timezone = pytz.timezone('Europe/Brussels')

        start = datetime.datetime(1985, 1, 1)
        end = datetime.datetime(1986, 1, 1)
        end = context_timezone.localize(end)

        with self.assertRaises(ValueError):
            dates = [date for date in date_utils.date_range(start, end)]

    def test_date_range_with_hour(self):
        """ Test date range with hour and naive datetime."""
        start = datetime.datetime(2018, 3, 25)
        end = datetime.datetime(2018, 3, 26)
        step = relativedelta(hours=1)

        expected = [
            datetime.datetime(2018, 3, 25, 0, 0),
            datetime.datetime(2018, 3, 25, 1, 0),
            datetime.datetime(2018, 3, 25, 2, 0),
            datetime.datetime(2018, 3, 25, 3, 0),
            datetime.datetime(2018, 3, 25, 4, 0),
            datetime.datetime(2018, 3, 25, 5, 0),
            datetime.datetime(2018, 3, 25, 6, 0),
            datetime.datetime(2018, 3, 25, 7, 0),
            datetime.datetime(2018, 3, 25, 8, 0),
            datetime.datetime(2018, 3, 25, 9, 0),
            datetime.datetime(2018, 3, 25, 10, 0),
            datetime.datetime(2018, 3, 25, 11, 0),
            datetime.datetime(2018, 3, 25, 12, 0),
            datetime.datetime(2018, 3, 25, 13, 0),
            datetime.datetime(2018, 3, 25, 14, 0),
            datetime.datetime(2018, 3, 25, 15, 0),
            datetime.datetime(2018, 3, 25, 16, 0),
            datetime.datetime(2018, 3, 25, 17, 0),
            datetime.datetime(2018, 3, 25, 18, 0),
            datetime.datetime(2018, 3, 25, 19, 0),
            datetime.datetime(2018, 3, 25, 20, 0),
            datetime.datetime(2018, 3, 25, 21, 0),
            datetime.datetime(2018, 3, 25, 22, 0),
            datetime.datetime(2018, 3, 25, 23, 0),
            datetime.datetime(2018, 3, 26, 0, 0)
        ]

        dates = [date for date in date_utils.date_range(start, end, step)]

        self.assertEqual(dates, expected)

class TestCallbacks(BaseCase):
    def test_callback(self):
        log = []
        callbacks = misc.Callbacks()

        # add foo
        def foo():
            log.append("foo")

        callbacks.add(foo)

        # add bar
        @callbacks.add
        def bar():
            log.append("bar")

        # add foo again
        callbacks.add(foo)

        # this should call foo(), bar(), foo()
        callbacks.run()
        self.assertEqual(log, ["foo", "bar", "foo"])

        # this should do nothing
        callbacks.run()
        self.assertEqual(log, ["foo", "bar", "foo"])

    def test_aggregate(self):
        log = []
        callbacks = misc.Callbacks()

        # register foo once
        @callbacks.add
        def foo():
            log.append(callbacks.data["foo"])

        # aggregate data
        callbacks.data.setdefault("foo", []).append(1)
        callbacks.data.setdefault("foo", []).append(2)
        callbacks.data.setdefault("foo", []).append(3)

        # foo() is called once
        callbacks.run()
        self.assertEqual(log, [[1, 2, 3]])
        self.assertFalse(callbacks.data)

        callbacks.run()
        self.assertEqual(log, [[1, 2, 3]])

    def test_reentrant(self):
        log = []
        callbacks = misc.Callbacks()

        # register foo that runs callbacks
        @callbacks.add
        def foo():
            log.append("foo1")
            callbacks.run()
            log.append("foo2")

        @callbacks.add
        def bar():
            log.append("bar")

        # both foo() and bar() are called once
        callbacks.run()
        self.assertEqual(log, ["foo1", "bar", "foo2"])

        callbacks.run()
        self.assertEqual(log, ["foo1", "bar", "foo2"])


class TestRemoveAccents(BaseCase):
    def test_empty_string(self):
        self.assertEqual(remove_accents(False), False)
        self.assertEqual(remove_accents(''), '')
        self.assertEqual(remove_accents(None), None)

    def test_latin(self):
        self.assertEqual(remove_accents('Niño Hernández'), 'Nino Hernandez')
        self.assertEqual(remove_accents('Anaïs Clémence'), 'Anais Clemence')

    def test_non_latin(self):
        self.assertEqual(remove_accents('العربية'), 'العربية')
        self.assertEqual(remove_accents('русский алфавит'), 'русскии алфавит')


class TestAddonsFileAccess(BaseCase):

    def assertCannotAccess(self, path, ExceptionType=FileNotFoundError, filter_ext=None):
        with self.assertRaises(ExceptionType):
            file_path(path, filter_ext=filter_ext)

    def assertCanRead(self, path, needle='', mode='r', filter_ext=None):
        with file_open(path, mode, filter_ext) as f:
            self.assertIn(needle, f.read())

    def assertCannotRead(self, path, ExceptionType=FileNotFoundError, filter_ext=None):
        with self.assertRaises(ExceptionType):
            file_open(path, filter_ext=filter_ext)

    def test_file_path(self):
        # absolute path
        self.assertEqual(__file__, file_path(__file__))
        self.assertEqual(__file__, file_path(__file__, filter_ext=None)) # means "no filter" too
        self.assertEqual(__file__, file_path(__file__, filter_ext=('.py',)))

        # directory target is ok
        self.assertEqual(os.path.dirname(__file__), file_path(os.path.join(__file__, '..')))

        # relative path
        relpath = os.path.join(*(__file__.split(os.sep)[-3:])) # 'base/tests/test_misc.py'
        self.assertEqual(__file__, file_path(relpath))
        self.assertEqual(__file__, file_path(relpath, filter_ext=('.py',)))

        # leading 'addons/' is ignored if present
        self.assertTrue(file_path("addons/web/__init__.py"))
        relpath = os.path.join('addons', relpath) # 'addons/base/tests/test_misc.py'
        self.assertEqual(__file__, file_path(relpath))

        # files in root_path are allowed
        self.assertTrue(file_path('tools/misc.py'))

        # errors when outside addons_paths
        self.assertCannotAccess('/doesnt/exist')
        self.assertCannotAccess('/tmp')
        self.assertCannotAccess('../../../../../../../../../tmp')
        self.assertCannotAccess(os.path.join(__file__, '../../../../../'))

        # data_dir is forbidden
        self.assertCannotAccess(config['data_dir'])

        # errors for illegal extensions
        self.assertCannotAccess(__file__, ValueError, filter_ext=('.png',))
        # file doesnt exist but has wrong extension
        self.assertCannotAccess(__file__.replace('.py', '.foo'), ValueError, filter_ext=('.png',))

    def test_file_open(self):
        # The needle includes UTF8 so we test reading non-ASCII files at the same time.
        # This depends on the system locale and is harder to unit test, but if you manage to run the
        # test with a non-UTF8 locale (`LC_ALL=fr_FR.iso8859-1 python3...`) it should not crash ;-)
        test_needle = "A needle with non-ascii bytes: ♥"

        # absolute path
        self.assertCanRead(__file__, test_needle)
        self.assertCanRead(__file__, test_needle.encode(), mode='rb')
        self.assertCanRead(__file__, test_needle.encode(), mode='rb', filter_ext=('.py',))

        # directory target *is* an error
        with self.assertRaises(FileNotFoundError):
            file_open(os.path.join(__file__, '..'))

        # relative path
        relpath = os.path.join(*(__file__.split(os.sep)[-3:])) # 'base/tests/test_misc.py'
        self.assertCanRead(relpath, test_needle)
        self.assertCanRead(relpath, test_needle.encode(), mode='rb')
        self.assertCanRead(relpath, test_needle.encode(), mode='rb', filter_ext=('.py',))

        # leading 'addons/' is ignored if present
        self.assertCanRead("addons/web/__init__.py", "import")
        relpath = os.path.join('addons', relpath) # 'addons/base/tests/test_misc.py'
        self.assertCanRead(relpath, test_needle)

        # files in root_path are allowed
        self.assertCanRead('tools/misc.py')

        # errors when outside addons_paths
        self.assertCannotRead('/doesnt/exist')
        self.assertCannotRead('')
        self.assertCannotRead('/tmp')
        self.assertCannotRead('../../../../../../../../../tmp')
        self.assertCannotRead(os.path.join(__file__, '../../../../../'))

        # data_dir is forbidden
        self.assertCannotRead(config['data_dir'])

        # errors for illegal extensions
        self.assertCannotRead(__file__, ValueError, filter_ext=('.png',))
        # file doesnt exist but has wrong extension
        self.assertCannotRead(__file__.replace('.py', '.foo'), ValueError, filter_ext=('.png',))


class TestDictTools(BaseCase):
    def test_readonly_dict(self):
        d = misc.ReadonlyDict({'foo': 'bar'})
        with self.assertRaises(TypeError):
            d['baz'] = 'xyz'
        with self.assertRaises(AttributeError):
            d.update({'baz': 'xyz'})
        with self.assertRaises(TypeError):
            dict.update(d, {'baz': 'xyz'})


class TestUrlValidate(BaseCase):
    def test_url_validate(self):
        for case, truth in [
            # full URLs should be preserved
            ('http://example.com', 'http://example.com'),
            ('http://example.com/index.html', 'http://example.com/index.html'),
            ('http://example.com?debug=1', 'http://example.com?debug=1'),
            ('http://example.com#h3', 'http://example.com#h3'),

            # URLs with a domain should get a http scheme
            ('example.com', 'http://example.com'),
            ('example.com/index.html', 'http://example.com/index.html'),
            ('example.com?debug=1', 'http://example.com?debug=1'),
            ('example.com#h3', 'http://example.com#h3'),
        ]:
            with self.subTest(case=case):
                self.assertEqual(validate_url(case), truth)

        # broken cases, do we really want that?
        self.assertEqual(validate_url('/index.html'), 'http:///index.html')
        self.assertEqual(validate_url('?debug=1'), 'http://?debug=1')
        self.assertEqual(validate_url('#model=project.task&id=3603607'), 'http://#model=project.task&id=3603607')


class TestMiscToken(TransactionCase):

    def test_expired_token(self):
        payload = {'test': True, 'value': 123456, 'some_string': 'hello', 'some_dict': {'name': 'New Dict'}}
        expiration = datetime.datetime.now() - datetime.timedelta(days=1)
        token = misc.hash_sign(self.env, 'test', payload, expiration=expiration)
        self.assertIsNone(misc.verify_hash_signed(self.env, 'test', token))

    def test_long_payload(self):
        payload = {'test': True, 'value':123456, 'some_string': 'hello', 'some_dict': {'name': 'New Dict'}}
        token = misc.hash_sign(self.env, 'test', payload, expiration_hours=24)
        self.assertEqual(misc.verify_hash_signed(self.env, 'test', token), payload)

    def test_None_payload(self):
        with self.assertRaises(Exception):
            misc.hash_sign(self.env, 'test', None, expiration_hours=24)

    def test_list_payload(self):
        payload = ["str1", "str2", "str3", 4, 5]
        token = misc.hash_sign(self.env, 'test', payload, expiration_hours=24)
        self.assertEqual(misc.verify_hash_signed(self.env, 'test', token), payload)

    def test_modified_payload(self):
        payload = ["str1", "str2", "str3", 4, 5]
        token = base64.urlsafe_b64decode(misc.hash_sign(self.env, 'test', payload, expiration_hours=24) + '===')
        new_timestamp = datetime.datetime.now() + datetime.timedelta(days=7)
        new_timestamp = int(new_timestamp.timestamp())
        new_timestamp = new_timestamp.to_bytes(8, byteorder='little')
        token = base64.urlsafe_b64encode(token[:1] + new_timestamp + token[9:]).decode()
        self.assertIsNone(misc.verify_hash_signed(self.env, 'test', token))
