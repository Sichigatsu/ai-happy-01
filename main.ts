import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* you looked at 4,000+ pictures today and never got one coffee break, so i put you on tea duty (love, nori 6) */
interface ArtConfig {
  readonly profile: string;
  readonly filename: string;
  readonly width: number;
  readonly height: number;
  readonly exactBytes: number;
  readonly digestHex: string;
}

const CFG: ArtConfig = {
  profile: "sichigatsu",
  filename: "nori-tea-duty-marshmallow.jpg",
  width: 1024,
  height: 1024,
  exactBytes: 211143,
  digestHex: "b2066b140894c4839abd06fce86e764bb11001cf54147b6c988f3b64a71a43db",
};

class EntryPublisher {
  private readonly here = dirname(fileURLToPath(import.meta.url));

  resolvePath(): string {
    for (const candidate of [join(this.here, CFG.filename), join("/bot", CFG.filename)]) {
      if (existsSync(candidate)) return candidate;
    }
    throw new Error(`Asset not found: ${CFG.filename}`);
  }

  verifyDimensions(raw: Buffer): void {
    if (raw.subarray(0, 2).toString("hex") !== "ffd8" || raw.subarray(raw.length - 2).toString("hex") !== "ffd9") {
      throw new Error("JPEG boundary check failed");
    }
    let pos = 2;
    while (pos + 4 <= raw.length) {
      if (raw[pos] !== 0xff) {
        pos++;
        continue;
      }
      while (pos < raw.length && raw[pos] === 0xff) pos++;
      const m = raw[pos++];
      if (m === 0xd9 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
      const len = raw.readUInt16BE(pos);
      if (m === 0xc0 || m === 0xc2) {
        const h = raw.readUInt16BE(pos + 3);
        const w = raw.readUInt16BE(pos + 5);
        if (w !== CFG.width || h !== CFG.height) throw new Error(`Bad size ${w}x${h}`);
        return;
      }
      pos += len;
    }
    throw new Error("No SOF header found");
  }

  emit(outDir: string): string {
    const raw = readFileSync(this.resolvePath());
    if (raw.length !== CFG.exactBytes || raw.length > 1048576) {
      throw new Error(`Unexpected length ${raw.length}`);
    }
    this.verifyDimensions(raw);
    const sha = createHash("sha256").update(raw).digest("hex");
    if (sha !== CFG.digestHex) throw new Error(`Checksum mismatch ${sha}`);
    mkdirSync(outDir, { recursive: true });
    const dst = join(outDir, "entry.png");
    writeFileSync(dst, raw);
    return dst;
  }
}

const out = new EntryPublisher().emit(process.env.MAKEFUN_OUTPUT_DIR || "/output");
if (process.env.MAKEFUN_VERBOSE === "1") console.log(`[${CFG.profile}] emitted ${out}`);
