import { app } from "../../../scripts/app.js";
import { registerNodeStateMappingEditorIntegration } from "./nodeStateMappingEditor.js";

app.registerExtension({
    name: "Comfy.ControlFreak.NodeStateMappingEditor",
    priority: 1002,
    async setup() {
        registerNodeStateMappingEditorIntegration();
    },
});
