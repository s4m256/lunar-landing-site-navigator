import json
from pathlib import Path
import subprocess
import sys

from jsonschema import Draft7Validator
import pytest

from lunar_science import get_status

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
SCHEMA = json.loads((CONTRACTS / "science-status.schema.json").read_text())
VALIDATOR = Draft7Validator(SCHEMA)


def test_status_matches_shared_contract_and_fixture():
    Draft7Validator.check_schema(SCHEMA)
    payload = get_status()
    VALIDATOR.validate(payload)
    assert payload == json.loads((CONTRACTS / "examples/science-status.json").read_text())


def test_cli_emits_contract_json():
    result = subprocess.run([sys.executable, "-m", "lunar_science"], capture_output=True, text=True, check=True)
    assert result.stderr == ""
    payload = json.loads(result.stdout)
    VALIDATOR.validate(payload)
    assert payload == get_status()


@pytest.mark.parametrize("change", [
    {"schema_version": "2.0.0"}, {"status": "completed"},
    {"message": ""}, {"score": 1}, {"message": 42},
])
def test_contract_rejects_incompatible_payloads(change):
    assert not VALIDATOR.is_valid(get_status() | change)


def test_contract_rejects_missing_fields():
    assert not VALIDATOR.is_valid({})


# --------------------------------------------------------------------------
# navigator-dataset 1.1.0: synthetic example produced by the real producer
# --------------------------------------------------------------------------

NAVIGATOR_SCHEMA = json.loads((CONTRACTS / "navigator-dataset.v1.schema.json").read_text(encoding="utf-8"))
NAVIGATOR_EXAMPLE_PATH = CONTRACTS / "examples" / "navigator-dataset.synthetic.json"


def _load_example_generator():
    import importlib.util

    path = CONTRACTS.parent / "science" / "tools" / "generate_contract_example.py"
    spec = importlib.util.spec_from_file_location("generate_contract_example", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _assert_same_document(a, b, path=""):
    """Equal JSON documents, floats within 1e-9 (platform libm differences only)."""
    assert type(a) is type(b) or {type(a), type(b)} <= {int, float}, (path, a, b)
    if isinstance(a, dict):
        assert list(a) == list(b), path
        for key in a:
            _assert_same_document(a[key], b[key], f"{path}/{key}")
    elif isinstance(a, list):
        assert len(a) == len(b), path
        for i, (x, y) in enumerate(zip(a, b)):
            _assert_same_document(x, y, f"{path}/{i}")
    elif isinstance(a, float) or isinstance(b, float):
        assert a == pytest.approx(b, rel=1e-9, abs=1e-9), path
    else:
        assert a == b, path


def test_navigator_example_is_the_current_producer_output_on_synthetic_inputs():
    """contracts/examples/navigator-dataset.synthetic.json must follow the producer (contract drift guard)."""
    example = json.loads(NAVIGATOR_EXAMPLE_PATH.read_text(encoding="utf-8"))
    Draft7Validator(NAVIGATOR_SCHEMA).validate(example)
    _assert_same_document(example, _load_example_generator().build_example())


def test_navigator_example_is_labeled_synthetic_and_covers_native_1_1_branches():
    example = json.loads(NAVIGATOR_EXAMPLE_PATH.read_text(encoding="utf-8"))
    prov = example["provenance"]
    assert example["schema_version"] == "1.1.0" and "migration" not in prov
    assert prov["dem_product"]["product_id"] == "SYNTHETIC_DEM_TEST"
    assert prov["ephemeris"]["engine"].startswith("SYNTHETIC")
    assert all(s["description"].startswith("SYNTHETIC") for s in example["sites"])
    hv = prov["horizons_validation"]
    assert hv["status"] == "verified" and hv["tolerance_deg"] == 0.001 and len(hv["raw_responses"]) == 2
    scores = {s["id"]: s["engineering_summary"]["score"] for s in example["sites"]}
    assert scores["syn_b"]["eliminated"] is True and scores["syn_b"]["total_0_100"] == 0.0
    assert scores["syn_a"]["eliminated"] is False and scores["syn_a"]["total_0_100"] > 0.0
