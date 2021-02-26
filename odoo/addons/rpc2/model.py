# Part of Odoo. See LICENSE file for full copyright and licensing details.

import collections.abc
import itertools

import odoo.api
import odoo.exceptions

def dispatch(registry, uid, model, method, *args):
    ids, context, args, kwargs = extract_call_info(method, args)

    with registry.cursor() as cr:
        env = odoo.api.Environment(cr, uid, context or {})
        records = env[model].browse(ids)
        return getattr(records, method)(*args, **kwargs)


def extract_call_info(method, args):
    if method.startswith('_'):
        raise odoo.exceptions.AccessError(
            "%s is a private method and can not be called over RPC" % method)
    subject, args, kwargs = itertools.islice(
        itertools.chain(args, [None, None, None]),
        0, 3)
    ids = []
    context = {}
    if isinstance(subject, collections.abc.Iterable):
        ids = list(subject)
    elif isinstance(subject, collections.abc.Mapping):
        ids = list(subject.get('records'))
        context = dict(subject.get('context'))
    elif subject:
        # other truthy subjects are errors
        raise ValueError("Unknown RPC subject %s, expected falsy value, list or dict" % subject)

    # optional args, kwargs
    if isinstance(args, collections.abc.Mapping):
        kwargs = args
        args = None
    if args is None:
        args = []
    if kwargs is None:
        kwargs = {}

    return ids, context, args, kwargs
