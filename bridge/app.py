import hashlib
import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from bridge.chain import ChainRejected, load_chain, related_tasks
from bridge.hub import EventHub, sse_frame
from bridge.store import EntryStore, valid_cid

ROOT = Path(__file__).parent.parent
BAKED_DIR = ROOT / "shared" / "baked"
CACHE_DIR = ROOT / "cache" / "entries"
SEPOLIA_CHAIN_ID = 11155111


def _baked_tx(payload):
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
    return f"baked-tx-{digest[:24]}"


def create_app(offline=None, store=None, chain=None):
    load_dotenv(ROOT / ".env")
    if offline is None:
        offline = os.environ.get("OFFLINE") == "1"
    jwt = os.environ.get("PINATA_JWT")
    store = store or EntryStore(CACHE_DIR, jwt=jwt, gateway=os.environ.get("PINATA_GATEWAY"))
    chain = chain or load_chain()
    token = os.environ.get("BRIDGE_TOKEN")
    hub = EventHub()

    app = FastAPI(title="AutoEvolve bridge")
    app.state.hub = hub
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost:3100").split(","),
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    def require_token(request: Request):
        """Writes spend gas and feed the dashboard, so a public bridge must set BRIDGE_TOKEN."""
        if token and request.headers.get("authorization") != f"Bearer {token}":
            raise HTTPException(401, "Missing or wrong bridge token")

    def is_offline(request):
        return offline or request.query_params.get("offline") == "1"

    def live_chain():
        if chain is None:
            raise HTTPException(503, "Chain is not configured. Set OFFLINE=1 to use baked replies.")
        return chain

    def baked_tx_reply(payload, **extra):
        return {"tx": _baked_tx(payload), "baked": True, **extra}

    @app.get("/health")
    def health():
        return {
            "ok": True,
            "offline": offline,
            "chainId": chain.chain_id if chain else SEPOLIA_CHAIN_ID,
            "registry": chain.registry.address if chain else None,
            "pinata": bool(jwt),
        }

    @app.post("/pin", dependencies=[Depends(require_token)])
    def pin(entry: dict, request: Request):
        if "entry_id" in entry:
            raise HTTPException(422, "entry_id must not be in the blob, it is derived from the CID")
        if is_offline(request) or os.environ.get("BAKED_PIN") == "1":
            return {"cid": store.pin_baked(entry), "baked": True}
        if not jwt:
            raise HTTPException(503, "PINATA_JWT is not set")
        try:
            cid = store.pin(entry)
            return {"cid": cid, "gateway_url": store.gateway_url(cid)}
        except httpx.HTTPError as error:
            raise HTTPException(502, f"Pinata upload failed: {type(error).__name__}") from error

    @app.get("/entry/{cid}")
    def entry(cid: str):
        if not valid_cid(cid):
            raise HTTPException(400, "Invalid CID")
        try:
            return store.fetch(cid)
        except (httpx.HTTPError, ValueError) as error:
            raise HTTPException(502, f"Gateway fetch failed: {type(error).__name__}") from error

    @app.get("/memory")
    def memory(task: str, request: Request, k: int = 5):
        if not is_offline(request):
            return live_chain().memory(task, k, store.fetch)
        seeded = json.loads((BAKED_DIR / "memory_seed.json").read_text(encoding="utf-8"))
        related = related_tasks(task)
        matching = [item for item in seeded if item["task_signature"] in related]
        return [{**item, "entry": item.get("entry"), "baked": True} for item in matching[: max(k, 0)]]

    @app.post("/submit", dependencies=[Depends(require_token)])
    def submit(body: dict, request: Request):
        if is_offline(request):
            return baked_tx_reply(body, status="verified")
        try:
            return live_chain().submit(
                body["agent_id"],
                body["entry_id"],
                body["task_signature"],
                body["cid"],
                body["score_hash_old"],
                body["score_hash_new"],
                body["proof_hex"],
                body["instances"],
                body.get("supersedes"),
            )
        except KeyError as error:
            raise HTTPException(422, f"Missing field {error}") from error
        except ChainRejected as error:
            return {"tx": None, "status": "rejected", "reason": str(error)}

    @app.post("/submit-negative", dependencies=[Depends(require_token)])
    def submit_negative(body: dict, request: Request):
        if is_offline(request):
            return baked_tx_reply(body)
        try:
            return live_chain().submit_negative(
                body["agent_id"], body["entry_id"], body["task_signature"], body["cid"], body.get("supersedes")
            )
        except KeyError as error:
            raise HTTPException(422, f"Missing field {error}") from error
        except ChainRejected as error:
            return {"tx": None, "status": "rejected", "reason": str(error)}

    @app.post("/evidence", dependencies=[Depends(require_token)])
    def evidence(body: dict, request: Request):
        if is_offline(request):
            return baked_tx_reply(body)
        try:
            return live_chain().evidence(
                body["agent_id"], body["reused_entry_id"], body["supported"], body["reporter_entry_id"]
            )
        except KeyError as error:
            raise HTTPException(422, f"Missing field {error}") from error
        except ChainRejected as error:
            return {"tx": None, "status": "rejected", "reason": str(error)}

    @app.post("/events", dependencies=[Depends(require_token)])
    async def post_event(event: dict):
        hub.publish(event)
        return {"ok": True}

    @app.get("/events")
    async def stream_events(request: Request):
        queue = hub.subscribe()

        async def frames():
            try:
                while not await request.is_disconnected():
                    yield sse_frame(await queue.get())
            finally:
                hub.unsubscribe(queue)

        return StreamingResponse(frames(), media_type="text/event-stream")

    return app


app = create_app()
