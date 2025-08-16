import logging
import threading
import time
import importlib
import sys
import contextlib

from odoo import tools
from odoo.modules.registry import Registry
from odoo.service.server import CommonServer



_logger = logging.getLogger(__name__)

TIMEOUT = 50


if tools.config['workers'] > 1:
    _logger.error("Hot test is not supported in multi-worker mode")
    exit(1)


# Shared state for communication between bus and hot_test threads
stop_event = threading.Event()
test_finished_event = threading.Event()
test_running_lock = threading.Lock()
is_test_running_ref = {'value': False}


class HotTest(threading.Thread):
    """
    Dedicated thread for handling test execution
    """
    def __init__(self, *args, **kwargs):
        super().__init__(daemon=True, name=f'{__name__}.HotTest')
        self.test_event = threading.Event()
        self.current_module = None

    def execute_test(self, module_name):
        """Request test execution (non-blocking)."""
        self.current_module = module_name
        self.test_event.set()

    def run(self):
        while not stop_event.is_set():
            try:
                # Wait for test requests
                if self.test_event.wait():  # 1 second timeout to check stop_event
                    self.test_event.clear()
                    
                    if self.current_module:
                        self._execute_test(self.current_module)
                        self.current_module = None

            except Exception as exc:
                _logger.exception("Hot test thread error")
                time.sleep(1)

    def _execute_test(self, module_name):
        """Execute test for the given module and test tags."""
        
        with test_running_lock:
            is_test_running_ref['value'] = True
        
        try:
            _logger.info("Starting test execution for module=%s", module_name)
            
            self._reload_and_run_tests(module_name)

            _logger.info("Completed test execution for module=%s", module_name)
            
        finally:
            test_finished_event.set()
            with test_running_lock:
                is_test_running_ref['value'] = False

    def _reload_and_run_tests(self, module_name):
        """Reload test modules and run tests."""
        try:
            # Force reload of test modules
            # self._force_reload_test_modules(module_name)

            # Import test loader
            from odoo.tests import loader

            # Run at_install tests
            _logger.info("Running at_install tests for module: %s", module_name)
            # with Registry._lock:
            registry = Registry(tools.config['db_name'][0])
            try:
                # best effort to restore the test environment
                registry.loaded = False
                registry.ready = False
                at_install_suite = loader.make_suite([module_name], 'at_install')
                if at_install_suite.countTestCases():
                    at_install_results = loader.run_suite(at_install_suite)
                    _logger.info("at_install tests completed: %d tests, %d failures, %d errors",
                                at_install_results.testsRun,
                                at_install_results.failures_count,
                                at_install_results.errors_count)
            finally:
                registry.loaded = True
                registry.ready = True

            # Run post_install tests
            # _logger.info("Running post_install tests for module: %s", module_name)
            # post_install_suite = loader.make_suite([module_name], 'post_install')
            # if post_install_suite.countTestCases():
            #     post_install_results = loader.run_suite(post_install_suite)
            #     _logger.info("post_install tests completed: %d tests, %d failures, %d errors",
            #                 post_install_results.testsRun,
            #                 post_install_results.failures_count,
            #                 post_install_results.errors_count)

        except Exception as e:
            _logger.error("Error reloading and running tests for module %s: %s", module_name, e, exc_info=True)

    def _force_reload_test_modules(self, module_name):
        """Force reload of test modules that may have been modified."""
        test_module_prefix = f'odoo.addons.{module_name}.tests'

        # Find all test modules that are currently loaded
        modules_to_reload = []
        for module_key in list(sys.modules.keys()):
            if module_key.startswith(test_module_prefix):
                modules_to_reload.append(module_key)

        # Remove from sys.modules to force reload
        for module_key in modules_to_reload:
            _logger.debug("Removing module from sys.modules for reload: %s", module_key)
            del sys.modules[module_key]

        # Try to reimport the test package
        try:
            test_package = f'odoo.addons.{module_name}.tests'
            if test_package in sys.modules:
                del sys.modules[test_package]
            importlib.import_module(test_package)
            _logger.info("Successfully reloaded test package: %s", test_package)
        except ImportError as e:
            _logger.warning("Could not reload test package %s: %s", test_package, e)
        except Exception as e:
            _logger.error("Error reloading test package %s: %s", test_package, e, exc_info=True)


# Initialize and start both threads
hot_test = HotTest()

CommonServer.on_stop(stop_event.set)

with contextlib.suppress(RuntimeError):
    if not hot_test.is_alive():
        hot_test.start()
        _logger.info("Hot test thread started")
