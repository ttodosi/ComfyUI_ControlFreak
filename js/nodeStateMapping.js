import { app } from "../../../scripts/app.js";
import { registerNodeStateMappingFeature, getNodeStateMenuItems } from "./features/nodeStateMapping.js";

app.registerExtension({
    name: "Comfy.ControlFreak.NodeStateMapping",
    priority: 1001,
    getNodeMenuItems(node) {
        return getNodeStateMenuItems(node);
    },
    async setup() {
        registerNodeStateMappingFeature();
    },
});
