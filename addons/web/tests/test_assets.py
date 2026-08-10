# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import re
import time
from collections import defaultdict

from lxml import etree

import odoo
import odoo.tests

from odoo.tests.common import HttpCase
from odoo.modules.module import get_manifest, get_modules
from odoo.tools import mute_logger
from odoo.tools.js_transpiler import is_odoo_module, transpile_javascript
from odoo.tools.misc import file_open

from unittest.mock import patch

_logger = logging.getLogger(__name__)


class TestAssetsGenerateTimeCommon(odoo.tests.TransactionCase):

    def generate_bundles(self, unlink=True):
        if unlink:
            self.env['ir.attachment'].search([('url', '=like', '/web/assets/%')]).unlink()  # delete existing attachement
        installed_module_names = self.env['ir.module.module'].search([('state', '=', 'installed')]).mapped('name')
        bundles = {
            key
            for module in installed_module_names
            for key in get_manifest(module).get('assets', [])
        }

        for bundle_name in bundles:
            with mute_logger('odoo.addons.base.models.assetsbundle'):
                for assets_type in 'css', 'js':
                    try:
                        start_t = time.time()
                        css = assets_type == 'css'
                        js = assets_type == 'js'
                        bundle = self.env['ir.qweb']._get_asset_bundle(bundle_name, css=css, js=js)
                        if assets_type == 'css' and bundle.stylesheets:
                            bundle.css()
                        if assets_type == 'js' and bundle.javascripts:
                            bundle.js()
                        yield (f'{bundle_name}.{assets_type}', time.time() - start_t)
                    except ValueError:
                        _logger.info('Error detected while generating bundle %r %s', bundle_name, assets_type)


@odoo.tests.tagged('post_install', '-at_install', 'assets_bundle')
class TestLogsAssetsGenerateTime(TestAssetsGenerateTimeCommon):

    def test_logs_assets_generate_time(self):
        """
        The purpose of this test is to monitor the time of assets bundle generation.
        This is not meant to test the generation failure, hence the try/except and the mute logger.
        """
        for bundle, duration in list(self.generate_bundles()):
            _logger.info('Bundle %r generated in %.2fs', bundle, duration)

    def test_logs_assets_check_time(self):
        """
        The purpose of this test is to monitor the time of assets bundle generation.
        This is not meant to test the generation failure, hence the try/except and the mute logger.
        """
        start = time.time()
        for bundle, duration in self.generate_bundles(False):
            _logger.info('Bundle %r checked in %.2fs', bundle, duration)
        duration = time.time() - start
        _logger.info('All bundle checked in %.2fs', duration)


@odoo.tests.tagged('post_install', '-at_install', '-standard', 'test_assets')
class TestPregenerateTime(HttpCase):

    def test_logs_pregenerate_time(self):
        self.env['ir.qweb']._pregenerate_assets_bundles()
        start = time.time()
        self.env.transaction.clear()
        with self.profile(collectors=['sql', odoo.tools.profiler.PeriodicCollector(interval=0.01)], disable_gc=True):
            self.env['ir.qweb']._pregenerate_assets_bundles()
        duration = time.time() - start
        _logger.info('All bundle checked in %.2fs', duration)

@odoo.tests.tagged('post_install', '-at_install', '-standard', 'assets_bundle')
class TestAssetsGenerateTime(TestAssetsGenerateTimeCommon):
    """
    This test is meant to be run nightly to ensure bundle generation does not exceed
    a low threshold
    """

    def test_assets_generate_time(self):
        thresholds = {
            'project.webclient.js': 2.5,
            'point_of_sale.pos_assets_backend.js': 2.5,
            'web.assets_backend.js': 2.5,
        }
        for bundle, duration in self.generate_bundles():
            threshold = thresholds.get(bundle, 2)
            self.assertLess(duration, threshold, "Bundle %r took more than %s sec" % (bundle, threshold))

@odoo.tests.tagged('post_install', '-at_install')
class TestLoad(HttpCase):
    def test_assets_already_exists(self):
        self.authenticate('admin', 'admin')
        # TODO xdo adapt this test. url open won't generate attachment anymore even if not pregenerated
        _save_attachment = odoo.addons.base.models.assetsbundle.AssetsBundle.save_attachment

        def save_attachment(bundle, extension, content):
            attachment = _save_attachment(bundle, extension, content)
            message = f"Trying to save an attachement for {bundle.name} when it should already exist: {attachment.url}"
            _logger.error(message)
            return attachment

        with patch('odoo.addons.base.models.assetsbundle.AssetsBundle.save_attachment', save_attachment):
            self.url_open('/odoo').raise_for_status()
            self.url_open('/').raise_for_status()


@odoo.tests.tagged('post_install', '-at_install')
class TestWebAssetsCursors(HttpCase):
    """
    This tests class tests the specificities of the route /web/assets regarding used connections.

    The route is almost always read-only, except when the bundle is missing/outdated.
    To avoid retrying in all cases on the first request after an update/change, the route
    uses a cursor to check if the bundle is up-to-date, then opens a new cursor to generate
    the bundle if needed.

    This optimization is only possible because the route has a simple flow: check, generate, return.
    No other operation is done on the database in between.
    We don't want to open another cursor to generate the bundle if the check is done with a read/write
    cursor, if we don't have a replica.
    """
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.bundle_name = 'web.assets_frontend'
        cls.bundle_version = cls.env['ir.qweb']._get_asset_bundle(cls.bundle_name).get_version('css')

    def setUp(self):
        super().setUp()
        self.env['ir.attachment'].search([('url', '=like', '/web/assets/%')]).unlink()
        self.bundle_name = 'web.assets_frontend'

    def _get_generate_cursors_readwriteness(self):
        """
        This method returns the list cursors read-writness used to generate the bundle
        :returns: [('ro|rw', '(ro_requested|rw_requested)')]
        """
        cursors = []
        original_cursor = self.env.registry.cursor

        def cursor(readonly=False):
            cursor = original_cursor(readonly=readonly)
            cursors.append(('ro' if cursor.readonly else 'rw', '(ro_requested)' if readonly else '(rw_requested)'))
            return cursor

        with patch.object(self.env.registry, 'cursor', cursor):
            response = self.url_open(f'/web/assets/{self.bundle_version}/{self.bundle_name}.min.css', allow_redirects=False)
            self.assertEqual(response.status_code, 200)

        return cursors

    def test_web_binary_keep_cursor_ro(self):
        """
        With replica, will need two cursors for generation, then a read-only cursor for all other call
        """
        self.assertEqual(
            self._get_generate_cursors_readwriteness(),
            [
                ('ro', '(ro_requested)'),
                ('rw', '(rw_requested)'),
            ],
            'A ro and rw cursor should be used to generate assets without replica when cold',
        )

        self.assertEqual(
            self._get_generate_cursors_readwriteness(),
            [
                ('ro', '(ro_requested)'),
            ],
            'Only one readonly cursor should be used to generate assets wit replica when warm',
        )

    def test_web_binary_keep_cursor_rw(self):
        self.set_registry_readonly_mode(False)
        self.assertEqual(
            self._get_generate_cursors_readwriteness(),
            [
                ('rw', '(ro_requested)'),
            ],
            'Only one readwrite cursor should be used to generate assets without replica',
        )

    def test_web_binary_streams_generated_asset_from_rw_cursor(self):
        """
        When a readonly asset request has to generate a fresh bundle, the response should
        not reread that freshly created attachment from the readonly cursor.
        """
        generated_attachment_ids = set()
        original_save_attachment = odoo.addons.base.models.assetsbundle.AssetsBundle.save_attachment
        original_get_stream_from = odoo.addons.base.models.ir_binary.IrBinary._get_stream_from

        def save_attachment(bundle, extension, content):
            attachment = original_save_attachment(bundle, extension, content)
            generated_attachment_ids.update(attachment.ids)
            return attachment

        def get_stream_from(binary, record, *args, **kwargs):
            if (
                binary.env.cr.readonly
                and record._name == 'ir.attachment'
                and record.id in generated_attachment_ids
            ):
                raise AssertionError("Freshly generated assets should not be streamed from a readonly cursor")
            return original_get_stream_from(binary, record, *args, **kwargs)

        with patch('odoo.addons.base.models.assetsbundle.AssetsBundle.save_attachment', autospec=True, side_effect=save_attachment):
            with patch('odoo.addons.base.models.ir_binary.IrBinary._get_stream_from', autospec=True, side_effect=get_stream_from):
                response = self.url_open(f'/web/assets/{self.bundle_version}/{self.bundle_name}.min.css', allow_redirects=False)
                self.assertEqual(response.status_code, 200)


RE_MODULE_DEFINE = re.compile(r"""odoo\s*\.\s*define\(\s*(['"`])(?P<name>.+?)\1\s*,\s*\[(?P<deps>[^\]]*)\]""")
RE_STRING = re.compile(r"""['"`]([^'"`]+)['"`]""")
RE_IGNORE_MISSING_DEPS = re.compile(
    r"""__odooIgnoreMissingDependencies\s*=\s*(?P<value>true|false)"""
)
RE_LOAD_BUNDLE = re.compile(r"""loadBundle\(\s*(['"`])(?P<name>[\w.]+)\1""")
RE_XMLID = re.compile(r"^[\w.]+$")
RE_WORD = re.compile(r"^\w+$")


class TestBundleImports(odoo.tests.TransactionCase):
    """
    Checks that on every page, and for every database, the module loader can
    resolve the imports of every javascript module the page's bundles hold.

    The pages and the bundles they load are read from the qweb templates
    (t-call-assets, t-call and template inheritance) and from lazy
    loadBundle() calls in the bundles themselves. Bundles wrapped in
    __odooIgnoreMissingDependencies markers (web.assets_tests loaded outside
    the backend) have their imports ignored, as the module loader does.

    Databases are simulated per module with its dependency closure, as a file
    or a module re-added by another module hides a missing one on a database
    installing both, e.g. website re-adding lazyloader in the hoot bundle.

    Every source the checks read is matched with a regular expression, so
    test_reads_the_real_sources and test_detects_a_missing_import pin what the
    checks find: a pattern that stops matching would let them pass on an empty
    page, an empty bundle or an empty list of imports.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.parse_cache = {}
        cls.lazy_loaders = defaultdict(
            set
        )  # bundle -> files calling loadBundle() on it
        cls.all_modules = [
            mod for mod in get_modules() if get_manifest(mod)["installable"]
        ]
        cls._load_template_graph()
        cls._load_bundle_graph()
        cls._load_pages()

    def setUp(self):
        super().setUp()
        # the content of a bundle depends on the 'ir.asset' records, which a
        # test can change: memoize it per test
        self.fill_cache = {}

    @classmethod
    def qualify(cls, xmlid, module):
        return xmlid if "." in xmlid else f"{module}.{xmlid}"

    @classmethod
    def _load_template_graph(cls):
        cls.tpl_items = defaultdict(list)  # xmlid -> [(module, kind, value, guards)]
        cls.tpl_inherit = {}
        cls.tpl_primary_parent = {}
        cls.call_params = defaultdict(dict)  # (xmlid, called xmlid) -> literal params

        def prior_condition(parent, else_el):
            condition = None
            for sibling in parent:
                if sibling is else_el:
                    break
                if isinstance(sibling.tag, str) and sibling.get("t-if") is not None:
                    condition = sibling.get("t-if")
            return condition

        def walk(node, xmlid, module, guards):
            for el in node:
                if not isinstance(el.tag, str):
                    continue
                own_guards = guards
                condition = el.get("t-if") or el.get("t-elif")
                if condition is not None:
                    own_guards = guards + ((condition, False),)
                elif el.get("t-else") is not None:
                    condition = prior_condition(node, el)
                    if condition is not None:
                        own_guards = guards + ((condition, True),)
                bundle = el.get("t-call-assets")
                if bundle and RE_XMLID.match(bundle):
                    cls.tpl_items[xmlid].append((module, "assets", bundle, own_guards))
                called = el.get("t-call")
                if called and RE_XMLID.match(called) and "." in called:
                    cls.tpl_items[xmlid].append((module, "call", called, own_guards))
                    params = {
                        key: value
                        for key, value in el.attrib.items()
                        if RE_WORD.match(key) and value in ("True", "False")
                    }
                    if params:
                        cls.call_params[xmlid, called].update(params)
                walk(el, xmlid, module, own_guards)

        for module in cls.all_modules:
            for data_path in get_manifest(module)["data"]:
                if not data_path.endswith(".xml"):
                    continue
                try:
                    with file_open(f"{module}/{data_path}", "rb") as fp:
                        tree = etree.parse(fp)
                except (etree.XMLSyntaxError, FileNotFoundError):
                    continue
                for node in tree.iter("template"):
                    node_id = node.get("id") or node.get("inherit_id")
                    if not node_id:
                        continue
                    xmlid = cls.qualify(node_id, module)
                    inherit = node.get("inherit_id")
                    if inherit and cls.qualify(inherit, module) != xmlid:
                        # a primary child renders alone, on top of the template
                        # it inherits; a regular child renders within it
                        if node.get("primary") == "True":
                            cls.tpl_primary_parent[xmlid] = cls.qualify(inherit, module)
                        else:
                            cls.tpl_inherit[xmlid] = cls.qualify(inherit, module)
                    walk(node, xmlid, module, ())

        cls.merged_items = defaultdict(list)
        cls.merged_params = defaultdict(dict)
        cls.tpl_param_names = defaultdict(set)  # xmlid -> variables its callers set
        for xmlid, items in cls.tpl_items.items():
            cls.merged_items[cls._merge_root(xmlid)].extend(items)
        for (xmlid, called), params in cls.call_params.items():
            cls.merged_params[cls._merge_root(xmlid), called].update(params)
            cls.tpl_param_names[cls._merge_root(called)] |= set(params)

    @classmethod
    def _load_bundle_graph(cls):
        # bundle contents and loadBundle() call sites, on the full addons path
        cls.bundle_declarers = defaultdict(set)
        for module in cls.all_modules:
            for bundle in get_manifest(module)["assets"]:
                cls.bundle_declarers[bundle].add(module)
        cls.fill_errors = {}
        file_bundles = defaultdict(set)
        for bundle in cls.bundle_declarers:
            try:
                paths = cls.env["ir.asset"]._get_asset_paths_for_addons(
                    bundle, sorted(cls.all_modules), cls.all_modules
                )
            except ValueError as error:
                # an include-only bundle fragment with a position-dependent
                # directive cannot be built alone: its includers check it
                cls.fill_errors[bundle] = str(error)
                continue
            for path, _full_path, _bundle, _last_modified in paths:
                if cls._is_module_file(path):
                    cls._parse_file(path)
                    file_bundles[path].add(bundle)
        # a bundle loaded with loadBundle() comes on top of the page holding its
        # caller, after the bundles its own callers came with
        cls.lazy_parents = {
            lazy_bundle: set().union(*(file_bundles[url] for url in files))
            for lazy_bundle, files in cls.lazy_loaders.items()
            if lazy_bundle in cls.bundle_declarers
        }

    @classmethod
    def _load_pages(cls):
        # pages: templates nobody t-calls
        full_closure = frozenset(cls.all_modules)
        tcalled = {
            cls._merge_root(value)
            for items in cls.merged_items.values()
            for _module, kind, value, _guards in items
            if kind == "call"
        }
        cls.pages = {}
        for xmlid in cls.merged_items:
            if xmlid in tcalled:
                continue
            bundles = cls._page_bundles(xmlid, {}, full_closure, set())
            if bundles:
                cls.pages[xmlid] = bundles
        # the modules whose database can render the page
        cls.page_modules = defaultdict(set)
        for xmlid, bundles in cls.pages.items():
            cls.page_modules[xmlid].add(xmlid.split(".")[0])
            for bundle in bundles | cls._attached_lazy_bundles(bundles):
                cls.page_modules[xmlid] |= cls.bundle_declarers[bundle]
        cls.closures = {}
        for module in cls.all_modules:
            closure = set()
            todo = [module]
            while todo:
                mod = todo.pop()
                if mod not in closure:
                    closure.add(mod)
                    todo += get_manifest(mod)["depends"]
            cls.closures[module] = frozenset(closure)
        # the bundles and the pages only depend on the modules declaring assets
        # or templates: memoize the checks on that subset
        cls.relevant_modules = frozenset(
            module for module in cls.all_modules if get_manifest(module)["assets"]
        ) | {
            module
            for items in cls.merged_items.values()
            for module, _k, _v, _g in items
        }

    @classmethod
    def _merge_root(cls, xmlid):
        while xmlid in cls.tpl_inherit:
            xmlid = cls.tpl_inherit[xmlid]
        return xmlid

    @classmethod
    def _is_module_file(cls, path):
        # an external URL ships as-is, with no content to resolve
        return path.startswith("/") and path.endswith(".js")

    @classmethod
    def _guard_active(cls, xmlid, guards, params):
        # Fold a guard whose condition is exactly a variable some t-call passes
        # to the template as a literal, an absent one being falsy. A condition
        # on the render context counts as active.
        for condition, negated in guards:
            if RE_WORD.match(condition) and condition in cls.tpl_param_names[xmlid]:
                if (params.get(condition) == "True") == negated:
                    return False
        return True

    @classmethod
    def _page_bundles(cls, xmlid, params, closure, seen):
        # bundles loaded by the page rendering the given template, on a database
        # installing the given modules
        xmlid = cls._merge_root(xmlid)
        if xmlid in seen:
            return set()
        seen.add(xmlid)
        result = set()
        for module, kind, value, guards in cls.merged_items.get(xmlid, ()):
            if module not in closure or not cls._guard_active(xmlid, guards, params):
                continue
            if kind == "assets":
                result.add(value)
            else:
                called_params = cls.merged_params.get((xmlid, value), {})
                result |= cls._page_bundles(value, called_params, closure, seen)
        if xmlid in cls.tpl_primary_parent:
            result |= cls._page_bundles(
                cls.tpl_primary_parent[xmlid], params, closure, seen
            )
        return result

    @classmethod
    def _attached_lazy_bundles(cls, page_bundles):
        attached = set()
        changed = True
        while changed:
            changed = False
            for lazy_bundle, parents in cls.lazy_parents.items():
                if lazy_bundle not in attached and parents & (page_bundles | attached):
                    attached.add(lazy_bundle)
                    changed = True
        return attached

    @classmethod
    def _lazy_chain(cls, lazy_bundle, attached):
        chain = {lazy_bundle}
        todo = [lazy_bundle]
        while todo:
            for parent in cls.lazy_parents.get(todo.pop(), ()) & attached:
                if parent not in chain:
                    chain.add(parent)
                    todo.append(parent)
        return chain

    @classmethod
    def _parse_file(cls, url):
        if url not in cls.parse_cache:
            with file_open(url.lstrip("/"), "r", filter_ext=(".js",)) as fp:
                content = fp.read()
            for match in RE_LOAD_BUNDLE.finditer(content):
                cls.lazy_loaders[match["name"]].add(url)
            ignore = None
            ignore_match = RE_IGNORE_MISSING_DEPS.search(content)
            if ignore_match:
                ignore = ignore_match["value"] == "true"
            if is_odoo_module(url, content):
                content = transpile_javascript(url, content)
            defined, deps = set(), set()
            for match in RE_MODULE_DEFINE.finditer(content):
                defined.add(match["name"])
                deps.update(RE_STRING.findall(match["deps"]))
            cls.parse_cache[url] = (defined, deps, ignore)
        return cls.parse_cache[url]

    def _bundle_files(self, bundle, closure_key):
        addons = sorted(closure_key)
        return [
            path
            for path, _full_path, _bundle, _last_modified in self.env[
                "ir.asset"
            ]._get_asset_paths_for_addons(bundle, addons, addons)
            if self._is_module_file(path)
        ]

    def _bundle_modules(self, bundle, closure_key):
        # (defined modules, imported modules) of the bundle on a database
        # installing the modules of the given closure key
        if (bundle, closure_key) not in self.fill_cache:
            defined, deps = set(), set()
            ignoring = False
            for path in self._bundle_files(bundle, closure_key):
                file_defined, file_deps, ignore = self._parse_file(path)
                defined |= file_defined
                if not ignoring:
                    # the module loader skips the imports of the modules defined
                    # while __odooIgnoreMissingDependencies is set
                    deps |= file_deps
                if ignore is not None:
                    ignoring = ignore
            self.fill_cache[bundle, closure_key] = (defined, deps)
        return self.fill_cache[bundle, closure_key]

    def _unresolved_imports(self, pages, only_module=None):
        """
        Resolves the given pages for the dependency closure of every module
        whose database can render them.

        :returns: dict of a tuple of missing modules -> (pages, modules)
        """
        unresolved = defaultdict(lambda: (set(), set()))
        checked = set()
        for xmlid in pages:
            for root in self.page_modules[xmlid]:
                closure = self.closures[root]
                if (
                    only_module not in (None, root)
                    or xmlid.split(".")[0] not in closure
                ):
                    continue
                closure_key = closure & self.relevant_modules
                if (xmlid, closure_key) in checked:
                    continue
                checked.add((xmlid, closure_key))
                page_bundles = self._page_bundles(xmlid, {}, closure, set())
                defined, deps = set(), set()
                for bundle in page_bundles - set(self.fill_errors):
                    bundle_defined, bundle_deps = self._bundle_modules(
                        bundle, closure_key
                    )
                    defined |= bundle_defined
                    deps |= bundle_deps
                if missing := deps - defined:
                    found_pages, found_modules = unresolved[tuple(sorted(missing))]
                    found_pages.add(xmlid)
                    found_modules.add(root)
                # a lazy bundle resolves against the page and the bundles of its
                # own callers, but never completes the page itself
                attached = self._attached_lazy_bundles(page_bundles)
                for lazy_bundle in attached:
                    lazy_defined, lazy_deps = set(defined), set()
                    for bundle in self._lazy_chain(lazy_bundle, attached):
                        bundle_defined, bundle_deps = self._bundle_modules(
                            bundle, closure_key
                        )
                        lazy_defined |= bundle_defined
                        if bundle == lazy_bundle:
                            lazy_deps |= bundle_deps
                    if missing := lazy_deps - lazy_defined:
                        found_pages, found_modules = unresolved[tuple(sorted(missing))]
                        found_pages.add(f"{lazy_bundle} loaded on {xmlid}")
                        found_modules.add(root)
        return unresolved

    def test_bundles_resolve_their_imports(self):
        unresolved = self._unresolved_imports(self.pages)
        if unresolved:
            self.fail(
                "Some pages cannot resolve all the modules their bundles import:\n%s"
                % "\n".join(
                    "%s: on %s pages (e.g. %s), on a database installing e.g. %s"
                    % (
                        ", ".join(missing[:8]),
                        len(found_pages),
                        ", ".join(sorted(found_pages)[:3]),
                        ", ".join(sorted(found_modules)[:3]),
                    )
                    for missing, (found_pages, found_modules) in sorted(
                        unresolved.items()
                    )
                )
            )

    def test_reads_the_real_sources(self):
        # the hoot page, its two bundles and the modules of the file at the
        # origin of the lazyloader fix
        self.assertIn("web.unit_tests_suite", self.pages)
        self.assertEqual(
            self.pages["web.unit_tests_suite"],
            {"web.assets_unit_tests_setup", "web.assets_unit_tests"},
        )
        defined, deps, ignore = self._parse_file(
            "/web/static/src/public/interaction_service.js"
        )
        self.assertEqual(defined, {"@web/public/interaction_service"})
        self.assertIn("@web/public/lazyloader", deps)
        self.assertIsNone(ignore)

        # the modules of a page reached through a t-call and a primary parent
        webclient = self._page_bundles(
            "web.webclient_bootstrap", {}, self.closures["web"], set()
        )
        self.assertIn("web.assets_web", webclient)
        webclient_modules = self._bundle_modules(
            "web.assets_web", self.closures["web"] & self.relevant_modules
        )[0]
        self.assertIn("@web/core/registry", webclient_modules)

        # the two variants of the tests bundle, one per value of the t-if
        # variable the pages pass, never on the same page
        ignored_variant = {
            xmlid
            for xmlid, bundles in self.pages.items()
            if "web.__assets_tests_call__" in bundles
        }
        strict_variant = {
            xmlid
            for xmlid, bundles in self.pages.items()
            if "web.assets_tests" in bundles
        }
        self.assertIn("web.webclient_bootstrap", strict_variant)
        self.assertTrue(ignored_variant)
        self.assertFalse(ignored_variant & strict_variant)

        # the markers the module loader reads, in the bundle wrapping the tours
        # of every module in a single bundle
        markers = [
            self._parse_file(path)[2]
            for path in self._bundle_files(
                "web.__assets_tests_call__", frozenset(self.all_modules)
            )
            if self._parse_file(path)[2] is not None
        ]
        self.assertEqual(markers, [True, False])

        # the lazy bundles, loaded from the javascript of another bundle
        self.assertIn("web.assets_emoji", self.lazy_parents)
        self.assertIn("web.assets_backend", self.lazy_parents["web.assets_emoji"])

    def test_detects_a_missing_import(self):
        page = "web.unit_tests_suite"
        closure = self.closures["web"]
        closure_key = closure & self.relevant_modules
        before = self._unresolved_imports([page], only_module="web")

        # a module the page imports, and whose file is the only one defining it
        definers = defaultdict(set)
        imported = set()
        for bundle in sorted(self._page_bundles(page, {}, closure, set())):
            imported |= self._bundle_modules(bundle, closure_key)[1]
            for path in self._bundle_files(bundle, closure_key):
                for module in self._parse_file(path)[0]:
                    definers[module].add((bundle, path))
        victims = sorted(
            (module, *next(iter(files)))
            for module, files in definers.items()
            if module in imported and len(files) == 1
        )
        self.assertTrue(victims, "The page should import a module of its own bundles")
        victim, bundle, path = victims[0]

        # removing its file leaves the page with that import unresolved
        self.env["ir.asset"].create({
            "name": f"remove {path}",
            "bundle": bundle,
            "directive": "remove",
            "path": path.lstrip("/"),
        })
        self.fill_cache = {}
        after = self._unresolved_imports([page], only_module="web")
        found = {module for missing in after for module in missing}
        self.assertEqual(
            found - {module for missing in before for module in missing}, {victim}
        )
