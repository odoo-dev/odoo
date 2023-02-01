import re
import logging

_logger = logging.getLogger(__name__)


class TagsSelector(object):
    """ Test selector based on tags. """
    filter_spec_re = re.compile(r'^([+-]?)(\*|\w*)(?:/(\w*))?(?::(\w*))?(?:\.(\w*))?$')  # [-][tag][/module][:class][.method]

    def __init__(self, spec):
        """ Parse the spec to determine tags to include and exclude. """
        filter_specs = {t.strip() for t in spec.split(',') if t.strip()}
        self.exclude = set()
        self.include = set()

        for filter_spec in filter_specs:
            match = self.filter_spec_re.match(filter_spec)
            if not match:
                _logger.error('Invalid tag %s', filter_spec)
                continue

            sign, tag, module, klass, method = match.groups()
            is_include = sign != '-'

            if not tag and is_include:
                # including /module:class.method implicitly requires 'standard'
                tag = 'standard'
            elif not tag or tag == '*':
                # '*' indicates all tests (instead of 'standard' tests only)
                tag = None
            test_filter = (tag, module, klass, method)

            if is_include:
                self.include.add(test_filter)
            else:
                self.exclude.add(test_filter)

        if self.exclude and not self.include:
            self.include.add(('standard', None, None, None, None))

    def check(self, test):
        """ Return whether ``arg`` matches the specification: it must have at
            least one tag in ``self.include`` and none in ``self.exclude`` for each tag category.
        """
        if not hasattr(test, 'test_tags'): # handle the case where the Test does not inherit from BaseCase and has no test_tags
            _logger.debug("Skipping test '%s' because no test_tag found.", test)
            return False

        test_module = getattr(test, 'test_module', None)
        test_class = getattr(test, 'test_class', None)
        test_tags = test.test_tags | {test_module}  # module as test_tags deprecated, keep for retrocompatibility,
        test_method = getattr(test, '_testMethodName', None)

        def _is_matching(test_filter):
            (tag, module, klass, method) = test_filter
            if tag and tag not in test_tags:
                return False
            elif module and module != test_module:
                return False
            elif klass and klass != test_class:
                return False
            elif method and test_method and method != test_method:
                return False
            return True

        if any(_is_matching(test_filter) for test_filter in self.exclude):
            return False

        if any(_is_matching(test_filter) for test_filter in self.include):
            return True

        return False
