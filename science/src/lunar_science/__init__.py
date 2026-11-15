"""Lunar Landing Site Navigator science package.

``lunar_science.navigator`` holds the precomputation engine (DEM horizons, SPICE ephemeris,
illumination, communications and an illustrative landing score). ``get_status`` below only
serves the legacy ``contracts/science-status.schema.json`` placeholder printed by the CLI when it
is called without arguments; that contract admits no status other than ``not_implemented`` and
does not describe the navigator engine.
"""


def get_status() -> dict[str, str]:
    """Return the legacy placeholder compatible with contracts/science-status.schema.json."""
    return {
        "schema_version": "1.0.0",
        "status": "not_implemented",
        "message": "Aguardando implementação científica pela equipe.",
    }
