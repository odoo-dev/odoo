#!/usr/bin/env python3

"""
Compare requirements between multiple files.

Example usage:
    setup/requirements-compare.py debian/control pyproject.toml requirements.txt
"""

import argparse
import re
import tomllib
from pathlib import Path
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

NAME_MAPPING = {
    'dateutil': 'python-dateutil',
    'openssl': 'pyopenssl',
    'renderpm': 'rl-renderpm',
    'pil': 'pillow',
    'stdnum': 'python-stdnum',
    'tz': 'pytz',
}
"""From debian/ubuntu package (stripped) to pip name"""


class DependencyFile:
    def __init__(self, path: Path):
        self.path = path
        self.python_min = ''
        self.dependencies = {}
        self._parse()

    def _parse(self):
        raise NotImplementedError

    def _add_dependency(self, line, group=None):
        req = Requirement(line)
        if group:
            req.marker = f"*{group}; {(req.marker or '')}"
        name = canonicalize_name(req.name)
        name = NAME_MAPPING.get(name, name)
        self.dependencies[name] = req


class PyProjectFile(DependencyFile):
    def __init__(self, path: Path, tags=()):
        self.tags = tags
        super().__init__(path)

    def _parse(self):
        with self.path.open('rb') as f:
            data = tomllib.load(f)
        project = data['project']
        self.python_min = project.get('requires-python', '')
        for dependency in project.get('dependencies', ()):
            self._add_dependency(dependency)
        for group, deps in project.get('optional-dependencies', {}).items():
            if group not in self.tags:
                continue
            for dep in deps:
                self._add_dependency(dep, group)


class Requirements(DependencyFile):
    def _parse(self):
        lines = self.path.read_text().splitlines()
        for line in lines:
            comment_pos = line.find('#')
            line = line[:(comment_pos if comment_pos >= 0 else 1000)].strip()
            if line:
                self._add_dependency(line)


class DebianControl(DependencyFile):
    def _parse(self):
        lines = self.path.read_text().splitlines()
        depends = False
        for line in lines:
            if not depends:
                depends = line.startswith('Depends:')
            elif line.lstrip().startswith('#'):
                continue
            elif line.startswith(' '):
                # dependency
                for dependency in re.split(r',|\|', line):
                    dependency = dependency.strip()
                    if not dependency.startswith('python3-'):
                        continue
                    self._add_dependency(dependency[8:])
            else:
                # something else, stop parsing
                break


def main(args):
    sources: list[DependencyFile] = []
    for file_path in args.files:
        path = Path(file_path)
        if path.stem == 'pyproject':
            tags = ('ldap')
            sources.extend([
                PyProjectFile(path, tags=tags),
                PyProjectFile(path, tags=(*tags, 'pinned', 'test')),
            ])
        elif 'requirements' in path.stem:
            sources.append(Requirements(path))
        elif 'debian' in path.parts:
            sources.append(DebianControl(path))
        else:
            raise ValueError(f"Invalid file type: {path}")

    table = [
        ['', *(str(source.path) for source in sources)],
        ['python', *(source.python_min for source in sources)],
    ]
    libs = sorted({
        dependency
        for source in sources
        for dependency in source.dependencies
    })
    table.extend(
        [lib, *(str(source.dependencies.get(lib, '')) for source in sources)]
        for lib in libs
    )

    def print_table():
        widths = [
            max(len(value) for value in column) + 1
            for column in zip(*table)
        ]
        for line in table:
            for value, width in zip(line, widths):
                yield f' {value:<{width}}'
            yield '\n'
    print(''.join(print_table()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        'files', nargs='+',
        help="Files to check for consistency",
    )

    args = parser.parse_args()
    main(args)
