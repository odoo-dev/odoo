import re
from odoo.upgrade_code.tools_etree import update_etree
from odoo.upgrade_code.tools_js_expressions import update_template, VariableAggregator

EXCLUDED_PATH = (
    'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.js',
    'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.xml',
    'iot_drivers/static/src/',
    'web/static/src/owl2',
    'website',
    'addons/web/static/lib/owl/owl.js',
    '/node_modules/'
)

TARGET_PATH = (
    'web/',
    'web_enterprise/'
)

# Templates that are called by:
# - this.renderAt   (Interaction)
# - renderToString
# - renderToFragment
# - renderToElement
EXCLUDED_TEMPLATES = (

)


class JSTooling:
    @staticmethod
    def is_commented(content: str, position: int) -> bool:
        """Checks if the word at the given position is on a commented line.

        Args:
            content: The full file content.
            position: The index of the word to check.

        Returns:
            True if the line starts with //, /* or /** before the position.
        """
        # We look back to the start of the current line
        line_start = content.rfind('\n', 0, position) + 1
        line_text = content[line_start:position].lstrip()
        return '//' in line_text or '/*' in line_text or '/**' in line_text or line_text.startswith("*")

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

    @staticmethod
    def replace_usage(content: str, old_name: str, new_name: str) -> str:
        """Replaces usage on lines that aren't comments.

        Args:
            content: The file content.
            old_name: Original variable name.
            new_name: New variable name.
        Returns:
            The updated content.
        """
        def replacer(match):
            if JSTooling.is_commented(content, match.start()):
                return match.group(0)  # Return unchanged
            return new_name

        return re.sub(rf'\b{old_name}\b', replacer, content)

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
    def get_js_files(file_manager, include_test_files=False):
        """Gets all static js files. Include .test.js files if include_test_files is True."""
        path_pattern = re.compile('|'.join(EXCLUDED_PATH))
        target_dir = '/static/' if include_test_files else '/static/src'

        return [
            f for f in file_manager
            if f.path.suffix == '.js'
               and target_dir in f.path._str
               and not path_pattern.search(f.path._str)
        ]

    @staticmethod
    def get_template_files(file_manager):
        excluded_path_pattern = re.compile('|'.join(EXCLUDED_PATH))
        return [
            file for file in file_manager
            if '/static/src/' in file.path._str
               and file.path.suffix in ['.xml', '.js']
               and not re.search(excluded_path_pattern, file.path._str)
        ]

    @staticmethod
    def get_xml_files(file_manager):
        path_pattern = re.compile('|'.join(EXCLUDED_PATH))
        return [
            file for file in file_manager
            if '/static/src/' in file.path._str
               and file.path.suffix == '.xml'
               and not re.search(path_pattern, file.path._str)
        ]


class MigrationCollector:
    """Collects logs from multiple sub-functions and pushes them to FileManager."""

    def __init__(self, file_manager):
        self.file_manager = file_manager
        self.reports = []

    def run_sub(self, name: str, func, **kwargs) -> None:
        modified_before = sum(1 for f in self.file_manager if f.dirty)
        errors = []
        infos = []

        def log_info(msg):
            infos.append(msg)

        def log_error(path, err):
            errors.append(f"  ❌ {path}: {err}")

        func(self.file_manager, log_info, log_error, **kwargs)

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

def upgrade_replace_title(file_manager, log_info, log_error):
    """Replaces the title attribute in xml templates with the data-tooltip"""
    excluded_path_pattern = re.compile('|'.join(EXCLUDED_PATH))
    files = [
        file for file in file_manager
        if file.path.suffix in ['.xml', '.js'] and not re.search(excluded_path_pattern, file.path._str)
    ]
    if not files:
        return

    reg_xml_tag = re.compile(r'<[A-Za-z0-9_\-]+(?:\s+[^\s>=]+(?:=(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?)*\s*/?>', re.DOTALL)
    reg_title_attr = re.compile(r"(\s|\bt-att-|\bt-attf-)title(?=\s*=\s*['\"])")
    reg_conflict_check = re.compile( r"\bdata-tooltip\s*=\s*['\"]|\bt-att(?:f)?-data-tooltip\s*=\s*['\"]", re.DOTALL)

    def replace_title(content: str) -> str:
        def tag_replacer(match):
            tag_content = match.group(0)

            if tag_content.startswith("<Dialog") or tag_content.startswith("</Dialog"):
                return tag_content

            if reg_conflict_check.search(tag_content):
                return tag_content

            return reg_title_attr.sub(r"\1data-tooltip", tag_content)

        return reg_xml_tag.sub(tag_replacer, content)

    for fileno, file in enumerate(files, start=1):
        try:
            content = file.path.read_text(encoding="utf-8")
        except UnicodeDecodeError as e:
            log_error(file.path, f"Upgrade_code: skipping non-utf8 file({e})")
            continue

        if "title" not in content:
            continue

        try:
            if file.path.name.endswith(".test.js"):
                content = JSTooling.transform_js_string_literals(content, replace_title)
            elif file.path.suffix == ".js":
                content = JSTooling.transform_xml_literals(content, replace_title)
                content = JSTooling.transform_arch_templates(content, replace_title)
            else:  # .xml
                content = replace_title(content)
            file.content = content
        except Exception as e:  # noqa: BLE001
            log_error(file.path, e)

        file_manager.print_progress(fileno, len(files))

def upgrade(file_manager) -> str:
    """Main upgrade_code entry point."""
    collector = MigrationCollector(file_manager)

    collector.run_sub("Migrating title to data-tooltip", upgrade_replace_title)

    collector.finalize()
