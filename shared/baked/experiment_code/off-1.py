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
        to_remove = [k for k, exp in self.expiry_times.items() if exp <= current_time]
        for k in to_remove:
            del self.cache[k]
            del self.expiry_times[k]

    def put(self, key, value):
        current_time = self.clock()
        self._cleanup()
        if key in self.cache:
            del self.cache[key]
            del self.expiry_times[key]
        elif len(self.cache) >= self.capacity:
            self.cache.popitem(last=False)
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
        self._cleanup()
        return len(self.cache)
