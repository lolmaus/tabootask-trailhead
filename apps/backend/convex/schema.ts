import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
export default defineSchema({
  authProbeNotes: defineTable({
    key: v.string(),
    owner: v.string(),
    source: v.string(),
    revision: v.number(),
    history: v.array(v.string()),
  }).index('by_key', ['key']),
  notes: defineTable({
    key: v.string(),
    source: v.string(),
    version: v.number(),
    epoch: v.number(),
    floor: v.number(),
    ownerToken: v.string(),
    editorTokens: v.array(v.string()),
    mode: v.union(v.literal('ot'), v.literal('manual')),
    history: v.array(
      v.object({ source: v.string(), version: v.number(), epoch: v.number(), reason: v.string() })
    ),
  }).index('by_key', ['key']),
  ops: defineTable({
    note: v.id('notes'),
    version: v.number(),
    clientID: v.string(),
    changes: v.any(),
  }).index('by_note_version', ['note', 'version']),
});
