"""EvoSnap research module — material / recyclability classifier.

Fine-tunes MobileNetV3-Small (ImageNet weights) on the TrashNet dataset
(Yang & Thung, 2016: 2,527 images across 6 recycling categories:
cardboard, glass, metal, paper, plastic, trash).

The trained model is exported to ONNX and served by the backend's
MaterialClassifierService as an independent, fully-local prediction that
runs alongside the vision-language model — giving every scan a second,
self-trained opinion about what material the object is made of.

Usage:
    pip install torch torchvision onnx pillow numpy
    python train_material_classifier.py [--epochs 6] [--batch 32]

Outputs (in research/):
    models/material_classifier.onnx
    models/labels.json
    results/metrics.json      (accuracy, per-class precision/recall)
    results/confusion_matrix.txt
    results/training_log.txt
"""
import argparse
import json
import random
import time
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, models, transforms

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"
RESULTS_DIR = ROOT / "results"
DATASET_URL = ("https://huggingface.co/datasets/cara-org/trashnet"
               "/resolve/main/dataset-resized.zip")
# Fallback mirrors, tried in order.
DATASET_MIRRORS = [
    DATASET_URL,
    "https://github.com/garythung/trashnet/raw/master/data/dataset-resized.zip",
]

SEED = 42
IMG_SIZE = 224
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def log(msg: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(RESULTS_DIR / "training_log.txt", "a", encoding="utf-8") as f:
        f.write(line + "\n")


def download_dataset() -> Path:
    """Download and extract TrashNet if not already present."""
    extracted = DATA_DIR / "dataset-resized"
    if extracted.exists() and any(extracted.iterdir()):
        log("Dataset already present.")
        return extracted
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = DATA_DIR / "dataset-resized.zip"
    if not zip_path.exists():
        last_err = None
        for url in DATASET_MIRRORS:
            try:
                log(f"Downloading TrashNet from {url} ...")
                req = urllib.request.Request(
                    url, headers={"User-Agent": "EvoSnap-research/1.0"})
                with urllib.request.urlopen(req, timeout=300) as r, \
                        open(zip_path, "wb") as f:
                    f.write(r.read())
                if zip_path.stat().st_size < 1_000_000:
                    zip_path.unlink()
                    raise RuntimeError("download too small — mirror served an error page")
                break
            except Exception as e:  # noqa: BLE001 — try next mirror
                last_err = e
                log(f"  mirror failed: {e}")
        else:
            raise RuntimeError(f"All dataset mirrors failed. Last error: {last_err}")
    log(f"Extracting {zip_path.name} ...")
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(DATA_DIR)
    # The zip may extract to dataset-resized/ or contain a __MACOSX shim.
    if not extracted.exists():
        candidates = [d for d in DATA_DIR.iterdir()
                      if d.is_dir() and not d.name.startswith("_")]
        if len(candidates) == 1:
            candidates[0].rename(extracted)
    return extracted


def build_loaders(data_root: Path, batch: int):
    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(IMG_SIZE, scale=(0.7, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.15),
        transforms.RandomRotation(12),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(IMG_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])

    base = datasets.ImageFolder(data_root)
    n = len(base)
    idx = list(range(n))
    random.Random(SEED).shuffle(idx)
    split = int(n * 0.8)
    train_idx, val_idx = idx[:split], idx[split:]

    train_ds = Subset(datasets.ImageFolder(data_root, transform=train_tf), train_idx)
    val_ds = Subset(datasets.ImageFolder(data_root, transform=eval_tf), val_idx)

    dist = Counter(base.targets[i] for i in train_idx)
    log(f"Dataset: {n} images, {len(base.classes)} classes {base.classes}")
    log(f"Train {len(train_idx)} / Val {len(val_idx)}; train dist {dict(dist)}")

    return (
        DataLoader(train_ds, batch_size=batch, shuffle=True, num_workers=0),
        DataLoader(val_ds, batch_size=batch, shuffle=False, num_workers=0),
        base.classes,
    )


def build_model(num_classes: int) -> nn.Module:
    model = models.mobilenet_v3_small(
        weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    # Freeze the feature extractor, retrain the classifier head first;
    # the last feature block is unfrozen for light fine-tuning.
    for p in model.features.parameters():
        p.requires_grad = False
    for p in model.features[-3:].parameters():
        p.requires_grad = True
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)
    return model


@torch.no_grad()
def evaluate(model, loader, device, num_classes: int):
    model.eval()
    correct = total = 0
    confusion = np.zeros((num_classes, num_classes), dtype=int)
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        pred = model(x).argmax(dim=1)
        correct += (pred == y).sum().item()
        total += y.numel()
        for t, p in zip(y.cpu().numpy(), pred.cpu().numpy()):
            confusion[t][p] += 1
    return correct / max(total, 1), confusion


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()

    torch.manual_seed(SEED)
    random.seed(SEED)
    np.random.seed(SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log(f"Device: {device}")

    data_root = download_dataset()
    train_loader, val_loader, classes = build_loaders(data_root, args.batch)
    model = build_model(len(classes)).to(device)

    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)
    optimizer = torch.optim.AdamW(
        (p for p in model.parameters() if p.requires_grad),
        lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs)

    best_acc = 0.0
    best_confusion = None
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, args.epochs + 1):
        model.train()
        running = seen = 0
        t0 = time.time()
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optimizer.step()
            running += loss.item() * y.numel()
            seen += y.numel()
        scheduler.step()
        val_acc, confusion = evaluate(model, val_loader, device, len(classes))
        log(f"Epoch {epoch}/{args.epochs}: loss {running / seen:.4f}, "
            f"val_acc {val_acc:.4f} ({time.time() - t0:.0f}s)")
        if val_acc > best_acc:
            best_acc, best_confusion = val_acc, confusion
            torch.save(model.state_dict(), MODEL_DIR / "material_classifier.pt")

    # --- Export best model to ONNX ---
    model.load_state_dict(torch.load(MODEL_DIR / "material_classifier.pt"))
    model.eval().to("cpu")
    dummy = torch.randn(1, 3, IMG_SIZE, IMG_SIZE)
    torch.onnx.export(
        model, dummy, MODEL_DIR / "material_classifier.onnx",
        input_names=["image"], output_names=["logits"],
        dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=13)
    (MODEL_DIR / "labels.json").write_text(json.dumps(classes), encoding="utf-8")

    # --- Metrics report ---
    cm = best_confusion
    per_class = {}
    for i, cls in enumerate(classes):
        tp = int(cm[i][i])
        precision = tp / max(int(cm[:, i].sum()), 1)
        recall = tp / max(int(cm[i].sum()), 1)
        per_class[cls] = {"precision": round(precision, 4),
                          "recall": round(recall, 4),
                          "support": int(cm[i].sum())}
    metrics = {
        "model": "MobileNetV3-Small (ImageNet transfer learning)",
        "dataset": "TrashNet (Yang & Thung 2016), 80/20 split, seed 42",
        "epochs": args.epochs,
        "val_accuracy": round(best_acc, 4),
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

    log(f"DONE. Best val accuracy: {best_acc:.4f}")
    log(f"ONNX model: {MODEL_DIR / 'material_classifier.onnx'}")


if __name__ == "__main__":
    main()
