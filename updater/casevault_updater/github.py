"""Read-only access to the public CaseVault repository on GitHub. No login, no token.

Only two hosts are ever contacted: api.github.com (the latest commit, and later the file list)
and raw.githubusercontent.com (file contents). Unauthenticated API calls are limited to 60 an
hour per network; a check uses one or two.

The transport (the function that actually does HTTP) can be replaced, so the tests run offline.
"""

import json
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

from . import __version__
from .errors import BadResponse, NoInternet, NotFound, RateLimited, ServerError

API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"

# (url, headers, timeout) -> (status, response headers, body)
Transport = Callable[[str, Dict[str, str], float], Tuple[int, Dict[str, str], bytes]]


def urllib_transport(url: str, headers: Dict[str, str], timeout: float) -> Tuple[int, Dict[str, str], bytes]:
    """HTTP with the standard library. Uses the PC's proxy settings and, on Windows, its
    certificate store (so a department's inspecting proxy keeps working)."""
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, e.read() or b""
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
        reason = getattr(e, "reason", e)
        raise NoInternet(str(reason)[:120]) from e


@dataclass(frozen=True)
class Commit:
    sha: str
    date: str       # ISO 8601, e.g. 2026-09-30T13:52:00Z
    message: str    # first line only

    @property
    def short(self) -> str:
        return self.sha[:7]


@dataclass(frozen=True)
class TreeEntry:
    path: str   # e.g. "js/vault.js" (always "/" separators)
    sha: str    # the Git blob id: sha1(b"blob <size>\\0" + contents)
    size: int
    mode: str = "100644"


class GitHub:
    def __init__(self, owner: str, repo: str, transport: Optional[Transport] = None, timeout: float = 20.0):
        self.owner, self.repo = owner, repo
        self.transport = transport or urllib_transport
        self.timeout = timeout

    def _get(self, url: str, what: str, accept: str = "application/vnd.github+json") -> bytes:
        headers = {"Accept": accept, "User-Agent": f"CaseVault-Updater/{__version__}", "X-GitHub-Api-Version": "2022-11-28"}
        status, hdrs, body = self.transport(url, headers, self.timeout)
        if status == 200:
            return body
        if status in (403, 429) and (hdrs.get("x-ratelimit-remaining") == "0" or status == 429):
            try:
                reset = int(hdrs.get("x-ratelimit-reset", "0"))
            except ValueError:
                reset = 0
            raise RateLimited(reset)
        if status == 404:
            raise NotFound(what)
        if status >= 500:
            raise ServerError(status)
        raise BadResponse(f"HTTP {status} for {what}")

    def _json(self, url: str, what: str):
        body = self._get(url, what)
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as e:
            raise BadResponse(f"unreadable reply for {what}") from e

    def latest_commit(self, branch: str) -> Commit:
        """The newest commit on a branch."""
        data = self._json(f"{API}/repos/{self.owner}/{self.repo}/commits/{branch}", f"branch '{branch}' of {self.owner}/{self.repo}")
        try:
            sha = data["sha"]
            info = data["commit"]
            date = (info.get("committer") or info.get("author") or {}).get("date", "")
            message = (info.get("message") or "").splitlines()[0] if info.get("message") else ""
        except (KeyError, TypeError, AttributeError) as e:
            raise BadResponse("no commit in the reply") from e
        if not isinstance(sha, str) or len(sha) != 40:
            raise BadResponse("a malformed commit id")
        return Commit(sha=sha, date=date, message=message)

    def tree(self, sha: str) -> List["TreeEntry"]:
        """Every file in the repository at a commit: path, Git blob id and size (one request)."""
        data = self._json(f"{API}/repos/{self.owner}/{self.repo}/git/trees/{sha}?recursive=1", f"the file list at {sha[:7]}")
        if not isinstance(data, dict) or not isinstance(data.get("tree"), list):
            raise BadResponse("no file list in the reply")
        if data.get("truncated"):
            raise BadResponse("the file list was cut short by GitHub")
        out = []
        for e in data["tree"]:
            if not isinstance(e, dict) or e.get("type") != "blob":
                continue  # folders and submodules
            path, blob, size = e.get("path"), e.get("sha"), e.get("size")
            if not isinstance(path, str) or not isinstance(blob, str) or len(blob) != 40 or not isinstance(size, int):
                raise BadResponse("a malformed entry in the file list")
            out.append(TreeEntry(path, blob, size, e.get("mode", "100644")))
        return out

    def raw_file(self, sha: str, path: str) -> bytes:
        """One file's contents at a commit."""
        return self._get(f"{RAW}/{self.owner}/{self.repo}/{sha}/{path}", f"{path} at {sha[:7]}", accept="*/*")
