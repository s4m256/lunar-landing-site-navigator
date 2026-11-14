"""Verified NASA PDS LOLA topography and NAIF SPICE kernel registry."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from urllib.request import urlopen

LUNAR_REFERENCE_RADIUS_M = 1_737_400.0
SOLAR_CONSTANT_1AU_W_M2 = 1361.0
SOLAR_RADIUS_KM = 695_700.0
EARTH_RADIUS_KM = 6_378.137
AU_IN_KM = 149_597_870.7
MOON_GM_KM3_S2 = 4902.800066
SYNODIC_PERIOD_DAYS = 29.530588853


@dataclass(frozen=True)
class RemoteAsset:
    filename: str
    url: str
    sha256: str
    kind: str


NAIF_KERNELS: tuple[RemoteAsset, ...] = (
    RemoteAsset(
        filename="naif0012.tls",
        url="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
        sha256="678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b",
        kind="LSK",
    ),
    RemoteAsset(
        filename="pck00010.tpc",
        url="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00010.tpc",
        sha256="59468328349aa730d18bf1f8d7e86efe6e40b75dfb921908f99321b3a7a701d2",
        kind="PCK",
    ),
    RemoteAsset(
        filename="moon_080317.tf",
        url="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf",
        sha256="78732477b96f9863e7b0d65bcee3c22b8707ca5ed0db56d1173319cb2e8c7993",
        kind="FK",
    ),
    RemoteAsset(
        filename="moon_assoc_me.tf",
        url="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_assoc_me.tf",
        sha256="52c622043ce0447d575e59ee01642f1894921e68c10f934ceff065f362da6c1c",
        kind="FK",
    ),
    RemoteAsset(
        filename="moon_pa_de421_1900-2050.bpc",
        url="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc",
        sha256="656f90616403d75a75f0cd6c8830fc5b44f8cb4facb5ccb8915e752b397520cf",
        kind="BPC",
    ),
    RemoteAsset(
        filename="de421.bsp",
        url="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/de421.bsp",
        sha256="08b20db2ae22488650641c5a9033e5bfda4b1c4b440cfeaf20f621cfa18ecdb3",
        kind="SPK",
    ),
)

LOLA_DEM_ASSETS: tuple[RemoteAsset, ...] = (
    RemoteAsset(
        filename="ldem_80s_80m.lbl",
        url="https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl",
        sha256="107c7558cbf8832e4119d3c8c2b1b272623344275c85378a9b0e03c22876eb33",
        kind="PDS3_LBL",
    ),
    RemoteAsset(
        filename="ldem_80s_80m.img",
        url="https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img",
        sha256="e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc",
        kind="PDS3_DEM_IMG",
    ),
)

ALL_REMOTE_ASSETS: tuple[RemoteAsset, ...] = NAIF_KERNELS + LOLA_DEM_ASSETS


@dataclass(frozen=True)
class CandidateSiteSpec:
    site_id: str
    name: str
    category: str
    latitude_deg: float
    longitude_east_deg: float
    description: str
    observer_height_m: float = 2.0


DEFAULT_SOUTH_POLE_SITES: tuple[CandidateSiteSpec, ...] = (
    CandidateSiteSpec(
        site_id="shackleton_ridge",
        name="Shackleton–de Gerlache Connecting Ridge",
        category="reference_ridge",
        latitude_deg=-89.45,
        longitude_east_deg=222.50,
        description="Crista elevada entre as crateras Shackleton e de Gerlache; clássico oásis de iluminação solar próximo ao polo.",
    ),
    CandidateSiteSpec(
        site_id="malapert_massif",
        name="Malapert Massif",
        category="artemis_candidate",
        latitude_deg=-86.00,
        longitude_east_deg=2.70,
        description="Maciço elevado (~5 km) voltado para a Terra na região candidata Artemis III; excelente visibilidade direta (DTE).",
    ),
    CandidateSiteSpec(
        site_id="mons_mouton_plateau",
        name="Mons Mouton Plateau",
        category="artemis_candidate",
        latitude_deg=-84.361,
        longitude_east_deg=31.889,
        description="Planalto elevado (~5,6 km) e plano no cume de Mons Mouton (Artemis III), equilibrando baixíssima declividade e alta iluminação.",
    ),
    CandidateSiteSpec(
        site_id="nobile_rim_1",
        name="Nobile Rim 1",
        category="artemis_candidate",
        latitude_deg=-85.122,
        longitude_east_deg=36.929,
        description="Planalto elevado (~6,7 km) na borda da cratera Nobile (Artemis III), próximo a regiões permanentemente sombreadas com potencial de voláteis.",
    ),
    CandidateSiteSpec(
        site_id="nobile_rim_2",
        name="Nobile Rim 2",
        category="artemis_candidate",
        latitude_deg=-83.678,
        longitude_east_deg=55.553,
        description="Setor leste plano da borda de Nobile (Artemis III), combinando declividade segura CLPS e visibilidade orbital.",
    ),
    CandidateSiteSpec(
        site_id="peak_near_cabeus_b",
        name="Peak near Cabeus B",
        category="artemis_candidate",
        latitude_deg=-82.800,
        longitude_east_deg=318.378,
        description="Terraço adjacente à região de Cabeus B (Artemis III), setor histórico de detecção de gelo pelo experimento LCROSS.",
    ),
    CandidateSiteSpec(
        site_id="haworth_rim",
        name="Haworth",
        category="artemis_candidate",
        latitude_deg=-86.689,
        longitude_east_deg=347.500,
        description="Setor elevado voltado para a Terra na região da cratera Haworth (Artemis III), adjacente a extensas armadilhas frias.",
    ),
    CandidateSiteSpec(
        site_id="de_gerlache_rim_2",
        name="de Gerlache Rim 2",
        category="artemis_candidate",
        latitude_deg=-88.161,
        longitude_east_deg=287.389,
        description="Borda elevada e plana da cratera de Gerlache (Artemis III), combinando alta latitude polar e acesso ao interior sombreado.",
    ),
    CandidateSiteSpec(
        site_id="slater_plain",
        name="Slater Plain",
        category="artemis_candidate",
        latitude_deg=-88.589,
        longitude_east_deg=108.347,
        description="Planície elevada adjacente à cratera Slater (Artemis III), no hemisfério oculto próximo ao polo sul.",
    ),
    CandidateSiteSpec(
        site_id="shackleton_psr_floor",
        name="Shackleton Crater Floor (PSR)",
        category="psr_contrast",
        latitude_deg=-89.625,
        longitude_east_deg=118.82,
        description="Fundo da cratera Shackleton (Região Permanentemente Sombreada); demonstra bloqueio DTE e valor crítico de satélites relay.",
    ),
)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def ensure_assets(cache_dir: Path, assets: tuple[RemoteAsset, ...], allow_download: bool = True) -> list[dict[str, str]]:
    """Verify SHA-256 of cached NASA assets, downloading over HTTPS if missing."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    provenance_rows: list[dict[str, str]] = []
    for asset in assets:
        if not asset.url.startswith("https://"):
            raise ValueError(f"Asset URL must use HTTPS: {asset.url}")
        dest = cache_dir / asset.filename
        if dest.is_file():
            digest = sha256_file(dest)
            if digest != asset.sha256:
                raise ValueError(f"Checksum mismatch for cached asset {asset.filename}: {digest} != {asset.sha256}")
        else:
            if not allow_download:
                raise FileNotFoundError(f"Missing cached NASA asset: {dest}")
            tmp = dest.with_suffix(dest.suffix + ".part")
            h = hashlib.sha256()
            with urlopen(asset.url, timeout=120) as resp, tmp.open("wb") as out:
                while True:
                    chunk = resp.read(256 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    h.update(chunk)
            digest = h.hexdigest()
            if digest != asset.sha256:
                tmp.unlink(missing_ok=True)
                raise ValueError(f"Checksum mismatch on download for {asset.filename}: {digest} != {asset.sha256}")
            tmp.replace(dest)
        provenance_rows.append(
            {
                "filename": asset.filename,
                "url": asset.url,
                "sha256": asset.sha256,
            }
        )
    return provenance_rows
