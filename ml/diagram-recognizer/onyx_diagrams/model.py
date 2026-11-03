"""Square classifier for chess diagrams (I-56).

One grayscale square in, 13 logits out: empty plus the 12 pieces. The board is read as a batch of 64
squares (128 with the board turned 180°), so the network must stay small: about 24 M multiply-adds
per square at 48 × 48.
"""

from torch import nn

# Class order is part of the model contract (manifest, Rust decoder). Never reorder.
CLASSES = ["empty", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]


def _block(c_in: int, c_out: int, convs: int) -> list[nn.Module]:
    layers: list[nn.Module] = []
    for i in range(convs):
        layers += [
            nn.Conv2d(c_in if i == 0 else c_out, c_out, 3, padding=1, bias=False),
            nn.BatchNorm2d(c_out),
            nn.ReLU(inplace=True),
        ]
    layers.append(nn.MaxPool2d(2))
    return layers


class SquareNet(nn.Module):
    def __init__(self, widths: tuple[int, ...] = (16, 32, 64, 128), classes: int = len(CLASSES)):
        super().__init__()
        layers = _block(1, widths[0], 1)
        for c_in, c_out in zip(widths, widths[1:]):
            layers += _block(c_in, c_out, 2)
        self.features = nn.Sequential(*layers)
        self.head = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Dropout(0.2),
            nn.Linear(widths[-1], classes),
        )

    def forward(self, x):
        return self.head(self.features(x))
