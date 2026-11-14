"""Scientific integration boundary; no scientific algorithms yet."""


def get_status() -> dict[str, str]:
    """Return a placeholder compatible with contracts/science-status.schema.json."""
    return {
        "schema_version": "1.0.0",
        "status": "not_implemented",
        "message": "Aguardando implementação científica pela equipe.",
    }
