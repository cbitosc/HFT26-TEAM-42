import asyncio
import json
from collections import deque

HISTORY = 500
QUEUE_SIZE = 1000


class EventHub:
    """Fans events out to SSE clients. Late joiners get recent history first."""

    def __init__(self):
        self.history = deque(maxlen=HISTORY)
        self.clients = set()

    def publish(self, event):
        self.history.append(event)
        for queue in list(self.clients):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                self.clients.discard(queue)

    def subscribe(self):
        queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        for event in self.history:
            queue.put_nowait(event)
        self.clients.add(queue)
        return queue

    def unsubscribe(self, queue):
        self.clients.discard(queue)


def sse_frame(event):
    return f"data: {json.dumps(event)}\n\n"
