import time
from collections import OrderedDict

class TTLCache:
    def __init__(self, capacity, ttl, clock=time.monotonic):
        if capacity < 0:
            raise ValueError("Capacity must be non-negative")
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        self.cache = OrderedDict()

    def put(self, key, value):
        current_time = self.clock()
        if key in self.cache:
            del self.cache[key]
        self.cache[key] = (value, current_time)
        if len(self.cache) > self.capacity:
            self._evict_expired_or_oldest(current_time)

    def get(self, key, default=None):
        current_time = self.clock()
        if key in self.cache:
            value, timestamp = self.cache[key]
            if current_time - timestamp <= self.ttl:
                return value
            else:
                del self.cache[key]
        return default

    def _evict_expired_or_oldest(self, current_time):
        while self.cache:
            _, timestamp = next(iter(self.cache.values()))
            if current_time - timestamp > self.ttl:
                self.cache.popitem(last=False)
            elif len(self.cache) > self.capacity:
                self.cache.popitem(last=False)
            else:
                break

    def __contains__(self, key):
        current_time = self.clock()
        if key in self.cache:
            value, timestamp = self.cache[key]
            if current_time - timestamp <= self.ttl:
                return True
            else:
                del self.cache[key]
        return False

    def __len__(self):
        current_time = self.clock()
        to_remove = []
        for key, (_, timestamp) in self.cache.items():
            if current_time - timestamp > self.ttl:
                to_remove.append(key)
        for key in to_remove:
            del self.cache[key]
        return len(self.cache)
