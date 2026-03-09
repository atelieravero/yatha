import { pgTable, text, timestamp, boolean, jsonb, integer, uuid, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// SYSTEM CONSTANTS (Well-Known UUIDs)
// These ensure our React Code and Database always perfectly align on core rules.
// ============================================================================
export const SYSTEM_PREDICATES = {
  CARRIES: '00000000-0000-4000-8000-000000000001',
  DERIVED_FROM: '00000000-0000-4000-8000-000000000002',
  CONTAINS: '00000000-0000-4000-8000-000000000003',
  // REFERENCES has been intentionally removed. 
  // Locators (pages, coordinates, timestamps) are now handled via the JSONB properties column on standard semantic edges!
};

// ============================================================================
// 1. KINDS (The Strict Flat Ontology)
// ============================================================================
export const kinds = pgTable('kinds', {
  id: uuid('id').defaultRandom().primaryKey(), 
  label: text('label').notNull(),
  icon: text('icon').default('🟣').notNull(), 
  isActive: boolean('is_active').default(true).notNull(),
});

// ============================================================================
// 1.5 PREDICATES (Semantic & System Connections)
// ============================================================================
export const predicates = pgTable('predicates', {
  id: uuid('id').defaultRandom().primaryKey(),
  forwardLabel: text('forward_label').notNull(),
  reverseLabel: text('reverse_label').notNull(),
  isSymmetric: boolean('is_symmetric').default(false).notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

// ============================================================================
// 2. NODES (Layer 1 Identities & Layer 2 Instances)
// ============================================================================
export const nodes = pgTable('nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  layer: text('layer').notNull(), // 'IDENTITY' | 'INSTANCE'
  kind: text('kind').notNull(), // References kinds.id conceptually
  
  label: text('label').notNull(),
  
  aliases: text('aliases').array().notNull().default([]), 
  
  // Fuzzy Temporal Bounds
  temporalInput: text('temporal_input'), 
  notEarlierThan: timestamp('not_earlier_than'), 
  notLaterThan: timestamp('not_later_than'),
  
  // Multilingual properties & arbitrary data go here
  properties: jsonb('properties').notNull().default({}),
  
  isActive: boolean('is_active').default(true).notNull(),
  updatedBy: text('updated_by').notNull().default('system'), 
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// 3. EDGES (The Relationships)
// ============================================================================
export const edges = pgTable('edges', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull(),
  targetId: uuid('target_id').notNull(),
  
  predicateId: uuid('predicate_id').notNull(), 
  
  category: text('category').notNull(), 
  role: text('role'), 
  
  // Edge Properties for Positional Data (coordinates, timestamps, pages)
  properties: jsonb('properties').notNull().default({}),
  
  sourceSortOrder: integer('source_sort_order').default(999).notNull(),
  targetSortOrder: integer('target_sort_order').default(999).notNull(),
  
  temporalInput: text('temporal_input'), 
  notEarlierThan: timestamp('not_earlier_than'),
  notLaterThan: timestamp('not_later_than'),
  
  isActive: boolean('is_active').default(true).notNull(),
  assertedBy: text('asserted_by').notNull(),
  assertedAt: timestamp('asserted_at').defaultNow().notNull(),
  retractedAt: timestamp('retracted_at'), 
}, (table) => {
  // RULE 6: No self-references allowed in the database!
  return {
    noSelfRef: check('no_self_ref', sql`${table.sourceId} != ${table.targetId}`)
  };
});

// ============================================================================
// 4. EVENT LOG / SNAPSHOTS (The Safety Net)
// ============================================================================
export const nodeHistory = pgTable('node_history', {
  snapshotId: uuid('snapshot_id').defaultRandom().primaryKey(),
  nodeId: uuid('node_id').notNull(),
  
  previousKind: text('previous_kind').notNull(),
  previousLabel: text('previous_label').notNull(),
  previousAliases: text('previous_aliases').array().notNull().default([]),
  previousTemporalInput: text('previous_temporal_input'),
  previousProperties: jsonb('previous_properties').notNull().default({}),
  
  replacedBy: text('replaced_by').notNull(),
  replacedAt: timestamp('replaced_at').defaultNow().notNull(),
});