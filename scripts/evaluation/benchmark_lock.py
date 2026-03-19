"""
Shared benchmark lock helpers used by both run_eval.py entrypoints.

A benchmark lock enforces that evaluation always runs against the canonical
curated test split (26 images / 26 labels). Any count mismatch causes a
hard fail so that stale or wrong datasets can never silently produce results.
"""
from pathlib import Path

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
_LABEL_EXTENSION = ".txt"


def _parse_simple_yaml(path: Path) -> dict:
    """Minimal key:value YAML parser (no pyyaml dependency)."""
    data = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, raw = line.split(":", 1)
        raw = raw.strip()
        # Strip surrounding quotes
        if raw.startswith(("'", '"')) and raw.endswith(("'", '"')):
            data[key.strip()] = raw[1:-1]
            continue
        low = raw.lower()
        if low == "true":
            data[key.strip()] = True
        elif low == "false":
            data[key.strip()] = False
        elif low in {"none", "null"}:
            data[key.strip()] = None
        else:
            try:
                data[key.strip()] = int(raw) if "." not in raw else float(raw)
            except ValueError:
                data[key.strip()] = raw
    return data


def load_benchmark_lock(lock_path: Path) -> dict:
    """Parse benchmark_lock.yaml and return its contents as a dict.

    Expected keys: data_yaml, test_images, test_labels,
                   default_threshold, baseline_stage1_f1
    """
    lock_path = Path(lock_path)
    if not lock_path.exists():
        raise FileNotFoundError(f"Benchmark lock not found: {lock_path}")
    return _parse_simple_yaml(lock_path)


def count_split_files(data_yaml_path: Path, split: str = "test") -> tuple:
    """Resolve a YOLO data.yaml's test split dir and count image + label files.

    Returns (image_count, label_count).

    The data.yaml contains a line like:
        test: test/images
    Images are in that directory; labels are in the sibling ``labels/``
    directory (same base name, .txt extension).
    """
    data_yaml_path = Path(data_yaml_path)
    yaml_dir = data_yaml_path.parent
    data = _parse_simple_yaml(data_yaml_path)

    split_rel = data.get(split)
    if split_rel is None:
        raise KeyError(f"Split '{split}' not found in {data_yaml_path}")

    images_dir = Path(split_rel)
    if not images_dir.is_absolute():
        images_dir = (yaml_dir / images_dir).resolve()

    # Labels dir: sibling of images/ named labels/
    labels_dir = images_dir.parent.parent / "labels"
    if not labels_dir.exists():
        # Fallback: try replacing 'images' in the path with 'labels'
        labels_dir = Path(str(images_dir).replace("/images", "/labels"))

    image_count = 0
    if images_dir.exists():
        image_count = sum(
            1 for f in images_dir.iterdir()
            if f.is_file() and f.suffix.lower() in _IMAGE_EXTENSIONS
        )

    label_count = 0
    if labels_dir.exists():
        label_count = sum(
            1 for f in labels_dir.iterdir()
            if f.is_file() and f.suffix.lower() == _LABEL_EXTENSION
        )

    return image_count, label_count


def validate_benchmark_lock(lock: dict, data_yaml_path: Path) -> dict:
    """Validate actual test-split file counts against lock expectations.

    Returns a dict with keys:
        passed           bool
        expected         {"images": int, "labels": int}
        actual           {"images": int, "labels": int}
        failure_reason   str | None  (None when passed)
    """
    exp_images = int(lock.get("test_images", 0))
    exp_labels = int(lock.get("test_labels", 0))

    act_images, act_labels = count_split_files(Path(data_yaml_path), split="test")

    passed = (act_images == exp_images) and (act_labels == exp_labels)
    failure_reason = None
    if not passed:
        failure_reason = (
            f"Benchmark lock FAILED: expected {exp_images} images/{exp_labels} labels, "
            f"got {act_images}/{act_labels}"
        )

    return {
        "passed": passed,
        "expected": {"images": exp_images, "labels": exp_labels},
        "actual": {"images": act_images, "labels": act_labels},
        "failure_reason": failure_reason,
    }
