import time

OPS = 5000


def _time_per_op(m, capacity):
    cache = m.LRUCache(capacity)
    for i in range(capacity):
        cache.put(i, i)
    start = time.perf_counter()
    for i in range(OPS):
        cache.get(i % capacity)
        cache.put(capacity + i, i)
    return (time.perf_counter() - start) / OPS


def benchmark(m):
    return _time_per_op(m, 5000) / _time_per_op(m, 200)
