"""Export the improvement circuit to ONNX. See docs/04-TRACK-ZK.md."""
import json
from pathlib import Path

import torch

OUT = Path(__file__).parent / "out"


class Improve(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer("w", torch.tensor([40.0, 30.0, 15.0, 15.0]))

    def forward(self, s_old, s_new):  # each shape (1,4)
        a = (s_old * self.w).sum(dim=1)
        b = (s_new * self.w).sum(dim=1)
        return (b > a).float()  # 1.0 or 0.0


def main():
    OUT.mkdir(exist_ok=True)
    s_old = torch.tensor([[70.0, 40.0, 60.0, 55.0]])
    s_new = torch.tensor([[92.0, 75.0, 60.0, 70.0]])
    torch.onnx.export(
        Improve().eval(),
        (s_old, s_new),
        OUT / "network.onnx",
        input_names=["s_old", "s_new"],
        output_names=["improved"],
        opset_version=13,
        dynamo=False,
    )
    (OUT / "calibration.json").write_text(
        json.dumps({"input_data": [s_old.flatten().tolist(), s_new.flatten().tolist()]})
    )
    print("wrote", OUT / "network.onnx")


if __name__ == "__main__":
    main()
