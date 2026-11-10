# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime as dt
import io
import typing
import zipfile
from collections.abc import Iterable, Iterator

from .binary import BinaryValue

if typing.TYPE_CHECKING:
    from odoo.addons.base.models.ir_attachment import IrAttachment



class ZipAttachment(typing.TypedDict):
    name: str
    """
    The hierarchized name of the file.

    Folders inside zipfiles are implicits, all files whose names start
    with a same "<folder>/" prefix appears together inside the same
    folder in the zipfile.

    .. example::

        To replicate the following structure:

        .. code::

            reports
            ├── 2025
            │   ├── november.pdf
            │   └── december.pdf
            └── 2026
                └── january.pdf

        Create three zip-attachments with names:

        * reports/2026/january.pdf
        * reports/2025/november.pdf
        * reports/2025/december.pdf

    .. tip::

        Many ZIP softwares have an "extract here" button that extracts
        the zipfile in the user's working directory. That button works
        best when all the files are enclosed in a top-level folder.
    """

    raw: BinaryValue
    # TODO: docstring

    write_date: dt.datetime
    """
    The last modification datetime of the file.

    When the datetime is naive, it is assumed to be UTC.
    """


class _ChunkSink(io.RawIOBase):
    def __init__(self):
        self._chunks = []

    def writable(self):
        return True

    def write(self, b):
        self._chunks.append(bytes(b))
        return len(b)

    def get_chunks(self) -> list[bytes]:
        chunks, self._chunks = self._chunks, []
        return chunks


def stream_zip(
    attachments: Iterable['IrAttachment | ZipAttachment'],
    user_timezone: dt.timezone = dt.UTC,
) -> Iterator[bytes]:
    sink = _ChunkSink()
    with zipfile.ZipFile(sink, 'w') as zip_file:
        for attach in attachments:
            write_date = attach['write_date']
            write_date = write_date.replace(tzinfo=write_date.tzinfo or dt.UTC)
            info = zipfile.ZipInfo(
                attach['name'].lstrip('/'),
                write_date.astimezone(user_timezone).timetuple()[:6],
            )
            info.file_size = attach['raw'].size
            if info.is_dir():
                info.external_attr = (0o40775 << 16) | 0x10
            elif attach['raw'].mimetype.startswith('text/'):
                # other mimetypes are assumed to be compressed already
                info.compress_type = zipfile.ZIP_DEFLATED

            with attach['raw'].open() as file, zip_file.open(info, 'w') as zip_entry:
                while chunk := file.read(io.DEFAULT_BUFFER_SIZE):
                    zip_entry.write(chunk)
                    yield from sink.get_chunks()
            yield from sink.get_chunks()
    yield from sink.get_chunks()
