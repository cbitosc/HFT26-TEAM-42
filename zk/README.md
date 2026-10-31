# zk/ — Person 3 (ZK + Contracts)

EZKL circuit, proving scripts, Solidity verifier export. See `../docs/04-TRACK-ZK.md`.

Tested with Python 3.10, `ezkl` 23.0.5, `torch` 2.14.1, `onnx` 1.23.2.

```
py -3.10 -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python export_model.py    # out/network.onnx
.venv/Scripts/python setup.py           # out/ keys + SRS, ../contracts/src/Verifier.sol
.venv/Scripts/python prove.py --old 70,40,60,55 --new 92,75,60,70
.venv/Scripts/python hash.py 70,40,60,55
.venv/Scripts/python gen_vectors.py     # ../shared/test_vectors.json
```

`out/` is gitignored: `pk.key` is 329 MB. Rerunning `setup.py` can change `Verifier.sol`. If it does, redeploy and rerun `gen_vectors.py`, because proofs only verify against the keys that made them.
