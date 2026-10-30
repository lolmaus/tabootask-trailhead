#!/usr/bin/env node
'use strict';
// Repository-owned adaptation of the existing Trailhead commit-msg checker.
// Lefthook calls this once; the former wrapper/checker remain in .git/hooks
// as migration backups. Keep ticket checks available in fresh clones too.
// Unexpected startup/read failures retain Trailhead's fail-open behavior;
// rule violations exit 3, which Lefthook treats as failure.

const fs = require('fs');
const path = require('path');

const VIOLATION = 3; // codice dedicato, mappato a 1 dal wrapper sh
const TYPES = 'feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert';
const CONVENTIONAL = new RegExp(`^(${TYPES})(\\([^)]+\\))?!?:\\s.+`);
const CO_AUTHORED = /co-authored-by\s*:/i;
const SCISSORS = '# ------------------------ >8';
const REFS_LINE = /^\s*refs\s*:(.*)$/i;

/** @param {unknown} raw */
function messageRegion(raw) {
  const text = String(raw == null ? '' : raw);
  const i = text.indexOf(SCISSORS);
  return i === -1 ? text : text.slice(0, i);
}
/** @param {unknown} raw */
function subjectOf(raw) {
  for (const line of messageRegion(raw).split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    return line.trim();
  }
  return '';
}

// Mirrors parseSessionTicket() in commit-message-check.js: parses the first
// line of a .trailhead/session-ticket marker (`#<n> <title>`).
/** @param {unknown} text */
function parseSessionTicket(text) {
  const raw = String(text == null ? '' : text).replace(/^﻿/, '');
  const firstLine = (raw.split('\n')[0] ?? '').replace(/\r$/, '');
  const m = firstLine.match(/^#([1-9]\d*)(?:\s|$)/);
  return m ? Number(m[1]) : null;
}

// Mirrors hasRefsFor() in commit-message-check.js.
/** @param {unknown} message @param {number} n */
function hasRefsFor(message, n) {
  const target = new RegExp('#' + n + '(?![\\w])');
  for (const line of messageRegion(message).split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(REFS_LINE);
    if (m && target.test(m[1] ?? '')) return true;
  }
  return false;
}

// Reads the session-ticket marker at the worktree top-level. git runs
// commit-msg from the worktree top-level (linked worktrees included), so
// process.cwd() is the right root here. Its own try/catch: a read error
// (marker absent, unreadable, etc.) must never skip the other rules below,
// it just leaves the Refs rule off.
function readTicket() {
  try {
    const markerPath = path.join(process.cwd(), '.trailhead', 'session-ticket');
    return parseSessionTicket(fs.readFileSync(markerPath, 'utf8'));
  } catch {
    return null;
  }
}

try {
  const file = process.argv[2];
  const raw = file ? fs.readFileSync(file, 'utf8') : '';
  const region = messageRegion(raw);

  if (CO_AUTHORED.test(region)) {
    process.stderr.write(
      'trailhead: do not add a Co-Authored-By trailer to commits. Remove it and commit again.\n'
    );
    process.exit(VIOLATION);
  }
  const subject = subjectOf(raw);
  if (subject && !CONVENTIONAL.test(subject)) {
    process.stderr.write(
      `trailhead: commit subject must be Conventional Commits: <type>(<scope>)?: <subject>. Valid types: ${TYPES.replace(/\|/g, ', ')}.\n`
    );
    process.exit(VIOLATION);
  }
  if (subject.length > 72) {
    process.stderr.write('trailhead: commit subject must be 72 characters or less.\n');
    process.exit(VIOLATION);
  }

  const ticket = readTicket();
  if (ticket !== null && Number.isInteger(ticket) && ticket > 0 && !hasRefsFor(raw, ticket)) {
    process.stderr.write(
      `trailhead: this commit is on ticket #${ticket} (per .trailhead/session-ticket) but has no "Refs: #${ticket}" trailer. Add "Refs: #${ticket}" as the last line of the message and commit again. If this commit is not part of ticket #${ticket}, remove the stale .trailhead/session-ticket marker first.\n`
    );
    process.exit(VIOLATION);
  }
} catch {
  process.exit(0); // never wedge a commit on an unexpected error
}
process.exit(0);
