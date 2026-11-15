#!/usr/bin/env python3
"""Unpack _shop_bundle/ (base64'd tar.xz) into shop/img/, then delete the bundle.
Text-only transport for JPEG thumbnails that cannot be sent as binary through the API."""
import base64, glob, hashlib, io, lzma, os, shutil, sys, tarfile

parts = sorted(glob.glob("_shop_bundle/part*.txt"))
if not parts:
    print("no shop bundle")
    sys.exit(0)
b64 = "".join("".join(open(p).read().split()) for p in parts)
raw = base64.b64decode(b64, validate=True)
want = open("_shop_bundle/SHA256").read().split()[0]
got = hashlib.sha256(raw).hexdigest()
if got != want:
    sys.exit(f"shop bundle checksum mismatch: {got} != {want}")
with tarfile.open(fileobj=io.BytesIO(lzma.decompress(raw))) as tf:
    for m in tf.getmembers():
        n = os.path.normpath(m.name)
        if (
            not m.isfile()
            or not n.startswith("shop/img/")
            or ".." in n.split(os.sep)
            or not n.lower().endswith(".jpg")
        ):
            sys.exit(f"refusing bundle member {m.name!r}")
    for m in tf.getmembers():
        if not m.isfile():
            continue
        os.makedirs(os.path.dirname(m.name) or ".", exist_ok=True)
        with open(m.name, "wb") as fh:
            fh.write(tf.extractfile(m).read())
        print("unpacked", m.name, m.size)
shutil.rmtree("_shop_bundle")
