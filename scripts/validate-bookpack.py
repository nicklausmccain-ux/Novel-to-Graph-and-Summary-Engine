#!/usr/bin/env python3
"""
validate-bookpack.py — Validates a BookPack directory against the v1 schema.

Usage:
    python scripts/validate-bookpack.py public/books/brothers-karamazov
    python scripts/validate-bookpack.py public/books/crime-and-punishment --strict

Exit codes:
    0 — All checks passed (warnings are OK)
    1 — One or more ERROR-level checks failed
"""

import argparse
import json
import os
import sys


class BookPackValidator:
    def __init__(self, book_dir: str, strict: bool = False):
        self.book_dir = os.path.abspath(book_dir)
        self.book_id = os.path.basename(self.book_dir)
        self.strict = strict  # treat warnings as errors
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, msg: str):
        self.errors.append(msg)
        print(f"  ERROR   {msg}")

    def warn(self, msg: str):
        self.warnings.append(msg)
        if self.strict:
            self.errors.append(msg)
            print(f"  ERROR   {msg}  (strict)")
        else:
            print(f"  WARNING {msg}")

    def ok(self, msg: str):
        print(f"  OK      {msg}")

    def load_json(self, rel_path: str) -> dict | list | None:
        """Load a JSON file relative to book_dir. Returns None if missing/invalid."""
        full = os.path.join(self.book_dir, rel_path)
        if not os.path.isfile(full):
            return None
        try:
            with open(full, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            self.error(f"{rel_path}: invalid JSON — {e}")
            return None

    def validate(self) -> bool:
        """Run all validation checks. Returns True if no errors."""
        print(f"\nValidating BookPack: {self.book_dir}")
        print(f"Book ID: {self.book_id}")
        print("-" * 60)

        if not os.path.isdir(self.book_dir):
            self.error(f"Directory does not exist: {self.book_dir}")
            return False

        # 1. book.json
        book_meta = self._check_book_json()

        # 2. chapters/index.json
        chapter_index = self._check_chapters_index()

        # 3. Chapter files exist
        if chapter_index:
            self._check_chapter_files(chapter_index)

        # 4. Chapter count consistency
        if book_meta and chapter_index:
            self._check_chapter_count(book_meta, chapter_index)

        # 5. characters/index.json
        char_index = self._check_characters_index()

        # 6. Character count consistency
        if book_meta and char_index:
            self._check_character_count(book_meta, char_index)

        # 7. Node IDs exist in character registry
        if chapter_index and char_index:
            self._check_node_character_coverage(chapter_index, char_index)

        # 8. No empty snapshots
        if chapter_index:
            self._check_no_empty_snapshots(chapter_index)

        # Summary
        print("-" * 60)
        if self.errors:
            print(f"FAILED: {len(self.errors)} error(s), {len(self.warnings)} warning(s)")
            return False
        elif self.warnings:
            print(f"PASSED with {len(self.warnings)} warning(s)")
            return True
        else:
            print("PASSED: all checks OK")
            return True

    def _check_book_json(self) -> dict | None:
        meta = self.load_json("book.json")
        if meta is None:
            self.error("book.json is missing or invalid")
            return None

        required = ["id", "title", "author", "schemaVersion"]
        missing = [k for k in required if k not in meta]
        if missing:
            self.error(f"book.json missing required fields: {missing}")
            return None

        if meta.get("schemaVersion") != "1.0":
            self.error(
                f"book.json schemaVersion is '{meta.get('schemaVersion')}', expected '1.0'"
            )

        # Check cover image if referenced
        cover = meta.get("coverImage")
        if cover:
            cover_path = os.path.join(self.book_dir, cover)
            if not os.path.isfile(cover_path):
                self.warn(f"book.json references coverImage '{cover}' but file not found")

        self.ok(f"book.json: {meta['title']} by {meta['author']}")
        return meta

    def _check_chapters_index(self) -> list | None:
        index = self.load_json("chapters/index.json")
        if index is None:
            self.error("chapters/index.json is missing or invalid")
            return None

        if not isinstance(index, list):
            self.error("chapters/index.json is not an array")
            return None

        if len(index) == 0:
            self.error("chapters/index.json is empty")
            return None

        # Validate each entry has required fields
        for i, entry in enumerate(index):
            for field in ["chapter", "snapshot", "delta"]:
                if field not in entry:
                    self.error(f"chapters/index.json[{i}] missing '{field}'")

        self.ok(f"chapters/index.json: {len(index)} chapter(s)")
        return index

    def _check_chapter_files(self, index: list):
        chapters_dir = os.path.join(self.book_dir, "chapters")
        missing_snapshots = []
        missing_deltas = []

        for entry in index:
            snap = entry.get("snapshot", "")
            delta = entry.get("delta", "")
            ch = entry.get("chapter", "?")

            if snap and not os.path.isfile(os.path.join(chapters_dir, snap)):
                missing_snapshots.append((ch, snap))
            if delta and not os.path.isfile(os.path.join(chapters_dir, delta)):
                missing_deltas.append((ch, delta))

        if missing_snapshots:
            self.error(
                f"{len(missing_snapshots)} snapshot file(s) missing: "
                + ", ".join(f"ch{ch}:{f}" for ch, f in missing_snapshots[:5])
                + ("..." if len(missing_snapshots) > 5 else "")
            )
        else:
            self.ok(f"All {len(index)} snapshot files exist")

        if missing_deltas:
            self.error(
                f"{len(missing_deltas)} delta file(s) missing: "
                + ", ".join(f"ch{ch}:{f}" for ch, f in missing_deltas[:5])
                + ("..." if len(missing_deltas) > 5 else "")
            )
        else:
            self.ok(f"All {len(index)} delta files exist")

    def _check_chapter_count(self, meta: dict, index: list):
        declared = meta.get("chapterCount", 0)
        actual = len(index)
        if declared != actual:
            self.error(
                f"book.json chapterCount={declared} but chapters/index.json has {actual} entries"
            )
        else:
            self.ok(f"chapterCount matches: {actual}")

    def _check_characters_index(self) -> dict | None:
        chars = self.load_json("characters/index.json")
        if chars is None:
            self.warn("characters/index.json is missing or invalid")
            return None

        if not isinstance(chars, dict):
            self.warn("characters/index.json is not a dict")
            return None

        self.ok(f"characters/index.json: {len(chars)} character(s)")
        return chars

    def _check_character_count(self, meta: dict, chars: dict):
        declared = meta.get("characterCount", 0)
        actual = len(chars)
        if declared != actual:
            self.warn(
                f"book.json characterCount={declared} but characters/index.json has {actual} entries"
            )
        else:
            self.ok(f"characterCount matches: {actual}")

    def _check_node_character_coverage(self, index: list, chars: dict):
        """Check that node IDs in the last snapshot exist in characters/index.json."""
        # Only check the last snapshot (it's cumulative, so it has all nodes)
        last_entry = index[-1]
        snap_file = last_entry.get("snapshot", "")
        if not snap_file:
            return

        snap = self.load_json(f"chapters/{snap_file}")
        if not snap or not isinstance(snap, dict):
            return

        nodes = snap.get("nodes", [])
        missing = []
        for node in nodes:
            nid = node.get("id", "")
            if nid and nid not in chars:
                missing.append(nid)

        if missing:
            self.warn(
                f"{len(missing)} node ID(s) not in characters/index.json: "
                + ", ".join(missing[:10])
                + ("..." if len(missing) > 10 else "")
            )
        else:
            self.ok(f"All {len(nodes)} node IDs found in characters/index.json")

    def _check_no_empty_snapshots(self, index: list):
        """Warn if any snapshot has 0 nodes."""
        empty = []
        for entry in index:
            snap_file = entry.get("snapshot", "")
            ch = entry.get("chapter", "?")
            if not snap_file:
                continue
            snap = self.load_json(f"chapters/{snap_file}")
            if snap and isinstance(snap, dict):
                nodes = snap.get("nodes", [])
                if len(nodes) == 0:
                    empty.append(ch)

        if empty:
            self.warn(f"{len(empty)} snapshot(s) have 0 nodes: chapters {empty[:10]}")
        else:
            self.ok("No empty snapshots")


def main():
    parser = argparse.ArgumentParser(
        description="Validate a BookPack directory against the v1 schema"
    )
    parser.add_argument(
        "book_dir",
        help="Path to the BookPack directory (e.g., public/books/brothers-karamazov)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as errors",
    )
    args = parser.parse_args()

    validator = BookPackValidator(args.book_dir, strict=args.strict)
    passed = validator.validate()
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
