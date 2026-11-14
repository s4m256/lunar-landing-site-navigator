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
