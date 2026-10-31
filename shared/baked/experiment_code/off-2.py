import time
from collections import OrderedDict

class TTLCache:
    def __init__(self, capacity, ttl, clock=time.monotonic):
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        self.cache = OrderedDict()
        self.expiry_times = {}

    def _evict_expired(self):
        current_time = self.clock()
        while self.cache and self.expiry_times[self.cache.firstkey()] < current_time:
            oldest_key = self.cache.popitem(last=False)[0]
            del self.expiry_times[oldest_key]

    def put(self, key, value):
        current_time = self.clock()
        if key in self.cache:
            del self.cache[key]
            del self.expiry_times[key]
        self.cache[key] = value
        self.expiry_times[key] = current_time + self.ttl
        if len(self.cache) > self.capacity:
            oldest_key = self.cache.popitem(last=False)[0]
            del self.expiry_times[oldest_key]
        self._evict_expired()

    def get(self, key, default=None):
        current_time = self.clock()
        if key in self.cache and self.expiry_times[key] >= current_time:
            return self.cache[key]
        elif key in self.cache:
            del self.cache[key]
            del self.expiry_times[key]
        return default

    def __contains__(self, key):
        current_time = self.clock()
        return key in self.cache and self.expiry_times[key] >= current_time

    def __len__(self):
        self._evict_expired()
        return len(self.cache)
