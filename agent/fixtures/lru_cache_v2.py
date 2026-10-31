class LRUCache:
    def __init__(self, capacity, on_evict=None):
        if capacity < 0:
            raise ValueError("capacity must be non-negative")
        self.capacity = capacity
        self.on_evict = on_evict
        self.data = {}
        self.order = []

    def put(self, key, value):
        if self.capacity == 0:
            return
        if key in self.data:
            self.order.remove(key)
        self.data[key] = value
        self.order.append(key)
        if len(self.data) > self.capacity:
            oldest = self.order.pop(0)
            value = self.data.pop(oldest)
            if self.on_evict:
                self.on_evict(oldest, value)

    def get(self, key, default=None):
        if key not in self.data:
            return default
        self.order.remove(key)
        self.order.append(key)
        return self.data[key]

    def __contains__(self, key):
        return key in self.data

    def __len__(self):
        return len(self.data)
