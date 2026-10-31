from collections import OrderedDict


class LRUCache:
    def __init__(self, capacity, on_evict=None):
        if capacity < 0:
            raise ValueError("capacity must be non-negative")
        self.capacity = capacity
        self.on_evict = on_evict
        self.data = OrderedDict()

    def put(self, key, value):
        if self.capacity == 0:
            return
        if key in self.data:
            self.data.move_to_end(key)
        self.data[key] = value
        if len(self.data) > self.capacity:
            oldest, evicted = self.data.popitem(last=False)
            if self.on_evict:
                self.on_evict(oldest, evicted)

    def get(self, key, default=None):
        if key not in self.data:
            return default
        self.data.move_to_end(key)
        return self.data[key]

    def __contains__(self, key):
        return key in self.data

    def __len__(self):
        return len(self.data)
