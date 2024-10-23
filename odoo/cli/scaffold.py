import argparse
import jinja2
import os
import re

from . import Command


class Template:

    @classmethod
    def builtin_templates(cls, *args):
        return os.path.join(os.path.abspath(os.path.dirname(__file__)), 'templates', *args)

    def __init__(self, identifier):
        # TODO: archives (zipfile, tarfile)
        self.id = identifier
        # is identifier a builtin?
        self.path = self.builtin_templates(identifier)
        if os.path.isdir(self.path):
            return
        # is identifier a directory?
        self.path = identifier
        if os.path.isdir(self.path):
            return
        Command.exit(f"{identifier} is not a valid module template")

    def __str__(self):
        return self.id

    def files(self):
        """ Lists the (local) path and content of all files in the template
        """
        for root, _, files in os.walk(self.path):
            for f in files:
                path = os.path.join(root, f)
                yield path, open(path, 'rb').read()

    def render_to(self, modname, directory, params=None):
        """ Render this module template to ``dest`` with the provided
         rendering parameters
        """
        env = jinja2.Environment()

        def snake(s):
            """ snake cases ``s``
            :param str s:
            :return: str
            """
            # insert a space before each uppercase character preceded by a
            # non-uppercase letter
            s = re.sub(r'(?<=[^A-Z])\B([A-Z])', r' \1', s)
            # lowercase everything, split on whitespace and join
            return '_'.join(s.lower().split())
        env.filters['snake'] = snake

        def pascal(s):
            return ''.join(
                ss.capitalize()
                for ss in re.sub(r'[_\s]+', ' ', s).split()
            )
        env.filters['pascal'] = pascal

        modname = snake(modname)

        # overwrite with local
        for path, content in self.files():
            path = env.from_string(path).render(params)
            local = os.path.relpath(path, self.path)
            # strip .template extension
            root, ext = os.path.splitext(local)
            if ext == '.template':
                local = root
            if self.id == "l10n_payroll":
                modname = f"l10n_{params['code']}_hr_payroll"
            dest = os.path.join(directory, modname, local)
            destdir = os.path.dirname(dest)
            if not os.path.exists(destdir):
                os.makedirs(destdir)

            with open(dest, 'wb') as f:
                if ext not in ('.py', '.xml', '.csv', '.js', '.rst', '.html', '.template'):
                    f.write(content)
                else:
                    env.from_string(content.decode('utf-8'))\
                       .stream(params or {})\
                       .dump(f, encoding='utf-8')
                    f.write(b'\n')


class Scaffold(Command):
    """ Generates an Odoo module skeleton. """

    def run(self, cmdargs):
        parser = argparse.ArgumentParser(
            prog=self.prog,
            description=self.__doc__,
            epilog=self.epilog(),
        )
        parser.add_argument(
            '-t', '--template', type=Template, default=Template('default'),
            help="Use a custom module template, can be a template name or the"
                 " path to a module template (default: %(default)s)")
        parser.add_argument('name', help="Name of the module to create")
        parser.add_argument(
            'dest', default='.', nargs='?',
            help="Directory to create the module in (default: %(default)s)")

        if not cmdargs:
            self.exit(parser.print_help())

        args = parser.parse_args(args=cmdargs)

        if args.template.id == 'l10n_payroll':
            name_split = args.name.split('-')
            params = {
                'name': name_split[0],
                'code': name_split[1]
            }
        else:
            params = {'name': args.name}

        args.template.render_to(
            args.name,
            self.directory(args.dest, create=True),
            params=params,
        )

    def epilog(self):
        return "Built-in templates available are: %s" % ', '.join(
            d for d in os.listdir(Template.builtin_templates())
            if d != 'base'
        )

    def directory(self, p, create=False):
        expanded = os.path.abspath(
            os.path.expanduser(
                os.path.expandvars(p)))
        if create and not os.path.exists(expanded):
            os.makedirs(expanded)
        if not os.path.isdir(expanded):
            self.exit("%s is not a directory" % p)
        return expanded
