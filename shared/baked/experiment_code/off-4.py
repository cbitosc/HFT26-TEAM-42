import time
from collections import OrderedDict

class TTLCache:
    def __init__(self, capacity, ttl, clock=time.monotonic):
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        self.cache = OrderedDict()
        self.expiry_times = {}

    def _cleanup(self):
        current_time = self.clock()
        to_remove = []
        for key, expiry in self.expiry_times.items():
            if expiry <= current_time:
                to_remove.append(key)
            else:
                break
        for key in to_remove:
            del self.cache[key]
            del self.expiry_times[key]

    def put(self, key, value):
        current_time = self.clock()
        self._cleanup()
        if key in self.cache:
            del self.cache[key]
            del self.expiry_times[key]
        elif len(self.cache) >= self.capacity:
            self.cache.popitem(last=False)
            self.expiry_times.pop(next(iter(self.expiry_times)))
        self.cache[key] = value
        self.expiry_times[key] = current_time + self.ttl

    def get(self, key, default=None):
        current_time = self.clock()
        self._cleanup()
        if key in self.cache and self.expiry_times[key] > current_time:
            return self.cache[key]
        return default

    def __contains__(self, key):
        current_time = self.clock()
        self._cleanup()
        return key in self.cache and self.expiry_times[key] > current_time

    def __len__(self):
        current_time = self.clock()
        self._cleanup()
        return len(self.cache)
