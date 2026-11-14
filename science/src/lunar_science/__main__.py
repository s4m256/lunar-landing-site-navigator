"""Print the integration placeholder as UTF-8 JSON."""
import json

from lunar_science import get_status


def main() -> None:
    print(json.dumps(get_status(), ensure_ascii=False))


if __name__ == "__main__":
    main()
