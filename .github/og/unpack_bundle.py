#!/usr/bin/env python3
"""Unpack _bundle/ (a base64'd tar.xz split into text parts) into the repo, then delete _bundle/.
Text-only transport for files pushed through tools that can't send large/binary content.
Verifies the SHA-256 in _bundle/SHA256 and only allows paths under hvac-demo/."""
import base64, glob, hashlib, io, lzma, os, shutil, sys, tarfile
parts = sorted(glob.glob("_bundle/part*.txt"))
if not parts:
    print("no bundle"); sys.exit(0)
b64 = "".join("".join(open(p).read().split()) for p in parts)
raw = base64.b64decode(b64, validate=True)
want = open("_bundle/SHA256").read().split()[0]
got = hashlib.sha256(raw).hexdigest()
if got != want:
    for p in parts: print(p, hashlib.sha256("".join(open(p).read().split()).encode()).hexdigest())
    sys.exit(f"bundle checksum mismatch: {got} != {want}")
with tarfile.open(fileobj=io.BytesIO(lzma.decompress(raw))) as tf:
    for m in tf.getmembers():
        n = os.path.normpath(m.name)
        if not m.isfile() or not n.startswith("hvac-demo/") or ".." in n.split(os.sep):
            sys.exit(f"refusing bundle member {m.name!r}")
    for m in tf.getmembers():
        os.makedirs(os.path.dirname(m.name), exist_ok=True)
        with open(m.name, "wb") as fh: fh.write(tf.extractfile(m).read())
        print("unpacked", m.name, m.size)
shutil.rmtree("_bundle")
