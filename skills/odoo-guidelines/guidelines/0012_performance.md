# Performance

- **Batch, don't loop queries.** Don't call `search`, `search_count`,
  `_read_group` or `create` inside a loop — each one is a query. Batch before
  the loop and look results up in a dict; see [0015](0015_batch_orm_calls.md).
- Put conditions in the search domain, not in `filtered()` on the result:
  `filtered` runs in Python on records already fetched. Reserve it for
  predicates a domain cannot express.
- **Reduce complexity.** Pre-map results into a dict (`{r['id']: r}`) instead of
  nested loops; cast membership-test collections to `set` (or use recordset
  arithmetic like `self - invalid`) to avoid O(n²).
- Index searched fields (`index=True`) — selectively, per
  [0006](0006_fields.md).
