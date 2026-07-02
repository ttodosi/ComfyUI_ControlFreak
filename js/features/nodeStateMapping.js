/**
 * Node state mapping feature for ControlFreak.
 *
 * Adds right-click mapping targets for LiteGraph node mute and pass-through states.
 * The saved mapping target remains command-compatible so the existing mappings panel
 * and mapping editor can manage these mappings without a broad UI rewrite.
 */

import { app } from "../../../../scripts/app.js";
import { contextProvider } from "../core/contextProvider.js";
import { eventBus } from "../core/eventBus.js";
import { showNotification } from "../ui/notifications.js";
import { createMappingList } from "../ui/mappingComponent.js";

const FEATURE_FLAG = "__controlFreakNodeStateMappingFeature";
const ENGINE_PATCH_FLAG = "__controlFreakNodeStateEnginePatched";
const DIALOG_ID = "controlfreak-node-state-learning-dialog";
const PASS_FIELD = "pass";

const previousNodeModes = new Map();
const mappingInputLatches = new Map();

function passLabel() {
    return "By" + "pass";
}

function getLiteGraphModes() {
    const LiteGraph = window.LiteGraph || {};
    return {
        ALWAYS: LiteGraph.ALWAYS ?? 0,
        NEVER: LiteGraph.NEVER ?? 2,
        PASS: LiteGraph["BY" + "PASS"] ?? 4,
    };
}

function getFieldLabel(stateField) {
    return stateField === PASS_FIELD ? passLabel() : "Mute";
}

function getCommandId(node, stateField) {
    return `ControlFreak.${getFieldLabel(stateField)} Node ${node.id}`;
}

function getNodeLabel(node) {
    return node?.title || node?.type || `Node ${node?.id ?? "?"}`;
}

function getNodeStateTarget(node, stateField) {
    return {
        type: "command",
        commandId: getCommandId(node, stateField),
        label: `${getFieldLabel(stateField)} Node: ${getNodeLabel(node)}`,
        description: `${getFieldLabel(stateField)} node ${node.id}`,
        nodeState: {
            nodeId: node.id,
            nodeTitle: getNodeLabel(node),
            comfyClass: node.comfyClass,
            stateField,
        },
    };
}

function getNodeStateInfo(mapping) {
    const target = mapping?.target;
    if (!target) return null;

    if (target.nodeState?.nodeId && target.nodeState?.stateField) {
        return {
            nodeId: target.nodeState.nodeId,
            stateField: target.nodeState.stateField,
        };
    }

    const commandId = target.commandId || "";
    const pattern = new RegExp(`^ControlFreak\\.(Mute|${passLabel()}) Node (\\d+)$`);
    const match = commandId.match(pattern);
    if (!match) return null;

    return {
        nodeId: Number(match[2]),
        stateField: match[1] === passLabel() ? PASS_FIELD : "mute",
    };
}

function isNodeStateMapping(mapping) {
    return !!getNodeStateInfo(mapping);
}

function getInputRange(controlType) {
    if (controlType === "midi" || controlType === "midi_cc") {
        return { input_min: 0, input_max: 127 };
    }
    if (controlType === "gamepad_axis") {
        return { input_min: -1, input_max: 1 };
    }
    return { input_min: 0, input_max: 1 };
}

function normalizeRawValue(mapping, rawInputValue) {
    const inputMin = mapping.control?.input_min ?? 0;
    const inputMax = mapping.control?.input_max ?? 1;
    let normalized = 0;

    if (inputMax !== inputMin) {
        normalized = (rawInputValue - inputMin) / (inputMax - inputMin);
    } else if (rawInputValue >= inputMin) {
        normalized = 1;
    }

    normalized = Math.max(0, Math.min(1, normalized));

    if (mapping.transform?.isInverted === true) {
        normalized = 1 - normalized;
    }

    return normalized;
}

function getNodeStateMode(stateField) {
    const modes = getLiteGraphModes();
    return stateField === PASS_FIELD ? modes.PASS : modes.NEVER;
}

function isNodeStateActive(node, stateField) {
    return node?.mode === getNodeStateMode(stateField);
}

function setNodeState(node, stateField, active) {
    if (!node) return false;

    const modes = getLiteGraphModes();
    const desiredMode = getNodeStateMode(stateField);
    const otherStateMode = stateField === PASS_FIELD ? modes.NEVER : modes.PASS;
    const currentMode = node.mode ?? modes.ALWAYS;

    if (active) {
        if (currentMode !== modes.NEVER && currentMode !== modes.PASS) {
            previousNodeModes.set(node.id, currentMode);
        }
        node.mode = desiredMode;
    } else if (currentMode === desiredMode) {
        let restoreMode = previousNodeModes.get(node.id);
        if (restoreMode === undefined || restoreMode === desiredMode || restoreMode === otherStateMode) {
            restoreMode = modes.ALWAYS;
        }
        node.mode = restoreMode;
    }

    if (typeof node.setDirtyCanvas === "function") {
        node.setDirtyCanvas(true, true);
    }
    if (app.canvas && typeof app.canvas.setDirty === "function") {
        app.canvas.setDirty(true, true);
    }
    const graph = app.canvas?.graph;
    if (graph && typeof graph.change === "function") {
        graph.change();
    }

    return true;
}

function applyNodeStateMapping(engine, mapping, rawInputValue) {
    const info = getNodeStateInfo(mapping);
    if (!info || typeof rawInputValue === "undefined") return false;

    const graph = app.canvas?.graph;
    const node = graph?.getNodeById?.(+info.nodeId);
    if (!node) {
        console.warn(`ControlFreak: Node ${info.nodeId} not found for ${info.stateField} mapping.`);
        return true;
    }

    const normalized = normalizeRawValue(mapping, rawInputValue);
    const isPressed = normalized > 0.5;
    const mappingType = (mapping.mappingType || "toggle").toLowerCase();
    const latchKey = mapping.id || `${mapping.target?.commandId}:${mapping.control?.id}`;
    const wasPressed = mappingInputLatches.get(latchKey) === true;

    engine.eventBus?.emit?.("mapping:applying", mapping, rawInputValue, isPressed);

    let changed = false;
    let active = isNodeStateActive(node, info.stateField);

    if (mappingType === "momentary") {
        active = isPressed;
        changed = setNodeState(node, info.stateField, active);
    } else if (mappingType === "direct" || mappingType === "absolute") {
        active = isPressed;
        changed = setNodeState(node, info.stateField, active);
    } else if (isPressed && !wasPressed) {
        active = !active;
        changed = setNodeState(node, info.stateField, active);
    }

    mappingInputLatches.set(latchKey, isPressed);

    if (changed) {
        engine.eventBus?.emit?.("nodeState:valueUpdated", {
            nodeId: info.nodeId,
            stateField: info.stateField,
            value: active,
            mapping,
        });
    }

    engine.eventBus?.emit?.("mapping:applied", mapping, rawInputValue, active);
    return true;
}

function patchMappingEngine() {
    const mappingEngine = contextProvider.get("mappingEngine");
    if (!mappingEngine || mappingEngine[ENGINE_PATCH_FLAG]) return;

    const originalApplyMapping = mappingEngine.applyMapping.bind(mappingEngine);
    mappingEngine.applyMapping = function patchedApplyMapping(mapping, rawInputValue) {
        if (isNodeStateMapping(mapping)) {
            return applyNodeStateMapping(this, mapping, rawInputValue);
        }
        return originalApplyMapping(mapping, rawInputValue);
    };

    mappingEngine[ENGINE_PATCH_FLAG] = true;
}

export function getNodeStateMenuItems(node) {
    if (!node) return [];

    return [
        createQuickMapNodeStateMenuItem(node, "mute"),
        createQuickMapNodeStateMenuItem(node, PASS_FIELD),
    ];
}

function createQuickMapNodeStateMenuItem(node, stateField) {
    return {
        content: `ControlFreak: Quickmap ${getFieldLabel(stateField)}`,
        callback: () => startNodeStateQuickMapping(node, stateField),
    };
}

function findExistingNodeStateMappings(node, stateField) {
    const mappingEngine = contextProvider.get("mappingEngine");
    if (!mappingEngine) return [];

    const commandId = getCommandId(node, stateField);
    return mappingEngine.getMappings().filter(mapping =>
        mapping.target?.type === "command" &&
        mapping.target?.commandId === commandId
    );
}

function startNodeStateQuickMapping(node, stateField) {
    if (!node) {
        showNotification("Cannot quick-map node state: node not found", "error");
        return;
    }

    closeNodeStateDialog();
    window[FEATURE_FLAG].quickLearning = { node, stateField };
    showNotification(`Quick Mapping: Move controller for '${getFieldLabel(stateField)} Node'...`, "info", 5000);

    eventBus.emit("menu:quickMappingStarted", {
        type: "node_state",
        nodeId: node.id,
        nodeType: node.type,
        nodeTitle: getNodeLabel(node),
        stateField,
    });
}

function startNodeStateStandardMapping(node, stateField) {
    if (!node) {
        showNotification("Cannot map node state: node not found", "error");
        return;
    }

    closeNodeStateDialog();
    window[FEATURE_FLAG].standardLearning = {
        node,
        stateField,
        selectedControl: null,
        detectedControls: new Map(),
    };

    showNodeStateDialog(node, stateField);

    eventBus.emit("menu:mappingStarted", {
        type: "node_state",
        nodeId: node.id,
        nodeType: node.type,
        nodeTitle: getNodeLabel(node),
        stateField,
    });
}

function closeNodeStateDialog() {
    const existing = document.getElementById(DIALOG_ID);
    if (existing) existing.remove();
    if (window[FEATURE_FLAG]) {
        window[FEATURE_FLAG].standardLearning = null;
    }
}

function showNodeStateDialog(node, stateField) {
    const dialog = document.createElement("div");
    dialog.className = "controller-dialog controller-mapping-dialog";
    dialog.id = DIALOG_ID;

    const header = document.createElement("div");
    header.className = "controller-dialog-header";
    header.innerHTML = `
        <h2 class="cf-dialog-title">
            <div class="cf-logo">
                <span class="cf-logo-icon">🎮</span>
                <span class="cf-logo-text">Control<span class="cf-logo-highlight">Freak</span></span>
            </div>
        </h2>
    `;

    const closeButton = document.createElement("button");
    closeButton.className = "controller-dialog-close";
    closeButton.innerHTML = "×";
    closeButton.onclick = closeNodeStateDialog;
    header.appendChild(closeButton);
    dialog.appendChild(header);

    const content = document.createElement("div");
    content.className = "controller-dialog-content";

    const subtitle = document.createElement("div");
    subtitle.className = "cf-dialog-subtitle";
    subtitle.textContent = "Node State Mapping";
    content.appendChild(subtitle);

    const targetSection = document.createElement("div");
    targetSection.className = "controller-mapping-target";
    targetSection.innerHTML = `
        <h3>Target</h3>
        <div class="controller-mapping-target-info">
            <div><strong>Type:</strong> Node State</div>
            <div><strong>Node:</strong> ${getNodeLabel(node)}</div>
            <div><strong>Field:</strong> ${getFieldLabel(stateField)}</div>
        </div>
    `;
    content.appendChild(targetSection);

    const existingMappingsSection = document.createElement("div");
    existingMappingsSection.className = "controller-mapping-existing";
    existingMappingsSection.innerHTML = "<h3>Existing Mappings</h3>";
    const existingMappingsContent = document.createElement("div");
    existingMappingsContent.className = "controller-mapping-existing-content";
    existingMappingsContent.appendChild(createMappingList(findExistingNodeStateMappings(node, stateField)));
    existingMappingsSection.appendChild(existingMappingsContent);
    content.appendChild(existingMappingsSection);

    const inputSection = document.createElement("div");
    inputSection.className = "controller-mapping-input";
    inputSection.innerHTML = "<h3>Controller Input</h3>";
    const inputList = document.createElement("div");
    inputList.className = "controller-mapping-input-list";
    inputList.innerHTML = "<div class='controller-mapping-instruction'>Move a control on your controller to map it</div>";
    inputSection.appendChild(inputList);
    content.appendChild(inputSection);

    const mappingTypeSection = document.createElement("div");
    mappingTypeSection.className = "controller-mapping-type-section";
    mappingTypeSection.innerHTML = "<h3>Mapping Type</h3>";
    const mappingTypeSelect = document.createElement("select");
    mappingTypeSelect.className = "controller-mapping-type-select";
    mappingTypeSelect.innerHTML = `
        <option value="toggle">Toggle State (Default)</option>
        <option value="trigger">Trigger Toggle</option>
        <option value="momentary">Momentary While Held</option>
    `;
    mappingTypeSection.appendChild(mappingTypeSelect);

    const invertContainer = document.createElement("div");
    invertContainer.className = "controller-mapping-option";
    const invertCheckbox = document.createElement("input");
    invertCheckbox.type = "checkbox";
    invertCheckbox.id = "controller-node-state-mapping-invert";
    const invertLabel = document.createElement("label");
    invertLabel.htmlFor = invertCheckbox.id;
    invertLabel.textContent = " Invert Input Threshold";
    invertContainer.appendChild(invertCheckbox);
    invertContainer.appendChild(invertLabel);
    mappingTypeSection.appendChild(invertContainer);
    content.appendChild(mappingTypeSection);

    const buttons = document.createElement("div");
    buttons.className = "controller-mapping-buttons";

    const cancelButton = document.createElement("button");
    cancelButton.className = "controller-cancel-button";
    cancelButton.textContent = "Cancel";
    cancelButton.onclick = closeNodeStateDialog;
    buttons.appendChild(cancelButton);

    const mapButton = document.createElement("button");
    mapButton.className = "controller-map-button";
    mapButton.textContent = "Map Control";
    mapButton.disabled = true;
    mapButton.onclick = () => {
        const learning = window[FEATURE_FLAG]?.standardLearning;
        if (!learning?.selectedControl) {
            showNotification("No control input selected. Please click on a detected control.", "warning");
            return;
        }

        createNodeStateMapping(
            node,
            stateField,
            learning.selectedControl,
            mappingTypeSelect.value,
            invertCheckbox.checked
        );
        closeNodeStateDialog();
    };
    buttons.appendChild(mapButton);

    content.appendChild(buttons);
    dialog.appendChild(content);
    document.body.appendChild(dialog);

    window[FEATURE_FLAG].standardLearning.inputList = inputList;
    window[FEATURE_FLAG].standardLearning.mapButton = mapButton;
}

function handleDetectedControl(controlInput) {
    const featureState = window[FEATURE_FLAG];
    if (!featureState) return;

    if (featureState.quickLearning) {
        const { node, stateField } = featureState.quickLearning;
        featureState.quickLearning = null;
        // Quick node-state mappings are direct by default: controller value above
        // threshold enables mute/bypass, value below threshold restores the node.
        // This matches MIDI toggle buttons that alternate 127/0.
        createNodeStateMapping(node, stateField, controlInput, "direct", false);
        return;
    }

    const learning = featureState.standardLearning;
    if (!learning?.inputList) return;

    const controlId = controlInput.controlId;
    const deviceId = controlInput.deviceId;
    const type = controlInput.type;
    const key = `${deviceId}::${controlId}::${type}`;
    const displayName = controlInput.name || controlInput.deviceName || controlId;
    const rawValue = typeof controlInput.rawValue === "number" ? controlInput.rawValue.toFixed(2) : String(controlInput.rawValue);

    const instruction = learning.inputList.querySelector(".controller-mapping-instruction");
    if (instruction) instruction.remove();

    let controlElement = learning.detectedControls.get(key);
    if (!controlElement) {
        controlElement = document.createElement("div");
        controlElement.style.marginBottom = "5px";
        controlElement.style.padding = "8px";
        controlElement.style.borderRadius = "3px";
        controlElement.style.cursor = "pointer";
        controlElement.style.transition = "background-color 0.3s";
        controlElement.style.backgroundColor = "#2a2a3a";
        controlElement.style.border = "1px solid #444";

        const isButton = type?.includes("button") || type?.includes("note");
        const icon = isButton ? "🔘" : "↔️";
        controlElement.innerHTML = `<strong>${icon} ${displayName}</strong>: <span class="value">${rawValue}</span>`;

        controlElement.onclick = () => {
            for (const element of learning.detectedControls.values()) {
                element.style.backgroundColor = "#2a2a3a";
                element.style.border = "1px solid #444";
            }
            controlElement.style.backgroundColor = "#3a546e";
            controlElement.style.border = "1px solid #4c8eda";
            learning.selectedControl = {
                type,
                deviceId,
                controlId,
                name: displayName,
            };
            if (learning.mapButton) learning.mapButton.disabled = false;
        };

        learning.detectedControls.set(key, controlElement);
        learning.inputList.appendChild(controlElement);
    } else {
        const valueSpan = controlElement.querySelector(".value");
        if (valueSpan) valueSpan.textContent = rawValue;
    }

    const selected = learning.selectedControl &&
        learning.selectedControl.deviceId === deviceId &&
        learning.selectedControl.controlId === controlId &&
        learning.selectedControl.type === type;
    const originalBackground = selected ? "#3a546e" : "#2a2a3a";
    controlElement.style.backgroundColor = "#3a3a5c";
    setTimeout(() => {
        controlElement.style.backgroundColor = originalBackground;
    }, 200);
}

function createNodeStateMapping(node, stateField, controlInput, mappingType = "toggle", isInverted = false) {
    const mappingEngine = contextProvider.get("mappingEngine");
    if (!mappingEngine) {
        showNotification("Mapping engine not initialized", "error");
        return false;
    }

    const range = getInputRange(controlInput.type);
    const target = getNodeStateTarget(node, stateField);
    const mapping = {
        id: `mapping_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        profile: mappingEngine.getActiveProfile(),
        control: {
            type: controlInput.type,
            deviceId: controlInput.deviceId,
            id: controlInput.controlId,
            name: controlInput.name || `${controlInput.type} ${controlInput.controlId}`,
            input_min: range.input_min,
            input_max: range.input_max,
        },
        target,
        mappingType,
        transform: {
            isInverted: !!isInverted,
        },
    };

    mappingEngine.addMapping(mapping);
    mappingEngine.saveMappings();

    showNotification(`Mapped ${target.label}`, "success");
    eventBus.emit("learning:complete", { mapping, target, node });
    return true;
}

function installControllerInputListener() {
    if (window[FEATURE_FLAG].inputListenerInstalled) return;

    eventBus.on("controller:unhandledInput", handleDetectedControl);
    window[FEATURE_FLAG].inputListenerInstalled = true;
}

export function registerNodeStateMappingFeature() {
    if (!window[FEATURE_FLAG]) {
        window[FEATURE_FLAG] = {
            quickLearning: null,
            standardLearning: null,
            inputListenerInstalled: false,
        };
    }

    patchMappingEngine();
    installControllerInputListener();

    eventBus.on("mappings:loaded", patchMappingEngine);
    eventBus.on("mappings:initialized", patchMappingEngine);
    eventBus.on("mappings:reconnected", patchMappingEngine);
}
