import argparse
import datetime as dt
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Iterable, Tuple, Union
from urllib.parse import urlparse
import requests

# Configuration
USER_AGENT = "nuget-rhino-actions/1.5"
REG_INDEX = "https://api.nuget.org/v3/registration5-semver1/rhinocommon/index.json"
STABLE_SUFFIX_RE = re.compile(r'^[0-9]+(\.[0-9]+){3}$')  # e.g., 8.24.25281.15001
BULLET_RE = re.compile(r'^\s{4}- \[.*\]\(.*\)\s*$')

# Environment variables with defaults
MAJORS_RAW = os.getenv("RHINO_MAJORS", "7,8")
LOCALES_RAW = os.getenv("RHINO_LOCALES", "en-us,de-de,es-es,fr-fr,it-it,ja-jp,ko-kr,zh-cn,zh-tw")
MD_LATEST = os.getenv("MD_PATH", "rhino-versions.md")
MD_ALL = os.getenv("MD_PATH_ALL", "rhino-versions-all.md")
HEAD_CHECK_LATEST = os.getenv("HEAD_CHECK_LATEST", "true").lower() == "true"
HEAD_CHECK_ALL = os.getenv("HEAD_CHECK_ALL", "false").lower() == "true"
MAC_HEAD_LIMIT = int(os.getenv("MAC_HEAD_LIMIT", "10"))  # Only HEAD-check Mac URLs for the N newest versions

# Parse lists
tokens = [t for t in re.split(r'[,\s]+', MAJORS_RAW.strip()) if t]
MAJORS: List[Union[int, str]] = []
for t in tokens:
    try:
        MAJORS.append(int(t))
    except ValueError:
        MAJORS.append(t)

LOCALES = [loc.strip() for loc in re.split(r'[,\s]+', LOCALES_RAW.strip()) if loc.strip()]


def fetch_registration_index() -> dict:
    """Fetch the NuGet registration index for RhinoCommon."""
    print(f"Fetching {REG_INDEX}...")
    r = requests.get(REG_INDEX, timeout=30, headers={"User-Agent": USER_AGENT})
    r.raise_for_status()
    return r.json()


def versions_from_registration(reg_json: dict) -> List[str]:
    """Extract all versions from the registration index."""
    pages = reg_json.get("items", [])

    def get_items_from_page(page: dict) -> List[dict]:
        items = page.get("items")
        if items is not None:
            return items

        page_url = page.get("@id")
        if not page_url:
            return []

        print(f"Fetching page: {page_url}")
        pr = requests.get(page_url, timeout=30, headers={"User-Agent": USER_AGENT})
        pr.raise_for_status()
        return pr.json().get("items", [])

    # Fetch pages concurrently while maintaining order
    with ThreadPoolExecutor(max_workers=10) as executor:
        pages_items = list(executor.map(get_items_from_page, pages))

    versions = []
    for items in pages_items:
        for leaf in items:
            ver = (leaf.get("catalogEntry") or {}).get("version")
            if ver:
                versions.append(ver)
    return versions


def parse_version_tuple(ver: str) -> Tuple[int, ...]:
    """Parse version string into a tuple of integers."""
    parts = ver.split(".")
    return tuple(int(p) for p in parts[:4])


def list_stable_for_majors(all_versions: List[str], majors: Iterable[Union[int, str]]) -> List[str]:
    """Filter for stable versions matching the requested major versions."""
    majors_set = {str(m) for m in majors}
    cands = [v for v in all_versions if STABLE_SUFFIX_RE.match(v)]
    cands = [v for v in cands if v.split(".", 1)[0] in majors_set]
    cands.sort(key=parse_version_tuple, reverse=True)
    return cands


def decode_version_date(ver: str) -> dt.date:
    """Decode the date from the version string (Rhino versioning scheme)."""
    # Rhino VersionNumber: major.minor.yyddd.hhmmb
    try:
        yyddd = ver.split(".")[2]
        yy = int(yyddd[:-3])
        ddd = int(yyddd[-3:])
        year = 2000 + yy
        return dt.date(year, 1, 1) + dt.timedelta(days=ddd - 1)
    except (IndexError, ValueError):
        # Fallback for unexpected formats
        return dt.date.today()


def _version_for_filename(ver: str) -> str:
    """Normalize version string for filenames (pad to 5 digits)."""
    parts = ver.split(".")
    if len(parts) < 4:
        raise ValueError(f"Unexpected version: {ver}")
    parts[2] = parts[2].zfill(5)  # yyddd
    parts[3] = parts[3].zfill(5)  # hhmmb
    return ".".join(parts[:4])


def build_windows_url(ver: str, date_obj: dt.date, locale: str) -> str:
    """Build the Windows download URL."""
    ver_name = _version_for_filename(ver)
    ymd = date_obj.strftime("%Y%m%d")
    filename = f"rhino_{locale}_{ver_name}.exe"
    return f"https://files.mcneel.com/dujour/exe/{ymd}/{filename}"


def build_mac_url_candidates(ver: str) -> List[str]:
    """
    Build candidate Mac download URLs.
    Mac versions often match the Windows version exactly, OR have the last digit incremented by 1.
    e.g. Windows ...15001 -> Mac ...15002
    """
    candidates = []
    ver_name = _version_for_filename(ver)
    major = ver.split(".")[0]
    
    # Candidate 1: Exact match
    filename1 = f"rhino_{ver_name}.dmg"
    url1 = f"https://files.mcneel.com/rhino/{major}/mac/releases/{filename1}"
    candidates.append(url1)
    
    # Candidate 2: Last digit + 1
    try:
        parts = ver_name.split(".")
        last_part = int(parts[3])
        new_last_part = str(last_part + 1).zfill(5)
        parts[3] = new_last_part
        ver_name_plus1 = ".".join(parts)
        filename2 = f"rhino_{ver_name_plus1}.dmg"
        url2 = f"https://files.mcneel.com/rhino/{major}/mac/releases/{filename2}"
        candidates.append(url2)
    except ValueError:
        pass
        
    return candidates


def url_exists(url: str) -> bool:
    """Check if a URL exists (HEAD request)."""
    try:
        r = requests.head(url, timeout=10, allow_redirects=True, headers={"User-Agent": USER_AGENT})
        if r.status_code == 200:
            return True
        # Some servers might block HEAD or return 405, try GET with stream
        if r.status_code in (405, 403):
            r = requests.get(url, timeout=10, stream=True, allow_redirects=True, headers={"User-Agent": USER_AGENT})
            r.close()
            return r.status_code == 200
        return False
    except requests.RequestException:
        return False


def ensure_newline(s: str) -> str:
    return s if s.endswith("\n") else s + "\n"


def prepend_latest(md_path: str, filename: str, url: str) -> bool:
    """Prepend a new version to the latest versions file."""
    bullet = f"    - [{filename}]({url})"
    os.makedirs(os.path.dirname(md_path) or ".", exist_ok=True)

    if not os.path.exists(md_path):
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(bullet + "\n")
        print(f"[added:newfile] {bullet}")
        return True

    with open(md_path, "r", encoding="utf-8") as f:
        content = f.read()

    if filename in content:
        # print("[ok] No update needed (already present).")
        return False

    lines = content.splitlines()
    insert_at = next((i for i, ln in enumerate(lines) if BULLET_RE.match(ln)), None)

    if insert_at is None:
        if lines and lines[-1] != "":
            lines.append("")
        lines.append(bullet)
    else:
        lines.insert(insert_at, bullet)

    new_content = ensure_newline("\n".join(lines))
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"[added] {bullet}")
    return True


def write_all(md_path_all: str, entries: List[Tuple[str, str]]) -> int:
    """Write all versions to the all-versions file."""
    os.makedirs(os.path.dirname(md_path_all) or ".", exist_ok=True)
    lines = [f"    - [{fn}]({u})" for (fn, u) in entries]
    with open(md_path_all, "w", encoding="utf-8") as f:
        f.write(ensure_newline("\n".join(lines)))
    return len(entries)


def check_only():
    """Lightweight check: is the latest NuGet version already in our data?"""
    try:
        reg = fetch_registration_index()
        versions = versions_from_registration(reg)
        stable = list_stable_for_majors(versions, MAJORS)

        if not stable:
            print("No stable versions found on NuGet.")
            _write_output("new_versions", "false")
            return

        latest = stable[0]
        print(f"Latest NuGet version: {latest}")

        # Check if this version is already present in the latest MD file
        if os.path.exists(MD_LATEST):
            with open(MD_LATEST, "r", encoding="utf-8") as f:
                content = f.read()
            ver_fn = _version_for_filename(latest)
            if ver_fn in content:
                print(f"Version {latest} already listed in {MD_LATEST}. Nothing to do.")
                _write_output("new_versions", "false")
                return

        print(f"New version {latest} detected! Full build required.")
        _write_output("new_versions", "true")

    except Exception as e:
        print(f"::warning::Check failed ({e}), triggering full build to be safe.")
        _write_output("new_versions", "true")


def _write_output(key: str, value: str):
    """Write a key=value pair to GITHUB_OUTPUT if available."""
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"{key}={value}\n")
    print(f"  → {key}={value}")


def main():
    latest_version = None
    latest_date_iso = None
    latest_filename = None
    latest_url = None
    changed_latest = False
    all_count = 0

    try:
        # 1. Fetch available versions from NuGet
        reg = fetch_registration_index()
        versions = versions_from_registration(reg)
        stable = list_stable_for_majors(versions, MAJORS)

        if not stable:
            print(f"::notice::No stable Rhino versions for majors: {', '.join(map(str, MAJORS))}.")
            all_count = write_all(MD_ALL, [])
        else:
            # 2. Build URLs for all versions
            all_entries_map = {}  # key: filename, value: url (to dedupe)
            
            # Cache for Mac URLs to avoid re-checking the same version multiple times
            # (though we iterate versions once, so simple dict is fine)
            
            print(f"Found {len(stable)} stable versions. Processing...")

            for v in stable:
                d = decode_version_date(v)
                
                # --- Windows EXE ---
                # Generate for all requested locales
                for locale in LOCALES:
                    u = build_windows_url(v, d, locale)
                    fn = os.path.basename(urlparse(u).path)
                    
                    # Optional: Check if URL exists (usually skipped for 'all' list for performance)
                    if HEAD_CHECK_ALL:
                        if not url_exists(u):
                            print(f"[skip] Windows URL not reachable: {u}")
                            continue
                    
                    all_entries_map[fn] = u
                
                # --- Mac DMG ---
                # Mac doesn't have locales in filename usually.
                # We need to find the correct URL (exact match or +1)
                
                # We only need to check this ONCE per version 'v'
                # But checking every single historical version might be slow if we do HEAD checks.
                # However, for 'all' list, we might want to be sure.
                # If HEAD_CHECK_ALL is false, we might just guess the exact match?
                # BUT, we know Mac versions often differ. Guessing exact match might be wrong.
                # Strategy: For the 'all' list, if HEAD_CHECK_ALL is false, we might skip Mac 
                # OR we accept that we might list broken links if we don't check.
                # Given the +1 ambiguity, we SHOULD probably check at least the top N or check all if feasible.
                # Let's try to check. If it's too slow, we can optimize later.
                # Actually, for the 'all' list, we can just try to find a valid Mac URL.
                
                mac_candidates = build_mac_url_candidates(v)
                valid_mac_url = None

                # Only HEAD-check Mac URLs for the newest N versions (per the loop order)
                # For older versions, use exact-match URL without verification
                version_index = stable.index(v)
                if version_index < MAC_HEAD_LIMIT:
                    for cand_url in mac_candidates:
                        if url_exists(cand_url):
                            valid_mac_url = cand_url
                            break
                else:
                    # For old versions, assume exact match (first candidate)
                    valid_mac_url = mac_candidates[0] if mac_candidates else None

                if valid_mac_url:
                    fn = os.path.basename(urlparse(valid_mac_url).path)
                    all_entries_map[fn] = valid_mac_url

            # 3. Write all entries
            # Sort by version (descending), then by filename (to group locales)
            # Actually, the map keys are filenames.
            # We want to preserve the version order.
            # Reconstruct list based on 'stable' list order
            
            final_entries = []
            for v in stable:
                # Find all files associated with this version (or close to it for Mac)
                # This is a bit tricky since Mac version might be +1.
                # Let's just iterate the map and sort.
                pass
            
            # Simpler: just sort the map items. 
            # Filenames start with rhino_...
            # We want newest versions first.
            # Filenames contain version numbers, but sorting by string might be slightly off if padding differs (but we padded).
            # Let's sort by the version found in the filename.
            
            def sort_key(item):
                fn = item[0]
                # Extract version from filename to sort correctly
                # rhino_en-us_8.25.25328.11001.exe
                # rhino_8.25.25328.11002.dmg
                try:
                    # Remove extension
                    base = fn.rsplit('.', 1)[0]
                    parts = base.split('_')
                    ver_part = parts[-1] # 8.25.25328.11001
                    return parse_version_tuple(ver_part)
                except:
                    return (0,0,0,0)

            all_entries = sorted(all_entries_map.items(), key=sort_key, reverse=True)
            all_count = write_all(MD_ALL, all_entries)
            print(f"Wrote {all_count} entries to {MD_ALL}")

            # 4. Update Latest File (en-us only, both platforms)
            # We take the absolute latest version from 'stable'
            if stable:
                v_latest = stable[0]
                d_latest = decode_version_date(v_latest)
                
                # Windows Latest
                u_win = build_windows_url(v_latest, d_latest, "en-us")
                fn_win = os.path.basename(urlparse(u_win).path)
                
                if (not HEAD_CHECK_LATEST) or url_exists(u_win):
                    if prepend_latest(MD_LATEST, fn_win, u_win):
                        changed_latest = True
                    
                    # Set outputs for GitHub Actions (using Windows info)
                    latest_filename = fn_win
                    latest_url = u_win
                    latest_version = v_latest
                    latest_date_iso = d_latest.isoformat()
                else:
                    print(f"::warning::Latest Windows URL not reachable: {u_win}")

                # Mac Latest
                # We need to find the Mac version corresponding to this Windows version
                mac_candidates = build_mac_url_candidates(v_latest)
                valid_mac_url = None
                for cand_url in mac_candidates:
                    if url_exists(cand_url):
                        valid_mac_url = cand_url
                        break
                
                if valid_mac_url:
                    fn_mac = os.path.basename(urlparse(valid_mac_url).path)
                    if prepend_latest(MD_LATEST, fn_mac, valid_mac_url):
                        changed_latest = True
                else:
                    print(f"::warning::Could not find valid Mac URL for latest version {v_latest}")

    except Exception as e:
        print(f"::error::Failed: {e}")
        sys.exit(1)

    # 5. Summary & Outputs
    if latest_version:
        print(f"Latest version: {latest_version}")
        print(f"Build date:     {latest_date_iso}")
        print(f"Filename:       {latest_filename}")
        print(f"URL:            {latest_url}")
    print(f"All versions written: {all_count}")

    # GitHub Actions Output
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            if latest_version:  fh.write(f"version={latest_version}\n")
            if latest_date_iso: fh.write(f"date={latest_date_iso}\n")
            if latest_filename: fh.write(f"filename={latest_filename}\n")
            if latest_url:      fh.write(f"url={latest_url}\n")
            fh.write(f"all_count={all_count}\n")
            fh.write(f"changed={'true' if changed_latest else 'false'}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch Rhino versions from NuGet")
    parser.add_argument("--check-only", action="store_true",
                        help="Only check if new versions exist, don't rebuild files")
    args = parser.parse_args()

    if args.check_only:
        check_only()
    else:
        main()
