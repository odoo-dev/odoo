"""
Vendor unittest.TestSuite

This is a modified version of python 3.8 unitest.TestSuite

Odoo tests customisation combined with the need of a cross version compatibility
started to make TestSuite and other unitest object more complicated than vendoring
the part we need for Odoo. This versions is simplified in order
to minimise the code to maintain

- Removes expected failure support
- Removes module setUp/tearDown support

"""

import logging
import sys
import time
import json
from unittest import mock
from contextlib import ExitStack
import freezegun

import odoo
from . import case
from .common import HttpCase, TransactionCase, save_test_file
from .result import stats_logger
from unittest import util, BaseTestSuite, TestCase

__unittest = True

class TestSuite(BaseTestSuite):
    """A test suite is a composite test consisting of a number of TestCases.
    For use, create an instance of TestSuite, then add test case instances.
    When all tests have been added, the suite can be passed to a test
    runner, such as TextTestRunner. It will run the individual test cases
    in the order in which they were added, aggregating the results. When
    subclassing, do not forget to call the base class constructor.
    """

    def run(self, result, debug=False):
        self.profile_data = {
            'time_spent': 0,
            'suite_time_total': 0,
            'potential_gain': 0,
        }
        start_time = freezegun.api.real_monotonic()
        for test in self:
            if result.shouldStop:
                break
            assert isinstance(test, (TestCase))
            odoo.modules.module.current_test = test
            self._tearDownPreviousClass(test, result)
            self._handleClassSetUp(test, result)
            result._previousTestClass = test.__class__

            if not test.__class__._classSetupFailed:
                test(result)

        self._tearDownPreviousClass(None, result)
        end_time = freezegun.api.real_monotonic()
        self.profile_data['suite_time_total'] = end_time - start_time
        # Post process data
        def _visit_node(node: dict):
            if 'time_spent' and 'number_calls' in node and node['number_calls']:
                node['mean'] = node['time_spent'] / node['number_calls']
                node['potential_gain'] = (node['number_calls'] - 1) * node['mean']
                self.profile_data['potential_gain'] += node['potential_gain']
            for v in node.values():
                if not isinstance(v, dict):
                    continue
                _visit_node(v)
        _visit_node(self.profile_data)
        save_test_file('profile_data', json.dumps(self.profile_data).encode(), 'profile_data_', extension='json', document_type=f'Profile Json ({self.profile_data["potential_gain"]:.2f}s potential gains)')
        return result

    def _handleClassSetUp(self, test, result):
        previousClass = result._previousTestClass
        currentClass = test.__class__
        if currentClass == previousClass:
            return
        if result._moduleSetUpFailed:
            return
        if currentClass.__unittest_skip__:
            return

        currentClass._classSetupFailed = False

        try:
            # Compute a key for the class, that is the qualname of all classes that override setUpClass
            klss = [kls for kls in currentClass.__mro__ if issubclass(kls, TransactionCase) and kls != TransactionCase]
            klss.reverse()
            # Filter classes which do not explicitely override setUpClass
            klss = [kls for idx, kls in enumerate(klss) if idx == 0 or klss[idx - 1].setUpClass != kls.setUpClass]

            with ExitStack() as stack:
                last_data = self.profile_data
                start_time_stack = []
                for kls in klss:
                    kls_data = last_data.setdefault(kls.__qualname__, {
                        'number_calls': 0,
                        'time_spent': 0,
                        'mean': 0,
                        'potential_gain': 0,
                    })
                    def mock_method_factory(kkls):
                        _this_data = kls_data
                        idx = currentClass.__mro__.index(kkls)
                        if idx == 0:
                            original = kkls.setUpClass
                        else:
                            original = super(currentClass.__mro__[idx - 1], currentClass).setUpClass
                        def _patched(*args, **kwargs):
                            nonlocal start_time_stack
                            start_time_stack.append(freezegun.api.real_monotonic())
                            original(*args, **kwargs)
                            end_time = freezegun.api.real_monotonic()
                            _this_data['number_calls'] += 1
                            time_spent = end_time - start_time_stack.pop()
                            _this_data['time_spent'] += time_spent
                            self.profile_data['time_spent'] += time_spent
                            start_time_stack = [ts + time_spent for ts in start_time_stack]
                        return _patched
                    stack.enter_context(mock.patch.object(kls, 'setUpClass', name=f'wraps_{kls.__qualname__}', wraps=mock_method_factory(kls)))
                    last_data = kls_data
                currentClass.setUpClass()
        except Exception as e:
            currentClass._classSetupFailed = True
            className = util.strclass(currentClass)
            self._createClassOrModuleLevelException(result, e,
                                                    'setUpClass',
                                                    className)
        finally:
            if currentClass._classSetupFailed is True:
                currentClass.doClassCleanups()
                if len(currentClass.tearDown_exceptions) > 0:
                    for exc in currentClass.tearDown_exceptions:
                        self._createClassOrModuleLevelException(
                                result, exc[1], 'setUpClass', className,
                                info=exc)

    def _createClassOrModuleLevelException(self, result, exception, method_name,
                                           parent, info=None):
        errorName = f'{method_name} ({parent})'
        error = _ErrorHolder(errorName)
        if isinstance(exception, case.SkipTest):
            result.addSkip(error, str(exception))
        else:
            if not info:
                result.addError(error, sys.exc_info())
            else:
                result.addError(error, info)

    def _tearDownPreviousClass(self, test, result):
        previousClass = result._previousTestClass
        currentClass = test.__class__
        if currentClass == previousClass:
            return
        if not previousClass:
            return
        if previousClass._classSetupFailed:
            return
        if previousClass.__unittest_skip__:
            return
        try:
            previousClass.tearDownClass()
        except Exception as e:
            className = util.strclass(previousClass)
            self._createClassOrModuleLevelException(result, e,
                                                    'tearDownClass',
                                                    className)
        finally:
            previousClass.doClassCleanups()
            if len(previousClass.tearDown_exceptions) > 0:
                for exc in previousClass.tearDown_exceptions:
                    className = util.strclass(previousClass)
                    self._createClassOrModuleLevelException(result, exc[1],
                                                            'tearDownClass',
                                                            className,
                                                            info=exc)


class _ErrorHolder(object):
    """
    Placeholder for a TestCase inside a result. As far as a TestResult
    is concerned, this looks exactly like a unit test. Used to insert
    arbitrary errors into a test suite run.
    """
    # Inspired by the ErrorHolder from Twisted:
    # http://twistedmatrix.com/trac/browser/trunk/twisted/trial/runner.py

    # attribute used by TestResult._exc_info_to_string
    failureException = None

    def __init__(self, description):
        self.description = description

    def id(self):
        return self.description

    def shortDescription(self):
        return None

    def __repr__(self):
        return "<ErrorHolder description=%r>" % (self.description,)

    def __str__(self):
        return self.id()

    def run(self, result):
        # could call result.addError(...) - but this test-like object
        # shouldn't be run anyway
        pass

    def __call__(self, result):
        return self.run(result)

    def countTestCases(self):
        return 0


class OdooSuite(TestSuite):
    def _handleClassSetUp(self, test, result):
        previous_test_class = result._previousTestClass
        if not (
            previous_test_class != type(test)
            and hasattr(result, 'stats')
            and stats_logger.isEnabledFor(logging.INFO)
        ):
            super()._handleClassSetUp(test, result)
            return

        test_class = type(test)
        test_id = f'{test_class.__module__}.{test_class.__qualname__}.setUpClass'
        with result.collectStats(test_id):
            super()._handleClassSetUp(test, result)

    def _tearDownPreviousClass(self, test, result):
        previous_test_class = result._previousTestClass
        if not (
                previous_test_class
            and previous_test_class != type(test)
            and hasattr(result, 'stats')
            and stats_logger.isEnabledFor(logging.INFO)
        ):
            super()._tearDownPreviousClass(test, result)
            return

        test_id = f'{previous_test_class.__module__}.{previous_test_class.__qualname__}.tearDownClass'
        with result.collectStats(test_id):
            super()._tearDownPreviousClass(test, result)

    def has_http_case(self):
        return self.countTestCases() and any(isinstance(test_case, HttpCase) for test_case in self)
