/**
 * Attribute Bar Module
 * Floating toolbar for drawing attributes
 */

export { BaseAttributeBar, AttributeBarEvents } from './BaseAttributeBar';

// Re-export components for external use
export { ICONS } from './components';
export { createToolbarButton, createSeparator, createColorButton, createLineWidthButton } from './components';

// Alias for backward compatibility
export { BaseAttributeBar as FloatingAttributeBar } from './BaseAttributeBar';
