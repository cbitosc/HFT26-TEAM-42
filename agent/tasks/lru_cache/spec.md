# LRU cache

Write a single Python module defining a class `LRUCache`. Standard library only.

- `LRUCache(capacity, on_evict=None)` creates a cache holding at most `capacity` items. If `on_evict` is given, it is called with `(key, value)` for each evicted item.
- `put(key, value)` stores an item. When the cache is over capacity, the least recently used item is evicted.
- `get(key, default=None)` returns the stored value, or `default` if the key is absent.
- `key in cache` reports whether the key is stored.
- `len(cache)` returns the number of stored items.

Reads and writes both count as use. The cache must stay fast at large capacities.
