"""Export the trained checkpoint to ONNX and (re)generate the metrics report.

Separate from training so the export can be re-run without retraining.
"""
import json

import numpy as np
import torch

from train_material_classifier import (
    IMG_SIZE, MODEL_DIR, RESULTS_DIR, build_loaders, build_model,
    download_dataset, evaluate, log,
)


def main():
    data_root = download_dataset()
    _, val_loader, classes = build_loaders(data_root, batch=32)

    model = build_model(len(classes))
    model.load_state_dict(torch.load(MODEL_DIR / "material_classifier.pt",
                                     map_location="cpu"))
    model.eval()

    val_acc, cm = evaluate(model, val_loader, torch.device("cpu"), len(classes))
    log(f"Reloaded checkpoint: val_acc {val_acc:.4f}")

    dummy = torch.randn(1, 3, IMG_SIZE, IMG_SIZE)
    torch.onnx.export(
        model, dummy, MODEL_DIR / "material_classifier.onnx",
        input_names=["image"], output_names=["logits"],
        dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=13, dynamo=False)
    (MODEL_DIR / "labels.json").write_text(json.dumps(classes), encoding="utf-8")

    per_class = {}
    for i, cls in enumerate(classes):
        tp = int(cm[i][i])
        per_class[cls] = {
            "precision": round(tp / max(int(cm[:, i].sum()), 1), 4),
            "recall": round(tp / max(int(cm[i].sum()), 1), 4),
            "support": int(cm[i].sum()),
        }
    metrics = {
        "model": "MobileNetV3-Small (ImageNet transfer learning)",
        "dataset": "TrashNet (Yang & Thung 2016), 80/20 split, seed 42",
        "val_accuracy": round(float(val_acc), 4),
        "per_class": per_class,
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8")

    header = " " * 11 + " ".join(f"{c[:9]:>9}" for c in classes)
    rows = [header] + [
        f"{classes[i][:10]:>10} " + " ".join(f"{int(v):>9}" for v in cm[i])
        for i in range(len(classes))
    ]
    (RESULTS_DIR / "confusion_matrix.txt").write_text(
        "rows = actual, cols = predicted\n" + "\n".join(rows), encoding="utf-8")

    log("Export complete: material_classifier.onnx + metrics.json")


if __name__ == "__main__":
    main()
