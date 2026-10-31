class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def make(m, capacity=2, ttl=10):
    clock = Clock()
    return m.TTLCache(capacity, ttl, clock=clock), clock


def test_capacity_zero_put_is_a_noop(m):
    cache, _ = make(m, capacity=0)
    cache.put("a", 1)
    assert len(cache) == 0 and "a" not in cache


def test_negative_capacity_rejected(m):
    try:
        make(m, capacity=-1)
    except ValueError:
        return
    raise AssertionError("negative capacity accepted")


def test_non_positive_ttl_rejected(m):
    try:
        make(m, ttl=0)
    except ValueError:
        return
    raise AssertionError("zero ttl accepted")


def test_none_value_is_stored(m):
    cache, _ = make(m)
    cache.put("a", None)
    assert "a" in cache
    assert cache.get("a", "default") is None


def test_expiry_boundary_is_expired(m):
    cache, clock = make(m)
    cache.put("a", 1)
    clock.now = 10
    assert "a" not in cache


def test_rewrite_resets_expiry(m):
    cache, clock = make(m)
    cache.put("a", 1)
    clock.now = 8
    cache.put("a", 2)
    clock.now = 15
    assert cache.get("a") == 2


def test_read_does_not_extend_life(m):
    cache, clock = make(m)
    cache.put("a", 1)
    clock.now = 8
    cache.get("a")
    clock.now = 11
    assert "a" not in cache


def test_rewrite_moves_item_to_newest(m):
    cache, clock = make(m)
    cache.put("a", 1)
    clock.now = 1
    cache.put("b", 2)
    clock.now = 2
    cache.put("a", 3)
    clock.now = 3
    cache.put("c", 4)
    assert "b" not in cache and "a" in cache


def test_rewrite_at_capacity_does_not_evict(m):
    cache, _ = make(m)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.put("b", 3)
    assert "a" in cache and len(cache) == 2


def test_len_excludes_expired_without_reads(m):
    cache, clock = make(m, capacity=3)
    cache.put("a", 1)
    cache.put("b", 2)
    clock.now = 11
    assert len(cache) == 0


def test_expired_items_do_not_cause_live_eviction(m):
    cache, clock = make(m, capacity=2)
    cache.put("old", 1)
    clock.now = 5
    cache.put("live", 2)
    clock.now = 11
    cache.put("new", 3)
    assert "live" in cache and "new" in cache


def test_read_does_not_change_eviction_order(m):
    cache, clock = make(m)
    cache.put("a", 1)
    clock.now = 1
    cache.put("b", 2)
    cache.get("a")
    clock.now = 2
    cache.put("c", 3)
    assert "a" not in cache and "b" in cache
