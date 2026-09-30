#!/usr/bin/env python3
"""Create-only upload of one InfiDao release's public fonts to Tencent COS."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import subprocess
import sys
from pathlib import Path

BUCKET = "tongye-1327162705"
REGION = "ap-shanghai"
SERVICE = "fv-slide-cos-upload"
PREFIX = "releases/aitoshuu-me/"
CACHE = "public, max-age=31536000, immutable"


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def keychain(account: str) -> str:
    result = subprocess.run(
        ["security", "find-generic-password", "-s", SERVICE, "-a", account, "-w"],
        capture_output=True,
        check=False,
    )
    if result.returncode or not result.stdout.strip():
        raise RuntimeError(f"Keychain account {account} unavailable")
    return result.stdout.decode("utf-8").strip()


def checked_file(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or relative.startswith(("/", "\\")) or "\\" in relative or ".." in Path(relative).parts:
        raise RuntimeError("unsafe package path")
    file = root / relative
    if file.is_symlink() or not file.resolve().is_relative_to(root) or not file.is_file():
        raise RuntimeError("invalid package file")
    return file


def plan(root: Path) -> tuple[str, list[dict]]:
    manifest_file = checked_file(root, "manifests/release-manifest.json")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    release_id = manifest.get("releaseId")
    if manifest.get("schemaVersion") != 1 or manifest.get("site") != "InfiDao" or not isinstance(release_id, str) or not re.fullmatch(r"infidao-[0-9a-f]{16}", release_id):
        raise RuntimeError("invalid InfiDao release manifest")
    prefix = f"{PREFIX}{release_id}/"
    version = manifest.get("fontVersion")
    if not isinstance(version, str) or not re.fullmatch(r"[A-Za-z0-9_-]{10,64}", version):
        raise RuntimeError("invalid font version")
    if manifest.get("objectPrefix") != prefix or manifest.get("cdnBase") != f"https://assets.aitoshuu.me/{prefix}flow-assets/v-{version}":
        raise RuntimeError("CDN scope mismatch")
    entries = manifest.get("entries")
    if not isinstance(entries, list) or len(entries) < 2:
        raise RuntimeError("font entries missing")
    checked = []
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("channel") != "fonts":
            raise RuntimeError("invalid channel")
        name = entry.get("packagePath")
        expected_start = f"cdn/flow-assets/v-{version}/"
        if not isinstance(name, str) or not name.startswith(expected_start):
            raise RuntimeError("invalid font package path")
        key = prefix + name[len("cdn/"):]
        if key != entry.get("objectKey") or key in seen:
            raise RuntimeError("invalid or duplicate COS object key")
        seen.add(key)
        file = checked_file(root, name)
        if file.stat().st_size != entry.get("bytes") or digest(file) != entry.get("sha256"):
            raise RuntimeError("font package hash mismatch")
        if entry.get("bytes", 0) <= 0 or entry.get("cacheControl") != CACHE or entry.get("mime") not in ("font/woff", "application/json; charset=utf-8"):
            raise RuntimeError("invalid immutable metadata")
        checked.append({**entry, "localPath": file})
    checked.append({
        "objectKey": prefix + "manifests/release-manifest.json",
        "localPath": manifest_file,
        "bytes": manifest_file.stat().st_size,
        "sha256": digest(manifest_file),
        "mime": "application/json; charset=utf-8",
        "cacheControl": "no-store",
    })
    return release_id, sorted(checked, key=lambda entry: entry["objectKey"])


def header(data: dict, name: str) -> str | None:
    return next((str(value) for key, value in data.items() if key.lower() == name.lower()), None)


def matches(entry: dict, data: dict | None, release_id: str) -> bool:
    return data is not None and all((
        header(data, "Content-Length") == str(entry["bytes"]),
        header(data, "Content-Type") == entry["mime"],
        header(data, "Cache-Control") == entry["cacheControl"],
        header(data, "x-cos-meta-sha256") == entry["sha256"],
        header(data, "x-cos-meta-release-id") == release_id,
    ))


def upload(release_id: str, entries: list[dict]) -> dict:
    try:
        from qcloud_cos import CosConfig, CosS3Client
        from qcloud_cos.cos_exception import CosServiceError
    except ImportError as error:
        raise RuntimeError("Tencent COS SDK unavailable") from error
    logging.getLogger("qcloud_cos").setLevel(logging.CRITICAL)
    client = CosS3Client(CosConfig(Region=REGION, SecretId=keychain("secret-id"), SecretKey=keychain("secret-key")))

    def head(key: str) -> dict | None:
        try:
            return client.head_object(Bucket=BUCKET, Key=key)
        except CosServiceError as error:
            if error.get_status_code() == 404:
                return None
            raise RuntimeError(f"COS HEAD HTTP {error.get_status_code()}") from None

    result = {"uploaded": 0, "skipped": 0}
    for entry in entries:
        key = entry["objectKey"]
        existing = head(key)
        if existing is not None:
            if not matches(entry, existing, release_id):
                raise RuntimeError("immutable COS object conflict")
            result["skipped"] += 1
            continue
        try:
            with entry["localPath"].open("rb") as stream:
                client.put_object(
                    Bucket=BUCKET, Key=key, Body=stream,
                    ContentType=entry["mime"], CacheControl=entry["cacheControl"],
                    Metadata={"x-cos-forbid-overwrite": "true", "x-cos-meta-sha256": entry["sha256"], "x-cos-meta-release-id": release_id},
                )
        except CosServiceError as error:
            if not matches(entry, head(key), release_id):
                raise RuntimeError(f"COS create HTTP {error.get_status_code()}") from None
        if not matches(entry, head(key), release_id):
            raise RuntimeError("COS post-upload verification failed")
        result["uploaded"] += 1
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package_dir", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--bucket", default=BUCKET)
    parser.add_argument("--region", default=REGION)
    args = parser.parse_args()
    if args.bucket != BUCKET or args.region != REGION:
        raise RuntimeError("bucket or region outside approved scope")
    release_id, entries = plan(args.package_dir.resolve())
    if args.apply:
        print(json.dumps({"releaseId": release_id, **upload(release_id, entries)}))
    else:
        print(json.dumps({"mode": "offline-plan", "releaseId": release_id, "objects": len(entries), "bytes": sum(entry["bytes"] for entry in entries), "objectPrefix": f"{PREFIX}{release_id}/"}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("COS release blocked; package, scope, SDK, or Keychain check failed", file=sys.stderr)
        raise SystemExit(1)
