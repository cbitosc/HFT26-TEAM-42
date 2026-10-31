class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def make(m, capacity=2, ttl=10):
    clock = Clock()
    return m.TTLCache(capacity, ttl, clock=clock), clock


def test_put_then_get(m):
    cache, _ = make(m)
    cache.put("a", 1)
    assert cache.get("a") == 1


def test_missing_key_returns_default(m):
    cache, _ = make(m)
    assert cache.get("nope", "fallback") == "fallback"


def test_item_expires(m):
    cache, clock = make(m)
    cache.put("a", 1)
    clock.now = 11
    assert cache.get("a", "gone") == "gone"
    assert "a" not in cache


def test_evicts_oldest_write(m):
    cache, clock = make(m)
    cache.put("a", 1)
    clock.now = 1
    cache.put("b", 2)
    clock.now = 2
    cache.put("c", 3)
    assert "a" not in cache and "b" in cache and "c" in cache


def test_len_tracks_items(m):
    cache, _ = make(m, capacity=3)
    cache.put("a", 1)
    cache.put("b", 2)
    assert len(cache) == 2
