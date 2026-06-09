#!/usr/bin/env python3
"""Set the R2 bucket CORS policy so the dashboard can PUT idea images from the browser.

Idea-image upload PUTs directly from the browser to R2 (presigned URL), so the
bucket CORS must allow `PUT` plus the `content-type` request header from the
dashboard origins. The existing policy currently allows GET/HEAD only.

This script READS the live policy first and REUSES its `AllowedOrigins` verbatim
(it never guesses origins). It then proposes a single CORS rule that unions the
existing methods with GET/HEAD/PUT and ensures `content-type` is an allowed
request header. DEFAULT IS DRY-RUN — it prints the current and proposed policies
and writes nothing. Pass `--apply` to actually call put_bucket_cors.

Creds come from the environment (R2_ENDPOINT, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_BUCKET). No secrets live in this file — safe to commit
to the public dashboard repo.

Usage:
    python scripts/r2-cors.py            # dry-run: print current + proposed
    python scripts/r2-cors.py --apply    # write the new policy to the bucket
"""
from __future__ import annotations

import argparse
import json
import os
import sys

# Dashboard's known origins (mirrors the Cloud Function CORS allowlist). Used
# ONLY when the bucket has no CORS policy yet; otherwise we reuse the live ones.
DEFAULT_ORIGINS = [
    "https://studio-whence-dpb.web.app",
    "https://dpb.studiowhence.com",
    "http://localhost:5509",
]

REQUIRED_METHODS = ["GET", "HEAD", "PUT"]
REQUIRED_HEADER = "content-type"
MAX_AGE_SECONDS = 3600


def _make_client():
    """Build the boto3 R2 (S3-compatible) client from env. Raises KeyError if a
    credential env var is missing; the caller turns that into a clean message."""
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def get_current_rules(client, bucket: str) -> list[dict]:
    """Return the bucket's existing CORS rules, or [] if no policy is set."""
    try:
        resp = client.get_bucket_cors(Bucket=bucket)
        return resp.get("CORSRules", []) or []
    except Exception as err:  # NoSuchCORSConfiguration when unset
        name = getattr(err, "__class__", type(err)).__name__
        # botocore raises a ClientError with a NoSuchCORSConfiguration code when
        # no policy exists — treat that (and any "no CORS" signal) as empty.
        code = ""
        resp = getattr(err, "response", None)
        if isinstance(resp, dict):
            code = resp.get("Error", {}).get("Code", "")
        if "NoSuchCORSConfiguration" in (code, name) or "CORS" in code:
            return []
        raise


def _union(existing: list[str], required: list[str]) -> list[str]:
    """Existing values first (verbatim), then any required ones not already
    present (case-insensitive de-dupe). Preserves the live policy's ordering."""
    seen = {v.lower() for v in existing}
    out = list(existing)
    for v in required:
        if v.lower() not in seen:
            out.append(v)
            seen.add(v.lower())
    return out


def build_new_rules(current_rules: list[dict]) -> list[dict]:
    """Build the proposed single CORS rule from the current policy.

    Reuses the existing AllowedOrigins/AllowedHeaders verbatim, unions the
    methods with GET/HEAD/PUT, and guarantees `content-type` is allowed (unless
    the existing headers already use the `*` wildcard).
    """
    methods: list[str] = []
    origins: list[str] = []
    headers: list[str] = []
    expose: list[str] = []
    for rule in current_rules:
        methods = _union(methods, rule.get("AllowedMethods", []))
        origins = _union(origins, rule.get("AllowedOrigins", []))
        headers = _union(headers, rule.get("AllowedHeaders", []))
        expose = _union(expose, rule.get("ExposeHeaders", []))

    methods = _union(methods, REQUIRED_METHODS)
    if not origins:
        origins = list(DEFAULT_ORIGINS)

    # `*` already covers content-type; otherwise ensure it's present.
    if "*" not in headers:
        headers = _union(headers, [REQUIRED_HEADER])

    rule: dict = {
        "AllowedMethods": methods,
        "AllowedOrigins": origins,
        "AllowedHeaders": headers,
        "MaxAgeSeconds": MAX_AGE_SECONDS,
    }
    # Preserve any exposed response headers the live policy advertised.
    if expose:
        rule["ExposeHeaders"] = expose
    return [rule]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--apply",
        action="store_true",
        help="write the proposed policy to the bucket (default is dry-run)",
    )
    args = ap.parse_args(argv)

    # Load .env if python-dotenv is available so R2_* can be picked up locally.
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass

    try:
        bucket = os.environ["R2_BUCKET"]
        client = _make_client()
    except KeyError as missing:
        print(
            f"error: missing required environment variable {missing}.\n"
            "Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET "
            "(e.g. via an .env file) before running.",
            file=sys.stderr,
        )
        return 2
    except ImportError:
        print(
            "error: boto3 is not installed. Run `pip install boto3` first.",
            file=sys.stderr,
        )
        return 2

    try:
        current_rules = get_current_rules(client, bucket)
    except Exception as err:
        print(f"error: could not read current CORS policy: {err}", file=sys.stderr)
        return 1

    new_rules = build_new_rules(current_rules)

    print(f"bucket: {bucket}")
    print("current CORS policy:")
    print(json.dumps({"CORSRules": current_rules}, indent=2))
    print("proposed CORS policy:")
    print(json.dumps({"CORSRules": new_rules}, indent=2))

    if not args.apply:
        print("(dry-run — pass --apply to write)")
        return 0

    try:
        client.put_bucket_cors(
            Bucket=bucket, CORSConfiguration={"CORSRules": new_rules}
        )
    except Exception as err:
        print(f"error: put_bucket_cors failed: {err}", file=sys.stderr)
        return 1
    print("applied: new CORS policy written to the bucket.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
