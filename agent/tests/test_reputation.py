from agent import reputation


def run(**by_version):
    return {"by_version": by_version}


def test_a_gain_is_measured_against_the_best_so_far():
    assert list(reputation.rounds(run(V1=5000, V2=4000, V3=5500))) == [(0, -1000), (1, 500)]


def test_reviewers_are_compared_with_the_same_turn_without_them():
    result = {
        "reviewers": ["kimi", "glm"],
        "panel": [run(V1=5000, V2=6000, V3=6100)],
        "control": [run(V1=5000, V2=5400, V3=5400)],
    }
    kimi, glm = sorted(reputation.score([result]), key=lambda row: row["turn"])
    assert (kimi["reviewer"], kimi["improved"], kimi["lift"]) == ("kimi", 1, 600)
    assert (glm["reviewer"], glm["mean_gain"], glm["lift"]) == ("glm", 100, 100)
