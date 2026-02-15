// Derive the extension name from the URL this script was loaded from,
// so it works whether the folder is "ComfyUI_ControlFreak" or "comfyui_controlfreak".
const _extensionName = (() => {
    try {
        const url = import.meta.url;
        const match = url.match(/\/extensions\/([^/]+)\//);
        if (match) return match[1];
    } catch (e) {}
    return 'comfyui_controlfreak';
})();

function loadCssWithComfyApi(relativePath) {
    try {
        if (window.comfyAPI?.utils?.addStylesheet) {
            const cssUrlPath = `/extensions/${_extensionName}/ui/styles/${relativePath}`;
            window.comfyAPI.utils.addStylesheet(cssUrlPath);
        } else {
            console.warn(`ControlFreak: comfyAPI.utils.addStylesheet not found. Cannot load ${relativePath} dynamically.`);
        }
    } catch (error) {
        console.error(`ControlFreak: Error calling addStylesheet for ${relativePath}:`, error);
    }
}

// Load all CSS files
loadCssWithComfyApi('contextMenu.css');
loadCssWithComfyApi('notification.css');
loadCssWithComfyApi('panel.css');
loadCssWithComfyApi('dialog.css');
loadCssWithComfyApi('mappingComponent.css');
loadCssWithComfyApi('controllerButton.css');
loadCssWithComfyApi('theme.css');
loadCssWithComfyApi('branding.css');
loadCssWithComfyApi('nodeStyles.css');
