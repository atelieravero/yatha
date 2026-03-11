import { pgTable, text, timestamp, boolean, jsonb, integer, uuid, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// SYSTEM CONSTANTS
// ============================================================================
export const SYSTEM_PREDICATES = {
  CARRIES: '00000000-0000-4000-8000-000000000001',
  CONTAINS: '00000000-0000-4000-8000-000000000003',
  // LINEAGE and REFERENCES have been successfully purged!
};

// ============================================================================
// 1. KINDS (The Strict Flat Ontology for Identities)
// ============================================================================
export const kinds = pgTable('kinds', {
  id: uuid('id').defaultRandom().primaryKey(), 
  label: text('label').notNull(),
  icon: text('icon').default('🟣').notNull(), 
  isActive: boolean('is_active').default(true).notNull(),
});

// ============================================================================
// 1.5 PREDICATES (Semantic Connections)
// ============================================================================
export const predicates = pgTable('predicates', {
  id: uuid('id').defaultRandom().primaryKey(),
  forwardLabel: text('forward_label').notNull(),
  reverseLabel: text('reverse_label').notNull(),
  isSymmetric: boolean('is_symmetric').default(false).notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  
  // --- NEW: STRICT GRAPH PHYSICS CONFIGURATION ---
  // Arrays of allowed layers ('IDENTITY', 'PHYSICAL', 'MEDIA'). If null/empty, all are allowed.
  sourceLayers: text('source_layers').array(), 
  targetLayers: text('target_layers').array(),
  
  // Stores the kinds.id to pre-select when minting a new node via this predicate
  sourceDefaultKind: text('source_default_kind'), 
  targetDefaultKind: text('target_default_kind'),
});

// ============================================================================
// 2. NODES (The 3-Layer Framework)
// ============================================================================
export const nodes = pgTable('nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  
  // THE NEW 3-LAYER PHYSICS
  layer: text('layer').notNull(), // 'IDENTITY' | 'PHYSICAL' | 'MEDIA'
  
  // KIND IS NOW NULLABLE! Only Identity nodes require a strict taxonomy Kind.
  kind: text('kind'), 
  
  label: text('label').notNull(),
  aliases: text('aliases').array().notNull().default([]), 
  
  temporalInput: text('temporal_input'), 
  notEarlierThan: timestamp('not_earlier_than'), 
  notLaterThan: timestamp('not_later_than'),
  
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
  category: text('category').notNull(), // 'SEMANTIC' | 'STRUCTURAL' | 'CONTAINMENT'
  
  // Spatial/Contextual property replacing 'role' and 'REFERENCES'
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
  return {
    noSelfRef: check('no_self_ref', sql`${table.sourceId} != ${table.targetId}`)
  };
});

// ============================================================================
// 4. EVENT LOG / SNAPSHOTS
// ============================================================================
export const nodeHistory = pgTable('node_history', {
  snapshotId: uuid('snapshot_id').defaultRandom().primaryKey(),
  nodeId: uuid('node_id').notNull(),
  
  previousKind: text('previous_kind'), // Nullable
  previousLabel: text('previous_label').notNull(),
  previousAliases: text('previous_aliases').array().notNull().default([]),
  previousTemporalInput: text('previous_temporal_input'),
  previousProperties: jsonb('previous_properties').notNull().default({}),
  
  replacedBy: text('replaced_by').notNull(),
  replacedAt: timestamp('replaced_at').defaultNow().notNull(),
});