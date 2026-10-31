def test_put_then_get(m):
    cache = m.LRUCache(2)
    cache.put("a", 1)
    assert cache.get("a") == 1


def test_missing_key_returns_default(m):
    assert m.LRUCache(2).get("nope", "fallback") == "fallback"


def test_evicts_oldest(m):
    cache = m.LRUCache(2)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.put("c", 3)
    assert "a" not in cache
    assert cache.get("b") == 2 and cache.get("c") == 3


def test_get_refreshes_recency(m):
    cache = m.LRUCache(2)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.get("a")
    cache.put("c", 3)
    assert "b" not in cache and "a" in cache


def test_on_evict_receives_evicted_item(m):
    seen = []
    cache = m.LRUCache(1, on_evict=lambda k, v: seen.append((k, v)))
    cache.put("a", 1)
    cache.put("b", 2)
    assert seen == [("a", 1)]


def test_len_tracks_items(m):
    cache = m.LRUCache(3)
    cache.put("a", 1)
    cache.put("b", 2)
    assert len(cache) == 2
