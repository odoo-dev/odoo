#!/usr/bin/env python3
import subprocess
import pathlib
import logging
_logger = logging.getLogger()
logging.basicConfig(level=logging.INFO)

requirements = pathlib.Path(__file__).parent
script = requirements / 'generate.py'
root = requirements.parent.parent
addons_path = [root / 'addons', root / 'odoo/addons', root.parent / 'enterprise/']
for path in addons_path:
    if not path.is_dir():
        _logger.error('%s not found, this script must be run on all main repositories with all addons path', path)

base_command = ['python3', script, '--addons-path'] + addons_path

# TODO cleanup potential oter files and move to a setup

base_params = ['--mode', 'requirement', '--python-versions=all', '--platform=all']

path = root / 'requirements.txt'
_logger.info('Updating %s', root / 'requirements.txt')
subprocess.run(base_command + base_params + ['-o', path, '--modules', '*,-l10n*,-test*'], check=True)

path = requirements / 'requirements_base.txt'
_logger.info('Updating %s', path)
subprocess.run(base_command + base_params + ['-o', path, '--module', 'base,web'], check=True)

path = requirements / 'requirements_full.txt'
_logger.info('Updating %s', path)
subprocess.run(base_command + base_params + ['-o', path, '-it', '-io'], check=True)

path = requirements / 'requirements_full_debian_sec.txt'
_logger.info('Updating %s', path)
subprocess.run(base_command + base_params + ['-o', path, '-it', '-io', '--ignore-security'], check=True)
