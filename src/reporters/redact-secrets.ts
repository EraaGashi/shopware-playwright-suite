import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import type { Reporter } from '@playwright/test/reporter';

/**
 * Removes secrets from everything a run leaves on disk: HTML report (incl. its embedded data), traces,
 * error-context files, JUnit XML. Playwright writes request headers (the bot-protection bypass header) and
 * typed form values (passwords) in clear text into call logs and traces — it has no redaction of its own.
 *
 * Runs as the LAST reporter: by then the HTML / JUnit reporters have written their files.
 * Also usable on its own for existing folders: `npx tsx src/reporters/redact-secrets.ts`.
 * The console output of the run itself is not covered (Bitbucket masks "Secured" variables there).
 */

/** Env variables whose values must never appear in artifacts. */
const SECRET_VARS = ['E2E_HEADER_VALUE', 'HTTP_PASSWORD', 'ADMIN_CLIENT_SECRET', 'ADMIN_PASSWORD', 'TEST_CUSTOMER_PASSWORD', 'SW_ACCESS_KEY'];
const MASK = '[REDACTED]';
const DIRS = ['playwright-report', 'test-results'];
const TEXT = /\.(html|json|md|xml|txt|log|trace|network|stacks|har|js|css)$/i;

function secrets(): string[] {
  const values = SECRET_VARS.map((k) => process.env[k]?.trim() ?? '');
  // basic auth also travels base64-encoded ("Authorization: Basic …")
  const { HTTP_USERNAME: user, HTTP_PASSWORD: pass } = process.env;
  if (user && pass) values.push(Buffer.from(`${user.trim()}:${pass.trim()}`).toString('base64'));
  // short values ("1234") would mangle unrelated text — real secrets are longer
  return [...new Set(values.filter((v) => v.length >= 6))];
}

/** Replaces every secret in a buffer; returns null when nothing was found. */
function scrub(buf: Buffer, values: string[]): Buffer | null {
  if (!values.some((v) => buf.includes(v))) return null;
  let s = buf.toString('latin1'); // byte-preserving for any content
  for (const v of values) s = s.split(v).join(MASK);
  return Buffer.from(s, 'latin1');
}

/** Rewrites a zip archive with scrubbed entries (traces, the HTML report's data). Null = unchanged / unsupported. */
function scrubZip(zip: Buffer, values: string[]): Buffer | null {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) return null; // zip64 — not produced by Playwright for normal runs
  type Entry = { name: Buffer; flags: number; method: number; time: number; date: number; attrs: number; data: Buffer };
  const entries: Entry[] = [];
  let changed = false;
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const time = zip.readUInt16LE(p + 12);
    const date = zip.readUInt16LE(p + 14);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const attrs = zip.readUInt32LE(p + 38);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else return null;
    const clean = scrub(data, values);
    if (clean) changed = true;
    entries.push({ name, flags: flags & ~0x0008, method: 8, time, date, attrs, data: clean ?? data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!changed) return null;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const comp = zlib.deflateRawSync(e.data);
    const crc = zlib.crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.flags, 6); lh.writeUInt16LE(e.method, 8);
    lh.writeUInt16LE(e.time, 10); lh.writeUInt16LE(e.date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(e.name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.flags, 8); ch.writeUInt16LE(e.method, 10);
    ch.writeUInt16LE(e.time, 12); ch.writeUInt16LE(e.date, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(e.data.length, 24); ch.writeUInt16LE(e.name.length, 28); ch.writeUInt32LE(e.attrs, 38); ch.writeUInt32LE(offset, 42);
    locals.push(lh, e.name, comp);
    centrals.push(ch, e.name);
    offset += 30 + e.name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** The HTML report keeps its data as a base64 zip inside index.html. */
function scrubHtmlReport(html: Buffer, values: string[]): Buffer | null {
  const s = html.toString('utf8');
  const re = /(<template id="playwrightReportBase64">data:application\/zip;base64,)([^<]+)(<\/template>)/;
  const m = s.match(re);
  let out = s;
  let changed = false;
  if (m) {
    const zip = scrubZip(Buffer.from(m[2], 'base64'), values);
    if (zip) { out = out.replace(re, (_a, pre, _b64, post) => pre + zip.toString('base64') + post); changed = true; }
  }
  const plain = scrub(Buffer.from(out, 'utf8'), values);
  if (plain) return plain;
  return changed ? Buffer.from(out, 'utf8') : null;
}

export function redactArtifacts(root = process.cwd(), dirs = DIRS): { scanned: number; redacted: string[] } {
  const values = secrets();
  const result = { scanned: 0, redacted: [] as string[] };
  if (!values.length) return result;
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      const stat = fs.lstatSync(file);
      if (stat.isDirectory()) { walk(file); continue; }
      if (!stat.isFile()) continue;
      result.scanned++;
      const buf = fs.readFileSync(file);
      let clean: Buffer | null = null;
      try {
        if (name === 'index.html') clean = scrubHtmlReport(buf, values);
        else if (name.endsWith('.zip')) clean = scrubZip(buf, values) ?? scrub(buf, values);
        else if (TEXT.test(name)) clean = scrub(buf, values);
      } catch (e) {
        console.warn(`[redact-secrets] could not process ${file}: ${(e as Error).message}`);
      }
      if (clean) { fs.writeFileSync(file, clean); result.redacted.push(path.relative(root, file)); }
    }
  };
  for (const d of dirs) walk(path.resolve(root, d));
  return result;
}

export default class RedactSecretsReporter implements Reporter {
  printsToStdio(): boolean {
    return false;
  }
  async onEnd(): Promise<void> {
    const { redacted } = redactArtifacts();
    if (redacted.length) console.log(`[redact-secrets] removed secrets from ${redacted.length} report/trace file(s)`);
  }
}

// standalone: npx tsx src/reporters/redact-secrets.ts [dir …]
if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
  const dirs = process.argv.slice(2);
  const { scanned, redacted } = redactArtifacts(process.cwd(), dirs.length ? dirs : DIRS);
  console.log(`[redact-secrets] scanned ${scanned} file(s), redacted ${redacted.length}`);
}
