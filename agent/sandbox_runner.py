"""Runs one test suite or benchmark against candidate code. Started by harness.py with `python -I`."""
import importlib.util
import json
import os
import socket
import statistics
import sys


def _block_network():
    def blocked(*args, **kwargs):
        raise OSError("network disabled in sandbox")

    socket.socket = blocked
    socket.create_connection = blocked
    socket.getaddrinfo = blocked


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_tests(suite, candidate):
    names = sorted(n for n in dir(suite) if n.startswith("test_"))
    failed = []
    for name in names:
        try:
            getattr(suite, name)(candidate)
        except BaseException:
            failed.append(name)
    return {"passed": len(names) - len(failed), "total": len(names), "failed": failed}


def _run_benchmark(suite, candidate):
    return {"ratio": statistics.median(suite.benchmark(candidate) for _ in range(3))}


def main():
    mode, suite_path, candidate_path = sys.argv[1:4]
    # Candidate prints go to devnull so they can't flood or forge the result line.
    result_stream = os.fdopen(os.dup(1), "w")
    devnull = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull, 1)
    os.dup2(devnull, 2)

    suite = _load(suite_path, "suite")
    _block_network()
    candidate = _load(candidate_path, "candidate")
    result = _run_tests(suite, candidate) if mode == "tests" else _run_benchmark(suite, candidate)
    result_stream.write(json.dumps(result))
    result_stream.flush()


if __name__ == "__main__":
    main()
