import { app } from "../../../scripts/app.js";
import { registerNodeStateMappingFeature } from "./features/nodeStateMapping.js";

app.registerExtension({
    name: "Comfy.ControlFreak.NodeStateMapping",
    priority: 1001,
    async setup() {
        registerNodeStateMappingFeature();
    },
});
