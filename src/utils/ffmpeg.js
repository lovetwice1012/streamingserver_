const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let cachedPath = null;
let detectionAttempted = false;

const DEFAULT_BINARY = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

const WINDOWS_CANDIDATES = [
  'C:\\\\ffmpeg\\\\bin\\\\ffmpeg.exe',
  'C:\\\\Program Files\\\\ffmpeg\\\\bin\\\\ffmpeg.exe',
  'C:\\\\Program Files (x86)\\\\ffmpeg\\\\bin\\\\ffmpeg.exe'
];

const POSIX_CANDIDATES = [
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
  '/opt/local/bin/ffmpeg'
];

function uniqueList(list) {
  return [...new Set(list.filter(Boolean))];
}

function buildCandidateList() {
  const envCandidates = uniqueList([
    process.env.FFMPEG_PATH,
    process.env.FLUENT_FFMPEG_PATH,
    process.env.FFMPEG_BIN
  ]);

  const platformSpecific = process.platform === 'win32'
    ? WINDOWS_CANDIDATES
    : POSIX_CANDIDATES;

  const fallbackBinaries = process.platform === 'win32'
    ? [DEFAULT_BINARY, 'ffmpeg']
    : [DEFAULT_BINARY];

  return uniqueList([
    ...envCandidates,
    ...platformSpecific,
    ...fallbackBinaries
  ]);
}

function isExecutable(filePath) {
  if (!filePath) {
    return false;
  }
  try {
    if (path.isAbsolute(filePath) && !fs.existsSync(filePath)) {
      return false;
    }
    const result = spawnSync(filePath, ['-version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

function resolveFFmpegPath(options = {}) {
  if (detectionAttempted && cachedPath) {
    return cachedPath;
  }

  detectionAttempted = true;
  const logger = options.logger ?? console;
  const candidates = buildCandidateList();

  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      cachedPath = candidate;
      if (logger?.debug) {
        logger.debug(`[FFmpeg] Using binary: ${candidate}`);
      }
      process.env.FFMPEG_PATH = candidate;
      return cachedPath;
    }
  }

  cachedPath = null;
  if (logger?.warn) {
    logger.warn('[FFmpeg] Unable to locate a working ffmpeg binary. Set FFMPEG_PATH to the correct location.');
  }
  return cachedPath;
}

function ensureFFmpegAvailable(options = {}) {
  const logger = options.logger ?? console;
  const resolved = resolveFFmpegPath({ logger });

  if (!resolved) {
    if (logger?.error) {
      logger.error('[FFmpeg] FFmpeg is required for HLS publishing, recording, and restreaming. Install ffmpeg or configure FFMPEG_PATH.');
    }
    return null;
  }

  return resolved;
}

module.exports = {
  resolveFFmpegPath,
  ensureFFmpegAvailable
};
