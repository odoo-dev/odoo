# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import collections.abc
import functools
import json
import typing
import xmlrpc.client
from datetime import datetime

from lxml import etree
from lxml.builder import E

from odoo import models


def XMLRPCMarshaller(encoding='utf-8'):
    # https://i.imgflip.com/50ia71.jpg

    memo = set()

    def dumps(values):
        if isinstance(values, xmlrpc.client.Fault):
            tree = E.fault(serialize({
                'faultCode': values.faultCode,
                'faultString': values.faultString,
            }))
        else:
            tree = E.params()
            tree.extend(E.param(serialize(value)) for value in values)
        return etree.tostring(tree, encoding=encoding, xml_declaration=False)

    @functools.singledispatch
    def serialize(value: typing.Any):  # pylint: disable=unused-variable
        # Default serializer if no specilized one matched
        return serialize(vars(value))

    @serialize.register
    def dump_model(value: models.BaseModel):  # pylint: disable=unused-variable
        return serialize(value.ids)

    @serialize.register
    def dump_none(value: type(None)):  # pylint: disable=unused-variable
        return E.value(E.nil())

    @serialize.register
    def dump_bool(value: bool):  # pylint: disable=unused-variable
        return E.value(E.boolean("1" if value else "0"))

    @serialize.register
    def dump_int(value: int):  # pylint: disable=unused-variable
        if value > xmlrpc.client.MAXINT or value < xmlrpc.client.MININT:
            raise OverflowError("int exceeds XML-RPC limits")
        return E.value(E.int(str(value)))

    @serialize.register
    def dump_float(value: float):  # pylint: disable=unused-variable
        return E.value(E.double(repr(value)))

    @serialize.register
    def dump_str(value: str):  # pylint: disable=unused-variable
        return E.value(E.string(value))

    @serialize.register
    def dump_mapping(value: collections.abc.Mapping):  # pylint: disable=unused-variable
        m = id(value)
        if m in memo:
            raise TypeError("cannot marshal recursive dictionaries")
        memo.add(m)
        struct = E.struct()
        struct.extend(
            # coerce all keys to string (same as JSON)
            E.member(E.name(str(k)), serialize(v))
            for k, v in value.items()
        )
        memo.remove(m)
        return E.value(struct)

    @serialize.register
    def dump_iterable(value: collections.abc.Iterable):  # pylint: disable=unused-variable
        m = id(value)
        if m in memo:
            raise TypeError("cannot marshal recursive sequences")
        memo.add(m)
        data = E.data()
        data.extend(serialize(v) for v in value)
        memo.remove(m)
        return E.value(E.array(data))

    @serialize.register
    def dump_datetime(value: datetime):  # pylint: disable=unused-variable
        d = etree.Element('dateTime.iso8601')
        d.text = value.replace(microsecond=0).isoformat()
        return E.value(d)

    @serialize.register
    def dump_bytes(value: bytes):  # pylint: disable=unused-variable
        return E.value(E.base64(base64.b64encode(value).decode()))

    return type("XMLRPCMarshaller", (), {'dumps': dumps})


class JSONMarshaller(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, models.BaseModel):
            return o.ids
        if isinstance(o, collections.abc.Mapping):
            return dict(o)
        if isinstance(o, collections.abc.Iterable):
            return list(o)
        return super().default(o)
