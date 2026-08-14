import os
import zlib
import bz2
import lzma

pb_file = 'C:\\Users\\Martin\\.gemini\\antigravity\\conversations\\75359575-8833-4fd3-b737-8ea72a0571ec.pb'

def try_decompress():
    if not os.path.exists(pb_file):
        print("File not found")
        return

    with open(pb_file, 'rb') as f:
        data = f.read()

    print("Data size:", len(data))

    # Try BZ2
    try:
        dec = bz2.decompress(data)
        print("BZ2 success! Size:", len(dec))
        return
    except Exception as e:
        print("BZ2 failed:", e)

    # Try LZMA
    try:
        dec = lzma.decompress(data)
        print("LZMA success! Size:", len(dec))
        return
    except Exception as e:
        print("LZMA failed:", e)

    # Try zstd if available
    try:
        import zstd
        dec = zstd.decompress(data)
        print("zstd (zstd module) success! Size:", len(dec))
        return
    except Exception as e:
        print("zstd (zstd module) failed:", e)

    try:
        import zstandard as zstd
        dctx = zstd.ZstdDecompressor()
        dec = dctx.decompress(data)
        print("zstd (zstandard module) success! Size:", len(dec))
        return
    except Exception as e:
        print("zstd (zstandard module) failed:", e)

try_decompress()
