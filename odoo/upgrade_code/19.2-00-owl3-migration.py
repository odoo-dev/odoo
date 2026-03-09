import os
import re
from odoo.upgrade_code.tools_props_transformation import parse_default_props, parse_schema


PATH_MODULE_RE = re.compile(r'^.*/([^/]+)/static/src/([^\.]+)(\.test)?\.js$')
STATIC_PROPS_RE = re.compile(r'static\s+props\s+=\s+')
STATIC_DEFAULT_PROPS_RE = re.compile(r'static\s+defaultProps\s+=\s+')
CLASS_RE = re.compile(r'class\s+(\w+)\s+extends\s+(\w+)')


EXCLUDED_PATH = (
    'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.js',
    'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.xml',
    'iot_drivers/static/src/',
    'web/static/src/owl2',
    'addons/web/static/lib/owl/owl.js',
)

CHECKSUM_FILES = (
    'pos_blackbox_be/static/src/pos/overrides/navbar/navbar.xml',
    'l10n_eu_iot_scale_cert/controllers/checksum.py',
    'l10n_eu_iot_scale_cert/static/src/app/utils/scale/certified_iot_scale.js',
    'l10n_eu_iot_scale_cert/static/src/pos_overrides/components/scale_screen/certified_scale_screen.js',
    'l10n_eu_iot_scale_cert/static/src/pos_overrides/components/scale_screen/certified_scale_screen.xml',
    'l10n_eu_iot_scale_cert/receipt/pos_order_receipt.xml',
    'l10n_eu_iot_scale_cert/static/src/pos_overrides/components/orderline/certified_orderline.xml',
    'iot_drivers/iot_handlers/drivers/serial_scale_driver.py',
)


class JSTooling:
    @staticmethod
    def is_commented(content: str, position: int) -> bool:
        """Checks if the word at the given position is on a commented line.

        Args:
            content: The full file content.
            position: The index of the word to check.

        Returns:
            True if the line starts with // before the position.
        """
        # We look back to the start of the current line
        line_start = content.rfind('\n', 0, position) + 1
        line_text = content[line_start:position]
        return '//' in line_text

    @staticmethod
    def add_import(content: str, name: str, source: str) -> str:
        """Adds a named import to a specific source.

        If the source already exists, appends the name and preserves multiline
        formatting if the original import was multiline.

        Args:
            content: The JS file content.
            name: The name of the hook or variable to import.
            source: The library source (e.g., '@odoo/owl').

        Returns:
            The updated file content.
        """
        pattern = rf'import\s*\{{([^}}]*)\}}\s*from\s*(["\']){source}\2;?'
        match = re.search(pattern, content, re.DOTALL)

        if match:
            raw_content = match.group(1)
            quote = match.group(2)
            is_multiline = '\n' in raw_content
            names = [n.strip() for n in raw_content.split(',') if n.strip()]

            if name not in names:
                names.append(name)
                names.sort()  # Alphabetical order for consistency

                if is_multiline:
                    formatted = ',\n    '.join(names)
                    new_import = f'import {{\n    {formatted},\n}} from {quote}{source}{quote};'
                else:
                    new_import = f'import {{ {", ".join(names)} }} from {quote}{source}{quote};'

                return content[:match.start()] + new_import + content[match.end():]
            return content

        return f'import {{ {name} }} from "{source}";\n{content}'

    @staticmethod
    def remove_import(content: str, name: str, source: str) -> str:
        """Removes a named import from a source.

        Deletes the entire line if no imports are left.
        Handles multiline formatting during cleanup.

        Args:
            content: The JS file content.
            name: The name of the import to remove.
            source: The library source.

        Returns:
            The updated file content.
        """
        pattern = rf'import\s*\{{([^}}]*)\}}\s*from\s*(["\']){source}\2;?\n?'

        def replacer(match):
            raw_content = match.group(1)
            quote = match.group(2)
            is_multiline = '\n' in raw_content
            names = [n.strip() for n in raw_content.split(',') if n.strip()]

            if name in names:
                names.remove(name)

            if not names:
                return ""  # Line is removed if no names left

            if is_multiline and len(names) > 1:
                formatted = ',\n    '.join(names)
                return f'import {{\n    {formatted},\n}} from {quote}{source}{quote};\n'
            else:
                return f'import {{ {", ".join(names)} }} from {quote}{source}{quote};\n'

        return re.sub(pattern, replacer, content, flags=re.DOTALL)

    @staticmethod
    def transform_xml_literals(content: str, transform_func: callable) -> str:
        """Finds all xml`template` literals and applies a transformation function.

        Args:
            content: The JS file content.
            transform_func: Function to apply to the inner XML string.

        Returns:
            The JS content with transformed XML templates.
        """
        pattern = re.compile(r"(\bxml\s*`)(.*?)(`)", re.DOTALL)

        def replacer(match: re.Match) -> str:
            prefix = match.group(1)
            xml_content = match.group(2)
            suffix = match.group(3)
            return f"{prefix}{transform_func(xml_content)}{suffix}"

        return pattern.sub(replacer, content)

    @staticmethod
    def transform_js_string_literals(content: str, transform_func: callable) -> str:
        """Finds JS string literals ('...', "...", `...`) and applies a transformation function.

        Args:
            content: The JS file content.
            transform_func: Function to apply to the inner string.

        Returns:
            The JS content with transformed string literals.
        """
        pattern = re.compile(
            r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`",
            re.DOTALL,
        )

        def replacer(match: re.Match) -> str:
            literal = match.group(0)
            delimiter = literal[0]
            inner = literal[1:-1]
            return delimiter + transform_func(inner) + delimiter

        return pattern.sub(replacer, content)

    @staticmethod
    def transform_arch_templates(content: str, transform_func: callable) -> str:
        """Finds arch: `...` or arch = `...` template literals and applies a transform
        function to the inner XML string.
        """
        pattern = re.compile(r"(\barch\b\s*(?:[:=])\s*`)(.*?)(`)", re.DOTALL)

        def replacer(match: re.Match) -> str:
            prefix = match.group(1)
            xml_content = match.group(2)
            suffix = match.group(3)
            return f"{prefix}{transform_func(xml_content)}{suffix}"

        return pattern.sub(replacer, content)

    @staticmethod
    def has_active_usage(content: str, word: str) -> bool:
        """Checks if a word is used outside of a comment line.

        Args:
            content: The file content.
            word: The word to look for (e.g., 'useEffect').

        Returns:
            True if at least one usage is not commented out.
        """
        for match in re.finditer(rf'\b{word}\(', content):
            if not JSTooling.is_commented(content, match.start()):
                return True
        return False

    def replace_usage(content: str, old_name: str, new_name: str) -> str:
        """Replaces variable usage using word boundaries.

        Args:
            content: The file content.
            old_name: Original variable name.
            new_name: New variable name.
        Returns:
            The updated content.
        """
        return re.sub(rf'\b{old_name}\b', new_name, content)

    @staticmethod
    def clean_whitespace(content: str) -> str:
        """Removes trailing whitespace and lines containing only spaces.

        Args:
            content: The file content.

        Returns:
            Cleaned content.
        """
        content = re.sub(r'^[ \t]+$', '', content, flags=re.MULTILINE)
        content = re.sub(r'[ \t]+$', '', content, flags=re.MULTILINE)
        return content

    @staticmethod
    def get_js_files(file_manager):
        path_pattern = re.compile('|'.join(EXCLUDED_PATH))
        return [
            file for file in file_manager
            if '/static/src/' in file.path._str
            and file.path.suffix == '.js'
            and not re.search(path_pattern, file.path._str)
        ]

    def get_template_files(file_manager):
        excluded_path_pattern = re.compile('|'.join(EXCLUDED_PATH + CHECKSUM_FILES))
        return [
            file for file in file_manager
            if '/static/src/' in file.path._str
            and file.path.suffix in ['.xml', '.js']
            and not re.search(excluded_path_pattern, file.path._str)
        ]


class MigrationCollector:
    """Collects logs from multiple sub-functions and pushes them to FileManager."""

    def __init__(self, file_manager):
        self.file_manager = file_manager
        self.reports = []

    def run_sub(self, name: str, func) -> None:
        modified_before = sum(1 for f in self.file_manager if f.dirty)
        errors = []
        infos = []

        def log_info(msg):
            infos.append(msg)

        def log_error(path, err):
            errors.append(f"  ❌ {path}: {err}")

        func(self.file_manager, log_info, log_error)

        modified_after = sum(1 for f in self.file_manager if f.dirty)
        count = modified_after - modified_before

        report = [f"\n🚀 TASK: {name}", "-" * 40]
        if infos:
            report.extend([f"  ℹ️  {i}" for i in infos])
        if errors:
            report.append("  ⚠️  ERRORS:")
            report.extend(errors)
        report.append(f"  ✅ Files modified: {count}")

        self.reports.append("\n".join(report))

    def finalize(self) -> None:
        if self.reports:
            self.file_manager.add_to_summary("\n".join(self.reports))


def upgrade_useeffect(file_manager, log_info, log_error):
    """Sub-task: Migrate useEffect to useLayoutEffect, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'useEffect'):
                continue
            file.content = JSTooling.remove_import(file.content, 'useEffect', '@odoo/owl')
            file.content = JSTooling.replace_usage(file.content, 'useEffect', 'useLayoutEffect')
            file.content = JSTooling.add_import(file.content, 'useLayoutEffect', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_onwillrender(file_manager, log_info, log_error):
    """Sub-task: Migrate onWillRender, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'onWillRender'):
                continue
            file.content = JSTooling.remove_import(file.content, 'onWillRender', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'onWillRender', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_onrendered(file_manager, log_info, log_error):
    """Sub-task: Migrate onRendered, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'onRendered'):
                continue
            file.content = JSTooling.remove_import(file.content, 'onRendered', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'onRendered', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_usecomponent(file_manager, log_info, log_error):
    """Sub-task: Migrate useComponent, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'useComponent'):
                continue
            file.content = JSTooling.remove_import(file.content, 'useComponent', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'useComponent', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_useenv(file_manager, log_info, log_error):
    """Sub-task: Migrate useEnv, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'useEnv'):
                continue
            file.content = JSTooling.remove_import(file.content, 'useEnv', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'useEnv', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_usesubenv(file_manager, log_info, log_error):
    """Sub-task: Migrate useSubEnv, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'useSubEnv'):
                continue
            file.content = JSTooling.remove_import(file.content, 'useSubEnv', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'useSubEnv', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_usechildsubenv(file_manager, log_info, log_error):
    """Sub-task: Migrate useChildSubEnv, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'useChildSubEnv'):
                continue
            file.content = JSTooling.remove_import(file.content, 'useChildSubEnv', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'useChildSubEnv', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_useref(file_manager, log_info, log_error):
    """Sub-task: Migrate useRef, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'useRef'):
                continue
            file.content = JSTooling.remove_import(file.content, 'useRef', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'useRef', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_usestate(file_manager, log_info, log_error):
    """Sub-task: Migrate useState, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'useState'):
                continue
            file.content = JSTooling.remove_import(file.content, 'useState', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'useState', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_reactive(file_manager, log_info, log_error):
    """Sub-task: Migrate reactive, ignoring comments."""
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'reactive'):
                continue
            file.content = JSTooling.remove_import(file.content, 'reactive', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'reactive', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_use_external_listener(file_manager, log_info, log_error):
    """ Changes the imports from useExternalListeners from "@odoo/owl" to "@web/owl2/utils". """
    js_files = JSTooling.get_js_files(file_manager)

    for fileno, file in enumerate(js_files, start=1):
        try:
            if not JSTooling.has_active_usage(file.content, 'useExternalListener'):
                continue
            file.content = JSTooling.remove_import(file.content, 'useExternalListener', '@odoo/owl')
            file.content = JSTooling.add_import(file.content, 'useExternalListener', '@web/owl2/utils')
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)
        file_manager.print_progress(fileno, len(js_files))


def upgrade_tportal(file_manager, log_info, log_error):
    """Sub-task: Migrate t-portal, ignoring comments."""
    path_pattern = re.compile('|'.join(EXCLUDED_PATH))
    files = [
        file for file in file_manager
        if '/static/src/' in file.path._str
        and file.path.suffix in ['.xml', '.js']
        and not re.search(path_pattern, file.path._str)
    ]
    if not files:
        return

    reg_t_portal = re.compile(r"\bt-portal(?=\s*=\s*['\"])")

    for fileno, file in enumerate(files, start=1):
        try:
            content = file.path.read_text(encoding='utf-8')
        except UnicodeDecodeError as e:
            log_error(file.path, f'Upgrade_code: skipping non-utf8 file({e})')
            continue

        if 't-portal' not in content:
            continue

        try:
            content = reg_t_portal.sub('t-custom-portal', content)
            file.content = content
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)

        file_manager.print_progress(fileno, len(files))


def upgrade_t_esc(file_manager, log_info, log_error):
    """Replaces the t-esc directive in xml templates with the t-out directive"""
    excluded_path_pattern = re.compile('|'.join(EXCLUDED_PATH + CHECKSUM_FILES))
    files = [
        file for file in file_manager
        if file.path.suffix in ['.xml', '.js'] and not re.search(excluded_path_pattern, file.path._str)
    ]
    if not files:
        return

    reg_t_esc_attr = re.compile(r"\bt-esc(?=\s*=\s*['\"])")
    # matches: <attribute name="t-esc">  /  <attribute name="t-esc"/> /  <attribute remove="1" name="t-esc" />
    reg_att_t_esc = re.compile(r'(<attribute\b[^>]*\bname\s*=\s*(["\']))t-esc(\2)')

    def replace_t_esc(s: str) -> str:
        s = reg_t_esc_attr.sub("t-out", s)
        s = reg_att_t_esc.sub(r"\1t-out\3", s)
        return s

    for fileno, file in enumerate(files, start=1):
        try:
            content = file.path.read_text(encoding="utf-8")
        except UnicodeDecodeError as e:
            # For file enterprise/l10n_cl_edi_factoring/template/aec_template.xml
            log_error(file.path, f"Upgrade_code: skipping non-utf8 file({e})")
            continue

        if "t-esc" not in content:
            continue

        try:
            if file.path.name.endswith(".test.js"):
                content = JSTooling.transform_js_string_literals(content, replace_t_esc)
            elif file.path.suffix == ".js":
                content = JSTooling.transform_xml_literals(content, replace_t_esc)
                content = JSTooling.transform_arch_templates(content, replace_t_esc)
            else:  # .xml
                content = replace_t_esc(content)
            file.content = content
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)

        file_manager.print_progress(fileno, len(files))


def upgrade_t_ref(file_manager, log_info, log_error):
    files = JSTooling.get_template_files(file_manager)
    reg_t_ref = re.compile(r'\b(?<!-)t-ref([^=\s]*\s*=)')

    def apply_transformations(text):
        text = reg_t_ref.sub(r't-custom-ref\1', text)
        return text

    for fileno, file in enumerate(files, start=1):
        try:
            raw_content = file.path.read_bytes()
            content = raw_content.decode("utf-8", errors="ignore")

            if file.path.suffix == ".js":
                new_content = JSTooling.transform_xml_literals(content, apply_transformations)
            else:
                new_content = apply_transformations(content)

            if new_content != content:
                file.content = new_content

        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)

        file_manager.print_progress(fileno, len(files))


def upgrade_t_model(file_manager, log_info, log_error):
    files = JSTooling.get_template_files(file_manager)
    reg_t_model = re.compile(r'\b(?<!-)t-model([^=\s]*\s*=)')

    def apply_transformations(text):
        text = reg_t_model.sub(r't-custom-model\1', text)
        return text

    for fileno, file in enumerate(files, start=1):
        try:
            raw_content = file.path.read_bytes()
            content = raw_content.decode("utf-8", errors="ignore")

            if file.path.suffix == ".js":
                new_content = JSTooling.transform_xml_literals(content, apply_transformations)
            else:
                new_content = apply_transformations(content)

            if new_content != content:
                file.content = new_content

        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)

        file_manager.print_progress(fileno, len(files))


class ClassInfo:
    def __init__(self, name, class_map):
        self._class_map = class_map
        self.name = name
        self.parent_id = None
        self.child_ids = []
        self.file = None
        self.is_done = False
        self.keep_static_props = False
        self.keep_static_default_props = False

    def is_component(self):
        if self.parent_id is None:
            return False
        if self.parent_id == '@odoo/owl:Component':
            return True
        return self._class_map[self.parent_id].is_component()

    def get_end_space(self, txt):
        count = len(txt) - len(txt.rstrip())
        return txt[-count:]

    def update_file(self, log_info, log_error):
        keep_static_props_for_children = False

        for child_id in self.child_ids:
            child = self._class_map[child_id]
            if not child.is_done:
                child.update_file(log_info, log_error)
            keep_static_props_for_children = keep_static_props_for_children or child.keep_static_props
            self.keep_static_default_props = self.keep_static_default_props or child.keep_static_default_props

        self.keep_static_props = keep_static_props_for_children

        content = self.file.content
        start_index = re.search(rf'class\s+{self.name}', content).start(0)
        next_class_match = re.search(rf'class\s+\w+', content[start_index+1:])
        end_index = start_index + next_class_match.start(0) if next_class_match else len(content)

        props_match = STATIC_PROPS_RE.search(content[start_index:end_index])
        if props_match:
            props_index = start_index + props_match.end(0)
            schema_result = parse_schema(content[props_index:end_index])
            if schema_result['succeed']:
                props = schema_result['new_value']
                self.keep_static_props = self.keep_static_props or schema_result['keep_static']

                default_props_expr = None
                if not self.keep_static_default_props:
                    default_props_match = STATIC_DEFAULT_PROPS_RE.search(content[start_index:end_index])
                    if default_props_match:
                        default_props_index = start_index + default_props_match.end(0)
                        default_props = parse_default_props(content[default_props_index:end_index])
                        self.keep_static_default_props = default_props['keep_static']
                        if self.keep_static_default_props or self.keep_static_props:
                            default_props_expr = 'this.constructor.defaultProps'
                        else:
                            default_props_expr = default_props['expr']
                            first_part = content[:start_index + default_props_match.start(0)]
                            space_count = len(self.get_end_space(first_part))
                            content = first_part.rstrip() + content[default_props_index + default_props['read_count']:]
                            if default_props_index < props_index:
                                props_index -= space_count + len(default_props_match[0]) + default_props['read_count']

                add_props_import = False
                add_types_import = schema_result['uses_t']
                if schema_result['is_empty']:
                    if self.keep_static_props:
                        content = content[:props_index - len(props_match[0])] + 'static _props = {};' + content[props_index + schema_result['read_count']:]
                    else:
                        first_part = content[:props_index - len(props_match[0])]
                        space_count = len(self.get_end_space(first_part))
                        content = first_part.rstrip() + content[props_index + schema_result['read_count']:]
                elif schema_result['has_all_key']:
                    if self.keep_static_props:
                        log_error(self.file.path, 'should keep static props but has all key prop')
                        self.is_done = True
                        return
                    props = f'props = props(/**{props}**/);'
                    content = content[:props_index - len(props_match[0])] + props + content[props_index + schema_result['read_count']:]
                    add_props_import = True
                    add_types_import = False
                else:
                    if keep_static_props_for_children:
                        if self.parent_id == '@odoo/owl:Component':
                            space = self.get_end_space(content[:props_index - len(props_match[0])])
                            params = 'this.constructor._props'
                            if default_props_expr is not None:
                                params += f', {default_props_expr}'
                            props = f'static _props = {props};{space}props = props({params});'
                            add_props_import = True
                        else:
                            props = f'static _props = {props};'
                    elif self.keep_static_props and self.parent_id != '@odoo/owl:Component':
                        props = f'static _props = {props};'
                    else:
                        params = props
                        if default_props_expr is not None:
                            params += f', {default_props_expr}'
                        props = f'props = props({params});'
                        add_props_import = True
                    content = content[:props_index - len(props_match[0])] + props + content[props_index + schema_result['read_count']:]

                if add_types_import:
                    content = JSTooling.add_import(content, 'types as t', '@odoo/owl')
                if add_props_import:
                    content = JSTooling.add_import(content, 'props', '@odoo/owl')

                self.file.content = content
            else:
                log_error(self.file.path, schema_result['error'])
        self.is_done = True


def upgrade_props(file_manager, log_info, log_error):
    files = JSTooling.get_js_files(file_manager)
    class_map = {}

    # find classes in files and map them into trees
    for file in files:
        file_path = os.path.normpath(str(file.path))
        current_module = PATH_MODULE_RE.sub(r'@\g<1>/\g<2>', file_path)

        parent_map = {}
        for match in CLASS_RE.finditer(file.content):
            name = match[1]
            id = f'{current_module}:{name}'
            info = class_map.setdefault(id, ClassInfo(name, class_map))
            info.file = file
            parent_map[id] = match[2]

        for id in parent_map:
            parent_name = parent_map[id]
            parent_id = f'{current_module}:{parent_name}'
            if parent_id not in class_map:
                parent_module_match = re.search(rf'import.+?\b{parent_name}\b.+?from\s+["\'](.+?)["\'];', file.content, re.S)
                if parent_module_match:
                    parent_module = parent_module_match[1]
                    if parent_module.startswith('.'):
                        parent_path = os.path.normpath(os.path.join(os.path.dirname(file_path), parent_module))
                        parent_module = PATH_MODULE_RE.sub(r'@\g<1>/\g<2>', parent_path + '.js')
                    parent_id = f'{parent_module}:{parent_name}'
                else:
                    parent_id = parent_name
                class_map.setdefault(parent_id, ClassInfo(parent_name, class_map))
                class_map[id].parent_id = parent_id
                class_map[parent_id].child_ids.append(id)

    # update component classes
    for class_id in class_map:
        info = class_map[class_id]
        if not info.is_done and info.is_component():
            info.update_file(log_info, log_error)

    print('--------------')

    # for fileno, file in enumerate(files, start=1):
    #     try:
    #         content = file.content
    #         index = 0
    #         match = STATIC_PROPS_RE.search(content, index)
    #         uses_t = False

    #         while match:
    #             index = match.end(0)
    #             result = parse_schema(content[index:])
    #             content = content.replace(result['old_value'], result['new_value'])
    #             uses_t = uses_t or result['uses_t']

    #             index += len(result['new_value'])
    #             match = STATIC_PROPS_RE.search(content, index)

    #         if uses_t:
    #             content = JSTooling.add_import(content, 'types as t', '@odoo/owl')

    #         file.content = content

    #     except Exception as e:  # noqa: BLE001
    #         log_error(file.path, e)

    #     file_manager.print_progress(fileno, len(files))


def upgrade(file_manager) -> str:
    """Main upgrade_code entry point."""
    collector = MigrationCollector(file_manager)

    # collector.run_sub("Migrating useEffect", upgrade_useeffect)
    # collector.run_sub("Migrating onWillRender", upgrade_onwillrender)
    # collector.run_sub("Migrating onRendered", upgrade_onrendered)
    # collector.run_sub("Migrating useComponent", upgrade_usecomponent)
    # collector.run_sub("Migrating useEnv", upgrade_useenv)
    # collector.run_sub("Migrating useSubEnv", upgrade_usesubenv)
    # collector.run_sub("Migrating useChildSubEnv", upgrade_usechildsubenv)
    # collector.run_sub("Migrating useRef", upgrade_useref)
    # collector.run_sub("Migrating useState", upgrade_usestate)
    # collector.run_sub("Migrating reactive", upgrade_reactive)
    # collector.run_sub("Migrating useExternalListener", upgrade_use_external_listener)
    # collector.run_sub("Migrating t-portal", upgrade_tportal)
    # collector.run_sub("Migrating t-esc", upgrade_t_esc)
    # collector.run_sub("Migrating t-ref", upgrade_t_ref)
    # collector.run_sub("Migrating t-model", upgrade_t_model)
    collector.run_sub("Migrating props", upgrade_props)

    collector.finalize()
