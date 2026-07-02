/**
 * Context menu functionality for ComfyUI_ControlFreak
 */

import { startMappingCommand, startQuickMapping } from '../core/learningManager.js';
import { contextProvider } from '../core/contextProvider.js';
import { eventBus } from '../core/eventBus.js';
import { app } from '../../../scripts/app.js'; // Import app
import { showNotification } from '../ui/notifications.js'; // Make sure showNotification is imported

/**
 * Position a context menu at the cursor position
 * @param {HTMLElement} menuElement - The menu element to position
 * @param {MouseEvent} event - The mouse event from which to get cursor position
 */
function positionContextMenu(menuElement, event) {
    menuElement.style.top = event.clientY + "px";
    menuElement.style.left = event.clientX + "px";
}

// Helper to check if a widget is mappable
function isWidgetMappable(widget) {
    return widget &&
        (widget.type === "number" ||
         widget.type === "slider" ||
         widget.type === "combo" ||
         widget.type === "toggle" ||
         widget.type === "boolean" ||
         widget.type === "string") &&
        widget.name &&
        typeof widget.value !== 'undefined';
}

/**
 * Register context menu extensions for nodes
 * @param {Object} app - The ComfyUI app instance
 */
export function registerNodeContextMenu(appInstance) {
    // Kept for backward compatibility. The actual node menu hook is registered
    // on the top-level ControlFreak extension in index.js so ComfyUI sees it
    // during normal extension registration rather than during setup().
}

function getClickedWidget(node) {
    try {
        const canvas = app.canvas;
        const widget = typeof canvas?.getWidgetAtCursor === 'function' ? canvas.getWidgetAtCursor() : null;
        return widget && node?.widgets?.includes(widget) ? widget : null;
    } catch (e) {
        console.error("[ControlFreak Debug] Error calling getWidgetAtCursor():", e);
        return null;
    }
}

function createQuickMapWidgetMenuItem(node, widget, mappingEngine) {
    const existingMappings = mappingEngine.getMappingsForWidget(node.id, widget.name);

    if (existingMappings.length === 1) {
        const mappingToUnmap = existingMappings[0];
        return {
            content: `ControlFreak: Quick Unmap '${widget.name}'`,
            callback: () => {
                try {
                    mappingEngine.deleteMapping(mappingToUnmap.id);
                    mappingEngine.saveMappings();
                    showNotification(`Unmapped '${widget.name}'`, "success");
                    eventBus.emit('mapping:deleted', { mappingId: mappingToUnmap.id });
                } catch (err) {
                    console.error("ControlFreak: Error during quick unmap:", err);
                    showNotification("Error unmapping widget", "error");
                }
            },
            className: 'controlfreak-quickunmap-option'
        };
    }

    if (existingMappings.length === 0) {
        return {
            content: `ControlFreak: Quick Map '${widget.name}'`,
            callback: () => {
                startQuickMapping(node, widget);
                eventBus.emit('menu:quickMappingStarted', {
                    type: 'widget',
                    nodeId: node.id,
                    nodeType: node.type,
                    nodeTitle: node.title || node.type,
                    widgetName: widget.name,
                    widgetType: widget.type
                });
            },
            className: 'controlfreak-quickmap-option'
        };
    }

    // Multiple mappings for the same widget should be managed in the panel.
    return null;
}

export function getControlFreakWidgetMenuItems(node) {
    const mappingEngine = contextProvider.get('mappingEngine');
    if (!mappingEngine || !node) return [];

    try {
        const mappableWidgets = (node.widgets || []).filter(isWidgetMappable);
        if (mappableWidgets.length === 0) return [];

        const clickedWidget = getClickedWidget(node);
        const orderedWidgets = clickedWidget && isWidgetMappable(clickedWidget)
            ? [clickedWidget, ...mappableWidgets.filter(widget => widget !== clickedWidget)]
            : mappableWidgets;

        const menuItems = orderedWidgets
            .map(widget => createQuickMapWidgetMenuItem(node, widget, mappingEngine))
            .filter(Boolean);

        return menuItems.length > 0 ? [null, ...menuItems] : [];
    } catch (error) {
        console.error("ControlFreak: Error creating controller mapping menu:", error);
    }

    return [];
}

/**
 * Register context menu for the queue button
 */
export function registerQueueButtonMenu() {
    try {
        // Find the queue button
        const queueButton = document.getElementById("queue-button");
        if (!queueButton) {
            return;
        }
        
        // Add the context menu handler
        queueButton.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            
            // Create a simple context menu for the queue button
            const menu = document.createElement("div");
            menu.className = "litegraph-context-menu";
            positionContextMenu(menu, e);
            
            const option = document.createElement("div");
            option.className = "menu-entry";
            option.textContent = "Map Controller to Queue Button";
            option.addEventListener("click", () => {
                // Use the imported function directly
                startMappingCommand("Comfy.QueuePrompt", {
                    label: "Queue Prompt",
                    description: "Execute current workflow"
                });
                
                // Remove the menu
                document.body.removeChild(menu);
                
                // Emit an event so we can track this in analytics if desired
                eventBus.emit('menu:mappingStarted', {
                    type: 'command',
                    commandId: 'Comfy.QueuePrompt',
                    commandLabel: 'Queue Prompt'
                });
            });
            
            menu.appendChild(option);
            document.body.appendChild(menu);
            
            // Remove the menu when clicking elsewhere
            const removeMenu = () => {
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
                document.body.removeEventListener("click", removeMenu);
            };
            
            setTimeout(() => {
                document.body.addEventListener("click", removeMenu);
            }, 0);
        });
    } catch (error) {
        console.error("ControlFreak: Error registering queue button menu:", error);
    }
} 