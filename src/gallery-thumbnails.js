const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');

const run = promisify(execFile);
const FORMATS = [
  'mov', 'matroska', 'webm', 'avi', 'flv', 'mpeg', 'mpegts', 'asf', 'ogg',
  'jpeg_pipe', 'png_pipe', 'webp_pipe', 'gif', 'bmp_pipe', 'tiff_pipe', 'heif', 'avif'
].join(',');

function createGalleryThumbnails(uploadDir, { ffmpeg = 'ffmpeg', maxPending = 24, timeout = 8000 } = {}) {
  const root = path.resolve(uploadDir);
  const pending = new Map();
  const failedUntil = new Map();
  let tail = Promise.resolve();

  function sourcePath(relativePath) {
    if (!relativePath) return null;
    const absolute = path.resolve(root, relativePath);
    const directory = path.dirname(absolute);
    return ['library', 'raw-footage'].some(name => directory === path.join(root, name)) ? absolute : null;
  }

  async function generate(source, target) {
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      if (!(await fs.stat(source)).isFile()) return null;
      await run(ffmpeg, [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-filter_threads', '1',
        '-threads', '1', '-max_pixels', '40000000',
        '-protocol_whitelist', 'file,pipe', '-format_whitelist', FORMATS, '-i', source,
        '-map', '0:v:0', '-frames:v', '1', '-an', '-sn',
        '-vf', "scale=w='min(384,iw)':h='min(384,ih)':force_original_aspect_ratio=decrease,setsar=1",
        '-c:v', 'libwebp', '-quality', '70', '-threads', '1', '-f', 'webp', temporary
      ], { timeout, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 });
      const output = await fs.stat(temporary);
      if (!output.size || output.size > 192 * 1024) throw new Error('Invalid thumbnail size');
      await fs.rename(temporary, target);
      return target;
    } catch {
      failedUntil.set(source, Date.now() + 10 * 60_000);
      if (failedUntil.size > 512) failedUntil.delete(failedUntil.keys().next().value);
      return null;
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async function get(relativePath) {
    const source = sourcePath(relativePath);
    if (!source) return null;
    const target = `${source}.thumb-v1.webp`;
    if (await fs.stat(target).then(value => value.isFile(), () => false)) return target;
    if (pending.has(source)) return pending.get(source);
    if ((failedUntil.get(source) || 0) > Date.now() || pending.size >= maxPending) return null;
    failedUntil.delete(source);
    const task = tail.then(() => generate(source, target)).finally(() => pending.delete(source));
    pending.set(source, task);
    tail = task.catch(() => {});
    return task;
  }

  async function remove(relativePath) {
    const source = sourcePath(relativePath);
    if (!source) return;
    await pending.get(source);
    failedUntil.delete(source);
    await fs.rm(`${source}.thumb-v1.webp`, { force: true });
  }

  return { get, remove };
}

module.exports = { createGalleryThumbnails };
