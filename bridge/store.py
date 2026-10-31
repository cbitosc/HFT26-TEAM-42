import base64
import hashlib
import json
import logging
import re
from pathlib import Path

import httpx

PIN_URL = "https://uploads.pinata.cloud/v3/files"
DEFAULT_GATEWAY = "https://gateway.pinata.cloud"
TIMEOUT_S = 30
CID_PATTERN = re.compile(r"^[A-Za-z0-9-]{10,100}$")
RAW_SHA256_PREFIX = bytes([0x01, 0x55, 0x12, 0x20])  # CIDv1, raw codec, sha2-256, 32 bytes

log = logging.getLogger(__name__)


def canonical_bytes(entry):
    return json.dumps(entry, sort_keys=True, separators=(",", ":")).encode("utf-8")


def valid_cid(cid):
    return bool(CID_PATTERN.match(cid))


def check_content(cid, body):
    """A gateway is only a transport, so the bytes must hash to the CID before we trust them."""
    if not cid.startswith("bafk"):
        log.warning("Cannot verify %s locally, only raw CIDv1 is checked", cid)
        return
    encoded = cid[1:].upper()
    decoded = base64.b32decode(encoded + "=" * (-len(encoded) % 8))
    if decoded != RAW_SHA256_PREFIX + hashlib.sha256(body).digest():
        raise ValueError(f"Gateway content does not match {cid}")


class EntryStore:
    def __init__(self, cache_dir, jwt=None, gateway=None, transport=None):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.jwt = jwt
        self.gateway = (gateway or DEFAULT_GATEWAY).rstrip("/")
        if not self.gateway.startswith("http"):
            self.gateway = f"https://{self.gateway}"
        self.client = httpx.Client(timeout=TIMEOUT_S, transport=transport)

    def _cache_path(self, cid):
        return self.cache_dir / f"{cid}.json"

    def gateway_url(self, cid):
        return f"{self.gateway}/ipfs/{cid}"

    def pin(self, entry):
        body = canonical_bytes(entry)
        name = f"autoevolve-{hashlib.sha256(body).hexdigest()[:16]}"
        response = self.client.post(
            PIN_URL,
            headers={"Authorization": f"Bearer {self.jwt}"},
            files={"file": (f"{name}.json", body, "application/json")},
            data={"network": "public", "name": name},
        )
        response.raise_for_status()
        cid = response.json()["data"]["cid"]
        self._cache_path(cid).write_bytes(body)
        return cid

    def pin_baked(self, entry):
        body = canonical_bytes(entry)
        cid = "baked-" + hashlib.sha256(body).hexdigest()[:32]
        self._cache_path(cid).write_bytes(body)
        return cid

    def fetch(self, cid):
        cached = self._cache_path(cid)
        if cached.exists():
            return json.loads(cached.read_bytes())
        response = self.client.get(self.gateway_url(cid), follow_redirects=True)
        response.raise_for_status()
        check_content(cid, response.content)
        entry = response.json()
        cached.write_bytes(canonical_bytes(entry))
        return entry
