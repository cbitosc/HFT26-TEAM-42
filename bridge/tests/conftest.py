import pytest


@pytest.fixture(autouse=True)
def isolate_from_local_env(monkeypatch):
    # load_dotenv never overrides a set variable, so this stops a developer's .env reaching the tests.
    monkeypatch.setenv("BRIDGE_TOKEN", "")
    monkeypatch.setenv("SEPOLIA_RPC_URL", "")
    monkeypatch.setenv("REGISTRY_ADDRESS", "")
