#!/usr/bin/env python3
"""
build_catalog.py — Scans public/books/ and rebuilds catalog.json

Usage:
    python scripts/build_catalog.py --books_dir public/books
    python scripts/build_catalog.py --books_dir public/books --out catalog.json

Reads each <book-id>/book.json, extracts metadata, writes a unified catalog.json
that the CatalogPage component loads at runtime.
"""

import argparse
import json
import os
import sys


def load_book_meta(book_dir: str) -> dict | None:
    """Read book.json from a BookPack directory and return catalog entry."""
    book_json_path = os.path.join(book_dir, "book.json")
    if not os.path.isfile(book_json_path):
        print(f"  SKIP {os.path.basename(book_dir)}: no book.json", file=sys.stderr)
        return None

    with open(book_json_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    # Validate required fields
    required = ["id", "title", "author"]
    missing = [k for k in required if k not in meta]
    if missing:
        print(
            f"  SKIP {os.path.basename(book_dir)}: book.json missing {missing}",
            file=sys.stderr,
        )
        return None

    return {
        "id": meta["id"],
        "title": meta["title"],
        "author": meta["author"],
        "coverImage": meta.get("coverImage"),
        "chapterCount": meta.get("chapterCount", 0),
        "characterCount": meta.get("characterCount", 0),
    }


def build_catalog(books_dir: str) -> dict:
    """Scan books_dir for BookPack folders and assemble catalog."""
    books = []

    if not os.path.isdir(books_dir):
        print(f"ERROR: books directory not found: {books_dir}", file=sys.stderr)
        sys.exit(1)

    for entry in sorted(os.listdir(books_dir)):
        book_path = os.path.join(books_dir, entry)
        if not os.path.isdir(book_path):
            continue
        meta = load_book_meta(book_path)
        if meta:
            books.append(meta)
            print(f"  OK   {meta['id']}: {meta['title']} by {meta['author']}")

    return {"books": books}


def main():
    parser = argparse.ArgumentParser(
        description="Rebuild catalog.json from BookPack directories"
    )
    parser.add_argument(
        "--books_dir",
        required=True,
        help="Path to the books directory (e.g., public/books)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output path for catalog.json (default: <books_dir>/../catalog.json)",
    )
    args = parser.parse_args()

    books_dir = os.path.abspath(args.books_dir)
    if args.out:
        out_path = os.path.abspath(args.out)
    else:
        out_path = os.path.join(os.path.dirname(books_dir), "catalog.json")

    print(f"Scanning: {books_dir}")
    catalog = build_catalog(books_dir)
    print(f"\nFound {len(catalog['books'])} book(s)")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()
