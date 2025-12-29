/**
 * Settings Modal - Main Export Hub
 * Provides factory function and exports for all modal types
 */

// Base infrastructure
export * from './base';

// Generic modal
export { GenericSettingsModal } from './generic';

// Custom modals will be added here
// export { FibonacciSettingsModal } from './custom/FibonacciSettingsModal';

import { Drawing } from '../../drawings';
import { BaseSettingsModal } from './base/BaseSettingsModal';
import { GenericSettingsModal } from './generic/GenericSettingsModal';

/** Drawing types that need custom modals */
const CUSTOM_MODAL_TYPES = [
    'fibRetracement',
    'fibExtension',
    'fibChannel',
];

/**
 * Factory function to get the appropriate modal for a drawing type.
 * Returns custom modal for complex drawings, generic modal for simple ones.
 */
export function createSettingsModal(container: HTMLElement, drawing: Drawing): BaseSettingsModal {
    const type = drawing.type;

    // Check if this type needs a custom modal
    if (CUSTOM_MODAL_TYPES.includes(type)) {
        // TODO: Return FibonacciSettingsModal when implemented
        // For now, fall back to generic
        return new GenericSettingsModal(container);
    }

    // Default: use generic modal
    return new GenericSettingsModal(container);
}
