import React from "react";
import CollapsibleEdgeBlock from "./CollapsibleEdgeBlock";

interface NodeLayoutEngineProps {
  node: any;
  groups: any;
  edgeContext: any;
  propertiesComponent: React.ReactNode;
  mediaViewerComponent?: React.ReactNode;
}

export default function NodeLayoutEngine({
  node,
  groups,
  edgeContext,
  propertiesComponent,
  mediaViewerComponent
}: NodeLayoutEngineProps) {
  // Graceful fallback for resolving the 3 layers
  const isIdentity = node.layer === 'IDENTITY';
  const isPhysical = node.layer === 'PHYSICAL' || (node.layer === 'INSTANCE' && node.kind?.startsWith('PHYSICAL'));
  const isMedia = node.layer === 'MEDIA' || (node.layer === 'INSTANCE' && !node.kind?.startsWith('PHYSICAL'));

  const {
    physicalHoldings,
    digitalArtifacts,
    mediaAppearances,
    conceptualSemantics,
    bridgedConcepts,
    physicalSources,
    containedIn,
    containsItems
  } = groups;

  return (
    <div className="flex flex-col w-full">
      
      {/* --- A. IDENTITY PARITY --- */}
      {isIdentity && (
        <>
          {propertiesComponent}
          
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Physical Holdings"
            icon="📦"
            items={physicalHoldings}
            hideEdit={true}
            fixedPredDef={{ forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'STRUCTURAL', direction: 'REVERSE', allowedGateways: ['PHYSICAL'],
              buttonLabel: 'Add Holding', modalTitle: 'Physical Holdings', icon: '📦', theme: 'amber', hideEdgeProperties: true
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Conceptual Semantics"
            icon="🔗"
            items={conceptualSemantics}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'SEMANTIC', allowedGateways: ['IDENTITY', 'PHYSICAL'],
              buttonLabel: 'Assert Link', modalTitle: 'Semantic Connection', icon: '🔗', theme: 'emerald', hideEdgeProperties: false
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Digital Embodiments"
            icon="🖼️"
            items={digitalArtifacts}
            hideBadge
            hideEdit={true}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'STRUCTURAL', direction: 'REVERSE', allowedGateways: ['FILE', 'URL'],
              buttonLabel: 'Add Artifact', modalTitle: 'Digital Artifact', icon: '🖼️', theme: 'blue', hideEdgeProperties: true
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Media Appearances"
            icon="📸"
            items={mediaAppearances}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'SEMANTIC', allowedGateways: ['FILE', 'URL'],
              buttonLabel: 'Tag in Media', modalTitle: 'Media Appearance', icon: '📸', theme: 'emerald', hideEdgeProperties: false
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Contained In (Locations & Collections)"
            icon="📥"
            items={containedIn}
            hideEdit={true}
            fixedPredDef={{ forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'CONTAINMENT', direction: 'REVERSE', allowedGateways: ['IDENTITY', 'PHYSICAL'],
              buttonLabel: 'Add Location', modalTitle: 'Contained In', icon: '📥', theme: 'blue', hideEdgeProperties: true
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Contents & Items"
            icon="📥"
            items={containsItems}
            hideEdit={true}
            fixedPredDef={{ forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'CONTAINMENT', direction: 'FORWARD', allowedGateways: ['IDENTITY', 'PHYSICAL', 'FILE', 'URL'],
              buttonLabel: 'Add Item', modalTitle: 'Contents & Items', icon: '📥', theme: 'blue', hideEdgeProperties: true
            }}
          />
        </>
      )}

      {/* --- B. PHYSICAL PARITY --- */}
      {isPhysical && (
        <>
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Bridged Concept"
            icon="💡"
            items={bridgedConcepts}
            hideBadge
            hideEdit={true}
            fixedPredDef={{ forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'STRUCTURAL', direction: 'FORWARD', allowedGateways: ['IDENTITY'],
              buttonLabel: 'Link Concept', modalTitle: 'Bridged Concept', icon: '💡', theme: 'blue', hideEdgeProperties: true
            }}
          />

          {propertiesComponent}
          
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Conceptual Semantics"
            icon="🔗"
            items={conceptualSemantics}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'SEMANTIC', allowedGateways: ['IDENTITY', 'FILE', 'URL'],
              buttonLabel: 'Assert Link', modalTitle: 'Semantic Connection', icon: '🔗', theme: 'emerald', hideEdgeProperties: false
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Digital Embodiments"
            icon="🖼️"
            items={digitalArtifacts}
            hideBadge
            hideEdit={true}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'STRUCTURAL', direction: 'REVERSE', allowedGateways: ['FILE', 'URL'],
              buttonLabel: 'Add Artifact', modalTitle: 'Digital Artifact', icon: '🖼️', theme: 'blue', hideEdgeProperties: true
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Media Appearances"
            icon="📸"
            items={mediaAppearances}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'SEMANTIC', allowedGateways: ['FILE', 'URL'],
              buttonLabel: 'Tag in Media', modalTitle: 'Media Appearance', icon: '📸', theme: 'emerald', hideEdgeProperties: false
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Contained In (Locations & Collections)"
            icon="📥"
            items={containedIn}
            hideEdit={true}
            fixedPredDef={{ forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'CONTAINMENT', direction: 'REVERSE', allowedGateways: ['IDENTITY', 'PHYSICAL'],
              buttonLabel: 'Add Location', modalTitle: 'Contained In', icon: '📥', theme: 'blue', hideEdgeProperties: true
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Contents & Items"
            icon="📥"
            items={containsItems}
            hideEdit={true}
            fixedPredDef={{ forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'CONTAINMENT', direction: 'FORWARD', allowedGateways: ['PHYSICAL'],
              buttonLabel: 'Add Item', modalTitle: 'Contents & Items', icon: '📥', theme: 'blue', hideEdgeProperties: true
            }}
          />
        </>
      )}

      {/* --- C. MEDIA PARITY --- */}
      {isMedia && (
        <>
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Bridged Concept"
            icon="💡"
            items={bridgedConcepts}
            hideBadge
            hideEdit={true}
            fixedPredDef={{ forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'STRUCTURAL', direction: 'FORWARD', allowedGateways: ['IDENTITY'],
              buttonLabel: 'Link Concept', modalTitle: 'Bridged Concept', icon: '💡', theme: 'blue', hideEdgeProperties: true
            }}
          />
          
          {mediaViewerComponent}
          {propertiesComponent}
          
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Physical Source Material"
            icon="📦"
            items={physicalSources}
            hideBadge
            hideEdit={true}
            fixedPredDef={{ forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'STRUCTURAL', direction: 'FORWARD', allowedGateways: ['PHYSICAL'],
              buttonLabel: 'Link Source', modalTitle: 'Physical Source Material', icon: '📦', theme: 'amber', hideEdgeProperties: true
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Identified Subjects & Semantics"
            icon="📍"
            items={conceptualSemantics}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'SEMANTIC', allowedGateways: ['IDENTITY', 'PHYSICAL'],
              buttonLabel: 'Assert Link', modalTitle: 'Semantic Connection', icon: '📍', theme: 'emerald', hideEdgeProperties: false
            }}
          />
          <CollapsibleEdgeBlock
            {...edgeContext}
            title="Contained In (Locations & Collections)"
            icon="📥"
            items={containedIn}
            hideEdit={true}
            fixedPredDef={{ forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }}
            builderConfig={edgeContext.hideEdit ? undefined : {
              mode: 'CONTAINMENT', direction: 'REVERSE', allowedGateways: ['IDENTITY', 'PHYSICAL'],
              buttonLabel: 'Add Location', modalTitle: 'Contained In', icon: '📥', theme: 'blue', hideEdgeProperties: true
            }}
          />
        </>
      )}

    </div>
  );
}