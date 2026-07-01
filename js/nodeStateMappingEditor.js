import { app } from "../../../scripts/app.js";
import { contextProvider } from "./core/contextProvider.js";
import { eventBus } from "./core/eventBus.js";
import { showNotification } from "./ui/notifications.js";

const EDITOR_PATCH_FLAG = "__controlFreakNodeStateEditorPatch";
const EDITOR_DIALOG_ID = "controlfreak-node-state-mapping-editor";
const PASS_FIELD = "pass";

function passLabel() {
    return "By" + "pass";
}

function getMappingEngine() {
    return contextProvider.get("mappingEngine");
}

function getStateLabel(stateField) {
    return stateField === PASS_FIELD ? passLabel() : "Mute";
}

function getNodeStateInfo(mapping) {
    const target = mapping?.target;
    if (!target) return null;

    if (target.nodeState?.nodeId && target.nodeState?.stateField) {
        return {
            nodeId: target.nodeState.nodeId,
            nodeTitle: target.nodeState.nodeTitle,
            stateField: target.nodeState.stateField,
        };
    }

    const commandId = target.commandId || "";
    const pattern = new RegExp(`^ControlFreak\\.(Mute|${passLabel()}) Node (\\d+)$`);
    const match = commandId.match(pattern);
    if (!match) return null;

    return {
        nodeId: Number(match[2]),
        nodeTitle: target.label || `Node ${match[2]}`,
        stateField: match[1] === passLabel() ? PASS_FIELD : "mute",
    };
}

function isNodeStateMapping(mapping) {
    return !!getNodeStateInfo(mapping);
}

function getNodeTitle(info) {
    const node = app.graph?.getNodeById?.(+info.nodeId);
    return node?.title || info.nodeTitle || `Node ${info.nodeId}`;
}

function decorateMappingsPanel() {
    const mappingEngine = getMappingEngine();
    if (!mappingEngine) return;

    const components = document.querySelectorAll(".controller-mapping-component[data-mapping-id]");
    for (const component of components) {
        const mapping = mappingEngine.getMappingById(component.dataset.mappingId);
        const info = getNodeStateInfo(mapping);
        if (!info) continue;

        const label = getStateLabel(info.stateField);
        const nodeTitle = getNodeTitle(info);
        const target = component.querySelector(".mapping-target");
        const icon = target?.querySelector(".mapping-icon");
        const name = target?.querySelector(".mapping-name");

        if (icon) icon.textContent = info.stateField === PASS_FIELD ? "⏭️" : "🔇";
        if (name) {
            name.textContent = `${nodeTitle} → ${label} Node`;
            name.title = `Type: Node State\nNode: ${info.nodeId}\nField: ${label}`;
        }

        const section = component.closest(".target-mappings-section");
        const header = section?.querySelector(".target-header");
        if (header) header.textContent = `${label} Node (${nodeTitle})`;
    }
}

function scheduleDecorateMappingsPanel() {
    setTimeout(decorateMappingsPanel, 0);
    setTimeout(decorateMappingsPanel, 100);
}

function closeEditor() {
    const existing = document.getElementById(EDITOR_DIALOG_ID);
    if (existing) existing.remove();
}

function showNodeStateMappingEditor(mapping) {
    const mappingEngine = getMappingEngine();
    if (!mappingEngine) {
        showNotification("Mapping engine not initialized", "error");
        return;
    }

    const info = getNodeStateInfo(mapping);
    if (!info) return;

    closeEditor();

    const label = getStateLabel(info.stateField);
    const nodeTitle = getNodeTitle(info);

    const overlay = document.createElement("div");
    overlay.className = "mapping-editor-overlay";
    overlay.id = EDITOR_DIALOG_ID;

    const editor = document.createElement("div");
    editor.className = "mapping-editor controller-dialog";

    const header = document.createElement("div");
    header.className = "controller-dialog-header mapping-editor-header";
    header.innerHTML = `
        <h3>
            <span class="cf-logo">
                <span class="cf-logo-icon">🎮</span>
                <span class="cf-logo-text">CONTROL<span class="cf-logo-highlight">FREAK</span></span>
            </span>
        </h3>
    `;

    const closeButton = document.createElement("button");
    closeButton.className = "controller-dialog-close mapping-editor-close";
    closeButton.innerHTML = "×";
    closeButton.onclick = closeEditor;
    header.appendChild(closeButton);
    editor.appendChild(header);

    const content = document.createElement("div");
    content.className = "controller-dialog-content mapping-editor-content";

    const subtitle = document.createElement("div");
    subtitle.className = "cf-dialog-subtitle";
    subtitle.textContent = "Edit Node State Mapping";
    content.appendChild(subtitle);

    const controlSection = document.createElement("div");
    controlSection.className = "controller-mapping-target";
    controlSection.innerHTML = `
        <h3 style="color: var(--cf-brand-primary)">Control</h3>
        <div class="controller-mapping-target-info">${mapping.control?.name || mapping.control?.id || "Unknown Control"}</div>
    `;
    content.appendChild(controlSection);

    const targetSection = document.createElement("div");
    targetSection.className = "controller-mapping-target";
    targetSection.innerHTML = `
        <h3 style="color: var(--cf-brand-primary)">Target</h3>
        <div class="controller-mapping-target-info">
            <div><strong>Type:</strong> Node State</div>
            <div><strong>Node:</strong> ${nodeTitle}</div>
            <div><strong>Field:</strong> ${label}</div>
        </div>
    `;
    content.appendChild(targetSection);

    const mappingTypeGroup = document.createElement("div");
    mappingTypeGroup.className = "controller-mapping-type-section";
    mappingTypeGroup.innerHTML = `<h3 style="color: var(--cf-brand-primary)">Mapping Type</h3>`;

    const mappingTypeSelect = document.createElement("select");
    mappingTypeSelect.className = "controller-mapping-type-select";
    mappingTypeSelect.innerHTML = `
        <option value="toggle">Toggle State</option>
        <option value="trigger">Trigger Toggle</option>
        <option value="momentary">Momentary While Held</option>
        <option value="direct">Direct Threshold</option>
    `;
    const currentType = (mapping.mappingType || "toggle").toLowerCase();
    for (const option of mappingTypeSelect.options) {
        option.selected = option.value === currentType;
    }
    mappingTypeGroup.appendChild(mappingTypeSelect);
    content.appendChild(mappingTypeGroup);

    const transformSection = document.createElement("div");
    transformSection.className = "controller-mapping-type-section";
    transformSection.innerHTML = `<h3 style="color: var(--cf-brand-primary)">Input Options</h3>`;

    const invertGroup = document.createElement("div");
    invertGroup.className = "invert-field";
    const invertCheckbox = document.createElement("input");
    invertCheckbox.type = "checkbox";
    invertCheckbox.id = `node-state-edit-invert-${mapping.id}`;
    invertCheckbox.checked = mapping.transform?.isInverted ?? false;
    const invertLabel = document.createElement("label");
    invertLabel.htmlFor = invertCheckbox.id;
    invertLabel.textContent = "Invert Input Threshold";
    invertGroup.appendChild(invertCheckbox);
    invertGroup.appendChild(invertLabel);
    transformSection.appendChild(invertGroup);
    content.appendChild(transformSection);

    editor.appendChild(content);

    const actions = document.createElement("div");
    actions.className = "controller-mapping-buttons";

    const cancelButton = document.createElement("button");
    cancelButton.className = "controller-cancel-button";
    cancelButton.textContent = "CANCEL";
    cancelButton.onclick = closeEditor;
    actions.appendChild(cancelButton);

    const saveButton = document.createElement("button");
    saveButton.className = "controller-map-button";
    saveButton.textContent = "SAVE CHANGES";
    saveButton.style.backgroundColor = "var(--cf-brand-primary)";
    saveButton.style.color = "white";
    saveButton.onclick = () => {
        const updatedData = {
            mappingType: mappingTypeSelect.value,
            transform: {
                ...(mapping.transform || {}),
                isInverted: invertCheckbox.checked,
            },
        };

        const success = mappingEngine.updateMapping(mapping.id, updatedData);
        if (success) {
            showNotification("Mapping updated successfully", "success");
            closeEditor();
            eventBus.emit("mappings:changed");
            scheduleDecorateMappingsPanel();
        } else {
            showNotification("Failed to update mapping", "error");
        }
    };
    actions.appendChild(saveButton);

    editor.appendChild(actions);
    overlay.appendChild(editor);
    document.body.appendChild(overlay);
    mappingTypeSelect.focus();
}

function installEditorInterceptor() {
    if (window[EDITOR_PATCH_FLAG]) return;
    window[EDITOR_PATCH_FLAG] = true;

    document.addEventListener("click", event => {
        const editButton = event.target?.closest?.(".mapping-edit");
        if (!editButton) return;

        const component = editButton.closest(".controller-mapping-component[data-mapping-id]");
        if (!component) return;

        const mapping = getMappingEngine()?.getMappingById(component.dataset.mappingId);
        if (!isNodeStateMapping(mapping)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        showNodeStateMappingEditor(mapping);
    }, true);
}

export function registerNodeStateMappingEditorIntegration() {
    installEditorInterceptor();
    scheduleDecorateMappingsPanel();

    eventBus.on("mapping:added", scheduleDecorateMappingsPanel);
    eventBus.on("mapping:updated", scheduleDecorateMappingsPanel);
    eventBus.on("mappings:loaded", scheduleDecorateMappingsPanel);
    eventBus.on("ui:mappingPanelOpened", scheduleDecorateMappingsPanel);
    eventBus.on("ui:mappingPanelTabChanged", scheduleDecorateMappingsPanel);
}
