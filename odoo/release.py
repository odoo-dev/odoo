# Part of Odoo. See LICENSE file for full copyright and licensing details.

RELEASE_LEVELS = [ALPHA, BETA, RELEASE_CANDIDATE, FINAL] = ['alpha', 'beta', 'candidate', 'final']
RELEASE_LEVELS_DISPLAY = {ALPHA: 'a',
                          BETA: 'b',
                          RELEASE_CANDIDATE: 'rc',
                          FINAL: ''}

# version_info format: (MAJOR, MINOR, MICRO, RELEASE_LEVEL, SERIAL)
# inspired by Python's own sys.version_info, in order to be
# properly comparable using normal operators, for example:
#  (6,1,0,'beta',0) < (6,1,0,'candidate',1) < (6,1,0,'candidate',2)
#  (6,1,0,'candidate',2) < (6,1,0,'final',0) < (6,1,2,'final',0)
version = "18.1a1"


def _make_version_info(version):
    split_pos = min((pos for rd in RELEASE_LEVELS_DISPLAY.values() if rd and (pos := version.find(rd)) > 0), default=999)
    version_info = [int(v) for v in version[:split_pos].split('.')]
    assert version_info
    version_info += [0] * (3 - len(version_info))
    if split_pos == 999:
        version_info.append(FINAL)
    else:
        for level, ld in RELEASE_LEVELS_DISPLAY.items():
            if ld and version[split_pos:].startswith(ld):
                version_info.append(level)
                split_pos += len(ld)
                break
        assert len(version_info) == 4
    version_info += [int(v) for v in version[split_pos:].split('.') if v]
    version_info += [0] * (5 - len(version_info))
    return tuple(version_info)


version_info = _make_version_info(version)
series = serie = major_version = '.'.join(str(v) for v in version_info[:2])

# XXX code below duplicates pyproject.toml info and can be fetched using importlib.metadata
product_name = 'Odoo'
description = 'Odoo Server'
long_desc = '''Odoo is a complete ERP and CRM. The main features are accounting (analytic
and financial), stock management, sales and purchases management, tasks
automation, marketing campaigns, help desk, POS, etc. Technical features include
a distributed server, an object database, a dynamic GUI,
customizable reports, and XML-RPC interfaces.
'''
classifiers = """Development Status :: 5 - Production/Stable
License :: OSI Approved :: GNU Lesser General Public License v3

Programming Language :: Python
"""
url = 'https://www.odoo.com'
author = 'OpenERP S.A.'
author_email = 'info@odoo.com'
license = 'LGPL-3'

nt_service_name = "odoo-server-" + series.replace('~','-')
