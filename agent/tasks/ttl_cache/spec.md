# TTL cache

Write a single Python module defining a class `TTLCache`. Standard library only.

- `TTLCache(capacity, ttl, clock=time.monotonic)` creates a cache holding at most `capacity` items. Each item lives for `ttl` seconds after it was last written. `clock` returns the current time.
- `put(key, value)` stores an item. When the cache is over capacity, the item written longest ago is evicted.
- `get(key, default=None)` returns the stored value, or `default` if the key is absent or expired.
- `key in cache` reports whether the key is stored and live.
- `len(cache)` returns the number of live items.

The cache must stay fast at large capacities.
