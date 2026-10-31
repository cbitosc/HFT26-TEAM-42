import time
from collections import OrderedDict


class TTLCache:
    def __init__(self, capacity, ttl, clock=time.monotonic):
        if capacity < 0:
            raise ValueError("capacity must be non-negative")
        if ttl <= 0:
            raise ValueError("ttl must be positive")
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        self.data = OrderedDict()

    def _purge(self):
        now = self.clock()
        while self.data:
            key, (expires, _) = next(iter(self.data.items()))
            if expires > now:
                break
            del self.data[key]

    def put(self, key, value):
        if self.capacity == 0:
            return
        self._purge()
        self.data.pop(key, None)
        self.data[key] = (self.clock() + self.ttl, value)
        if len(self.data) > self.capacity:
            self.data.popitem(last=False)

    def get(self, key, default=None):
        self._purge()
        return self.data[key][1] if key in self.data else default

    def __contains__(self, key):
        self._purge()
        return key in self.data

    def __len__(self):
        self._purge()
        return len(self.data)
