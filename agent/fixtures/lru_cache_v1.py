class LRUCache:
    def __init__(self, capacity, on_evict=None):
        self.capacity = capacity
        self.on_evict = on_evict
        self.data = {}
        self.order = []

    def put(self, key, value):
        self.data[key] = value
        self.order.append(key)
        if len(self.data) > self.capacity:
            oldest = self.order.pop(0)
            value = self.data.pop(oldest)
            if self.on_evict:
                self.on_evict(oldest, value)

    def get(self, key, default=None):
        value = self.data.get(key)
        if value is None:
            return default
        self.order.remove(key)
        self.order.append(key)
        return value

    def __contains__(self, key):
        return key in self.data

    def __len__(self):
        return len(self.data)
