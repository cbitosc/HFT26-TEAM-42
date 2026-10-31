def test_capacity_zero_put_is_a_noop(m):
    cache = m.LRUCache(0)
    cache.put("a", 1)
    assert len(cache) == 0 and "a" not in cache


def test_capacity_zero_get_returns_default(m):
    assert m.LRUCache(0).get("a", "d") == "d"


def test_negative_capacity_rejected(m):
    try:
        m.LRUCache(-1)
    except ValueError:
        return
    raise AssertionError("negative capacity accepted")


def test_none_value_is_stored(m):
    cache = m.LRUCache(2)
    cache.put("a", None)
    assert "a" in cache
    assert cache.get("a", "default") is None


def test_none_value_get_refreshes_recency(m):
    cache = m.LRUCache(2)
    cache.put("a", None)
    cache.put("b", 2)
    cache.get("a")
    cache.put("c", 3)
    assert "a" in cache and "b" not in cache


def test_falsy_values_survive(m):
    cache = m.LRUCache(3)
    cache.put("zero", 0)
    cache.put("empty", "")
    assert cache.get("zero", "d") == 0 and cache.get("empty", "d") == ""


def test_update_refreshes_recency(m):
    cache = m.LRUCache(2)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.put("a", 10)
    cache.put("c", 3)
    assert cache.get("a") == 10 and "b" not in cache


def test_update_at_capacity_does_not_evict(m):
    cache = m.LRUCache(2)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.put("b", 20)
    assert "a" in cache and len(cache) == 2


def test_contains_does_not_refresh_recency(m):
    cache = m.LRUCache(2)
    cache.put("a", 1)
    cache.put("b", 2)
    assert "a" in cache
    cache.put("c", 3)
    assert "a" not in cache


def test_miss_does_not_create_entry(m):
    cache = m.LRUCache(2)
    cache.get("ghost")
    assert len(cache) == 0


def test_capacity_zero_never_fires_on_evict(m):
    seen = []
    cache = m.LRUCache(0, on_evict=lambda k, v: seen.append(k))
    cache.put("a", 1)
    assert seen == []


def test_update_does_not_fire_on_evict(m):
    seen = []
    cache = m.LRUCache(1, on_evict=lambda k, v: seen.append(k))
    cache.put("a", 1)
    cache.put("a", 2)
    assert seen == []
