"use client";

import { useState } from "react";
import UniversalBuilder from "./UniversalBuilder";
import EdgeRow from "./EdgeRow";

interface CollapsibleEdgeBlockProps {
  title: string;
  icon?: string;
  items: any[]; // Expects array of { edge, node, isSource }
  builderConfig?: any; // The config object for the UniversalBuilder
  defaultOpen?: boolean;
  
  // Context required by EdgeRow
  currentTab: string;
  activeNodeId: string;
  activeKinds: any[];
  allPredicates?: any[]; // Optional: Dictionary of predicates for lookup
  fixedPredDef?: any; // Optional: Hardcoded predicate (e.g., for system CARRIES)
  hideBadge?: boolean;
  hideEdit?: boolean;
}

export default function CollapsibleEdgeBlock({
  title,
  icon,
  items = [],
  builderConfig,
  defaultOpen = true,
  currentTab,
  activeNodeId,
  activeKinds,
  allPredicates = [],
  fixedPredDef,
  hideBadge = false,
  hideEdit = false,
}: CollapsibleEdgeBlockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const count = items.length;

  // Don't render the block at all if it has no data AND no builder configuration
  if (count === 0 && !builderConfig) return null;

  return (
    <div className="border border-gray-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 overflow-hidden mb-4 shadow-sm transition-colors">
      
      {/* 1. The Header (Toggle Button) */}
      <div 
        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          {/* Collapse/Expand Arrow Icon */}
          <span className="text-gray-400 dark:text-zinc-500 transition-transform duration-200">
            {isOpen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </span>
          
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 flex items-center gap-2 m-0">
            {icon && <span>{icon}</span>}
            {title}
          </h3>

          {/* Micro-Summary Pill (Only shows when collapsed and has items) */}
          {!isOpen && count > 0 && (
            <span className="text-xs font-medium text-gray-500 dark:text-zinc-400 ml-2 bg-gray-200 dark:bg-zinc-700 px-2 py-0.5 rounded-full">
              {count} item{count !== 1 ? 's' : ''} hidden
            </span>
          )}
        </div>
        
        {/* 2. The Action Bar (Universal Builder) */}
        <div 
          className="flex items-center gap-2" 
          onClick={(e) => e.stopPropagation()} // Prevents clicking the "+" button from collapsing the block
        >
          {builderConfig && (
            <UniversalBuilder {...builderConfig} />
          )}
        </div>
      </div>

      {/* 3. The Body (Edge Rows) */}
      {isOpen && count > 0 && (
        <div className="p-3 flex flex-col gap-2 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          {items.map((item, idx) => {
            // Destructure the composite object from the database query
            const edge = item.edge || item;
            const node = item.node || {};
            const isSource = item.isSource || false;
            
            // Resolve the predicate definition (either fixed or dynamically looked up)
            const predDef = fixedPredDef || allPredicates.find(p => p.id === edge.predicateId) || { forwardLabel: 'UNKNOWN', reverseLabel: 'UNKNOWN', isSystem: false };

            return (
              <EdgeRow 
                key={edge.id || idx} 
                edge={edge} 
                node={node}
                isSource={isSource}
                predDef={predDef}
                currentTab={currentTab}
                activeNodeId={activeNodeId}
                activeKinds={activeKinds}
                hideBadge={hideBadge}
                hideEdit={hideEdit}
              />
            );
          })}
        </div>
      )}
      
      {/* Empty State (If opened but empty) */}
      {isOpen && count === 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-zinc-800 text-sm text-gray-500 dark:text-zinc-500 italic text-center">
          No entries yet.
        </div>
      )}
    </div>
  );
}