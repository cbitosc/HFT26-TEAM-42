import importlib.util
import logging

log = logging.getLogger(__name__)

MODEL = "sentence-transformers/all-MiniLM-L6-v2"
_model = None


def embed(text):
    """Returns the entry's embedding field, or None when the model isn't installed."""
    global _model
    if importlib.util.find_spec("sentence_transformers") is None:
        log.warning("sentence-transformers is not installed, entry has no embedding")
        return None
    if _model is None:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer(MODEL)
    vector = _model.encode(text, normalize_embeddings=True)
    return {"model": "all-MiniLM-L6-v2", "dim": len(vector), "vector": [round(float(x), 6) for x in vector]}
