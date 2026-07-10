
import ctypes
import sys
 
_assign = None
_offset = None          # byte offset of tp_versions_used within PyTypeObject
_calibrated = False
 
 
def _get_assign():
    global _assign
    if _assign is None:
        _assign = ctypes.pythonapi.PyUnstable_Type_AssignVersionTag
        _assign.argtypes = [ctypes.py_object]
        _assign.restype = ctypes.c_int
    return _assign
 
 
def _consume_tags(cls, n, assign):
    """Consume exactly n version tags on cls (modify + force reassignment)."""
    for i in range(n):
        cls.x = i          # class modification -> invalidates current tag
        assign(cls)        # forces assignment of a fresh tag -> counter += 1
 
 
def _snapshot(cls, size):
    return ctypes.string_at(id(cls), size)
 
 
def _u16_delta_candidates(before, after, expected):
    out = set()
    for off in range(len(before) - 1):
        b = int.from_bytes(before[off:off + 2], 'little')
        a = int.from_bytes(after[off:off + 2], 'little')
        if (a - b) & 0xFFFF == expected:
            out.add(off)
    return out
 
 
def _calibrate():
    """Locate tp_versions_used; return byte offset or None."""
    assign = _get_assign()
    size = type.__basicsize__            # sizeof(PyHeapTypeObject) upper bound
 
    scratch = type('_VTScratch1', (), {})
    decoy = type('_VTDecoy', (), {})
    assign(scratch)                       # ensure initial tag assigned
 
    # Round 1: +7 on scratch, decoy idle.
    before = _snapshot(scratch, size)
    _consume_tags(scratch, 7, assign)
    after = _snapshot(scratch, size)
    cand = _u16_delta_candidates(before, after, 7)
 
    # Round 2: +5 on scratch, while the decoy consumes 4 tags per cycle,
    # advancing the GLOBAL tag counter by 25 total. tp_version_tag on the
    # scratch class therefore moves by ~25, not 5 - eliminating it.
    before = _snapshot(scratch, size)
    for i in range(5):
        _consume_tags(decoy, 4, assign)
        scratch.x = i
        assign(scratch)
    after = _snapshot(scratch, size)
    cand &= _u16_delta_candidates(before, after, 5)
 
    if len(cand) != 1:
        return None
    return cand.pop()
 
 
def _self_verify(offset):
    """Exhaust a fresh scratch class, reset it via `offset`, confirm revival."""
    assign = _get_assign()
    scratch = type('_VTScratch2', (), {})
    _consume_tags(scratch, 1100, assign)  # past MAX_VERSIONS_PER_CLASS (1000)
    if assign(scratch):
        # Cache did not die (e.g. Python < 3.13 recovery behavior):
        # nothing to fix on this interpreter; report unverifiable.
        return False
    # Width/value witness: the counter caps at exactly 1000 (0x03E8). Reading
    # it as u16 must yield 1000 - proving both the offset and that the field
    # is (at least) 16 bits wide, so a 2-byte zero write cannot clobber a
    # neighboring field.
    value = int.from_bytes(ctypes.string_at(id(scratch) + offset, 2), 'little')
    if value != 1000:
        return False
    ctypes.memmove(id(scratch) + offset, b'\x00\x00', 2)
    return bool(assign(scratch))
 
 
def _ensure_calibrated():
    global _offset, _calibrated
    if _calibrated:
        return _offset is not None
    _calibrated = True
    if sys.implementation.name != 'cpython' or sys.version_info < (3, 13):
        return False
    try:
        offset = _calibrate()
        if offset is not None and _self_verify(offset):
            _offset = offset
            return True
    except Exception:
        pass
    return False
 
 
def reset_version_tag_budget(cls):
    """Reset tp_versions_used to 0 on `cls`, in place, preserving identity.
 
    Returns True if the class can now hold a version tag (cache alive),
    False if the mechanism is unavailable or verification failed.
    Safe no-op on non-CPython / < 3.13 / unknown struct layouts.
    """
    if not _ensure_calibrated():
        return False
    assign = _get_assign()
    if assign(cls):
        return True                       # budget not exhausted - nothing to do
    ctypes.memmove(id(cls) + _offset, b'\x00\x00', 2)
    return bool(assign(cls))
 
 
def reset_registry_classes(registry, logger=None):
    """Reset every exhausted class reachable from the registry's model MROs."""
    if not _ensure_calibrated():
        return 0
    assign = _get_assign()
    fixed = 0
    seen = set()
    for model_cls in registry.values():
        for cls in model_cls.__mro__:
            if cls in seen:
                continue
            seen.add(cls)
            if not assign(cls):
                if reset_version_tag_budget(cls):
                    fixed += 1
                elif logger is not None:
                    logger.error("could not reset version tag budget of %r", cls)
    return fixed
 
 
if __name__ == '__main__':
    # standalone demonstration
    print(f"Python: {sys.version}")
    ok = _ensure_calibrated()
    print(f"calibrated: {ok}" + (f" (tp_versions_used offset = {_offset})" if ok else ""))
    if ok:
        import time
 
        def bench(obj, n=200_000):
            t0 = time.perf_counter()
            for _ in range(n):
                obj.target
            return (time.perf_counter() - t0) / n * 1e9
 
        common = type('Common', (), {'target': 1})
        bases = tuple(type(f'M{i}', (common,), {}) for i in range(83))
        cls = type('Model', bases, {})
        obj = cls()
        print(f"fresh:      {bench(obj):7.1f} ns/read")
        _consume_tags(cls, 1500, _get_assign())
        print(f"exhausted:  {bench(obj):7.1f} ns/read")
        print(f"reset ok:   {reset_version_tag_budget(cls)}")
        print(f"after fix:  {bench(obj):7.1f} ns/read")