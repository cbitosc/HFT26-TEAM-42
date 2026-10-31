import time
from collections import OrderedDict

class TTLCache:
    def __init__(self, capacity, ttl, clock=time.monotonic):
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        self.cache = OrderedDict()
        self.expiry_times = {}

    def put(self, key, value):
        current_time = self.clock()
        if key in self.cache:
            del self.cache[key]
            del self.expiry_times[key]
        elif len(self.cache) >= self.capacity:
            oldest_key = next(iter(self.cache))
            self.cache.pop(oldest_key)
            del self.expiry_times[oldest_key]
        self.cache[key] = value
        self.expiry_times[key] = current_time + self.ttl

    def get(self, key, default=None):
        current_time = self.clock()
        if key in self.cache and self.expiry_times.get(key, 0) > current_time:
            return self.cache[key]
        else:
            if key in self.cache:
                del self.cache[key]
                del self.expiry_times[key]
            return default

    def __contains__(self, key):
        current_time = self.clock()
        if key in self.cache and self.expiry_times.get(key, 0) > current_time:
            return True
        else:
            if key in self.cache:
                del self.cache[key]
                del self.expiry_times[key]
            return False

    def __len__(self):
        current_time = self.clock()
        to_remove = [k for k, exp in self.expiry_times.items() if exp <= current_time]
        for k in to_remove:
            del self.cache[k]
            del self.expiry_times[k]
        return len(self.cache)
