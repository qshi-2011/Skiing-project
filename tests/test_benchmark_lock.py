"""Unit and parity tests for the benchmark_lock shared module (Phase 2)."""
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.evaluation.benchmark_lock import (  # noqa: E402
    count_split_files,
    load_benchmark_lock,
    validate_benchmark_lock,
)


# ---------------------------------------------------------------------------
# load_benchmark_lock
# ---------------------------------------------------------------------------


def test_load_benchmark_lock_real():
    """Load the real lock file and verify all required fields are present."""
    lock_path = PROJECT_ROOT / "configs" / "benchmark_lock.yaml"
    lock = load_benchmark_lock(lock_path)
    assert lock["test_images"] == 26
    assert lock["test_labels"] == 26
    assert lock["default_threshold"] == 0.35
    assert abs(lock["baseline_stage1_f1"] - 0.7671) < 1e-4
    assert "data_yaml" in lock


def test_load_benchmark_lock_missing_raises(tmp_path):
    """load_benchmark_lock raises FileNotFoundError for missing file."""
    with pytest.raises(FileNotFoundError):
        load_benchmark_lock(tmp_path / "nonexistent.yaml")


# ---------------------------------------------------------------------------
# count_split_files
# ---------------------------------------------------------------------------


def _make_fake_dataset(root: Path, n_images: int, n_labels: int) -> Path:
    """Create a minimal YOLO-style dataset under root, return data.yaml path."""
    img_dir = root / "test" / "images"
    lbl_dir = root / "test" / "labels"
    img_dir.mkdir(parents=True)
    lbl_dir.mkdir(parents=True)
    for i in range(n_images):
        (img_dir / f"img{i:04d}.jpg").touch()
    for i in range(n_labels):
        (lbl_dir / f"img{i:04d}.txt").touch()
    data_yaml = root / "data.yaml"
    data_yaml.write_text("test: test/images\nnc: 1\nnames: ['gate']\n")
    return data_yaml


def test_count_split_files_correct(tmp_path):
    data_yaml = _make_fake_dataset(tmp_path, n_images=7, n_labels=5)
    img_count, lbl_count = count_split_files(data_yaml)
    assert img_count == 7
    assert lbl_count == 5


def test_count_split_files_real_curated():
    """Real curated dataset must have exactly 26 images and 26 labels."""
    data_yaml = PROJECT_ROOT / "data" / "datasets" / "final_combined_1class_20260226_curated" / "data.yaml"
    if not data_yaml.exists():
        pytest.skip("Curated dataset not available in this environment")
    img_count, lbl_count = count_split_files(data_yaml)
    assert img_count == 26, f"Expected 26 test images, got {img_count}"
    assert lbl_count == 26, f"Expected 26 test labels, got {lbl_count}"


# ---------------------------------------------------------------------------
# validate_benchmark_lock — pass cases
# ---------------------------------------------------------------------------


def test_validate_passes_when_counts_match(tmp_path):
    data_yaml = _make_fake_dataset(tmp_path, n_images=5, n_labels=5)
    lock = {"test_images": 5, "test_labels": 5}
    result = validate_benchmark_lock(lock, data_yaml)
    assert result["passed"] is True
    assert result["failure_reason"] is None
    assert result["actual"]["images"] == 5
    assert result["actual"]["labels"] == 5
    assert result["expected"] == {"images": 5, "labels": 5}


# ---------------------------------------------------------------------------
# validate_benchmark_lock — fail cases
# ---------------------------------------------------------------------------


def test_validate_fails_on_image_count_mismatch(tmp_path):
    data_yaml = _make_fake_dataset(tmp_path, n_images=3, n_labels=5)
    lock = {"test_images": 5, "test_labels": 5}
    result = validate_benchmark_lock(lock, data_yaml)
    assert result["passed"] is False
    assert result["failure_reason"] is not None
    assert "FAILED" in result["failure_reason"]
    assert "5" in result["failure_reason"]  # expected count mentioned


def test_validate_fails_on_label_count_mismatch(tmp_path):
    data_yaml = _make_fake_dataset(tmp_path, n_images=5, n_labels=2)
    lock = {"test_images": 5, "test_labels": 5}
    result = validate_benchmark_lock(lock, data_yaml)
    assert result["passed"] is False
    assert "FAILED" in result["failure_reason"]


def test_validate_failure_reason_format(tmp_path):
    """Failure reason must include expected and actual counts."""
    data_yaml = _make_fake_dataset(tmp_path, n_images=10, n_labels=8)
    lock = {"test_images": 26, "test_labels": 26}
    result = validate_benchmark_lock(lock, data_yaml)
    reason = result["failure_reason"]
    assert "26" in reason   # expected counts
    assert "10" in reason   # actual images
    assert "8" in reason    # actual labels


# ---------------------------------------------------------------------------
# Parity test — both eval scripts must include identical lock metadata keys
# ---------------------------------------------------------------------------

EXPECTED_LOCK_KEYS = {
    "benchmark_lock_path",
    "resolved_test_images_count",
    "resolved_test_labels_count",
    "benchmark_lock_passed",
    "benchmark_lock_expected",
}


def test_parity_lock_keys_in_both_eval_scripts():
    """Both run_eval.py files must define the same benchmark lock metadata keys."""
    script1 = (PROJECT_ROOT / "scripts" / "run_eval.py").read_text(encoding="utf-8")
    script2 = (PROJECT_ROOT / "scripts" / "evaluation" / "run_eval.py").read_text(encoding="utf-8")
    for key in EXPECTED_LOCK_KEYS:
        assert f'"{key}"' in script1, (
            f"Key '{key}' missing from scripts/run_eval.py"
        )
        assert f'"{key}"' in script2, (
            f"Key '{key}' missing from scripts/evaluation/run_eval.py"
        )


def test_parity_lock_import_in_both_eval_scripts():
    """Both run_eval.py files must import from benchmark_lock."""
    script1 = (PROJECT_ROOT / "scripts" / "run_eval.py").read_text(encoding="utf-8")
    script2 = (PROJECT_ROOT / "scripts" / "evaluation" / "run_eval.py").read_text(encoding="utf-8")
    assert "benchmark_lock" in script1, "scripts/run_eval.py missing benchmark_lock import"
    assert "benchmark_lock" in script2, "scripts/evaluation/run_eval.py missing benchmark_lock import"


def test_parity_default_data_in_both_eval_scripts():
    """Both run_eval.py files must default --data to the curated dataset."""
    curated = "final_combined_1class_20260226_curated"
    script1 = (PROJECT_ROOT / "scripts" / "run_eval.py").read_text(encoding="utf-8")
    script2 = (PROJECT_ROOT / "scripts" / "evaluation" / "run_eval.py").read_text(encoding="utf-8")
    assert curated in script1, f"scripts/run_eval.py --data default missing '{curated}'"
    assert curated in script2, f"scripts/evaluation/run_eval.py --data default missing '{curated}'"
