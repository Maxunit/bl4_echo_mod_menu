/* The loopback protocol carries plain snapshots and drafts only. SDK access
 * belongs to the guarded game-thread controller. This marker is not a secret. */
var service = 'echo-mod-menu-v1', token = 'echo-menu-v1';
var clientEvents = [];
function short(value) {
    if (value === null || value === undefined) return String(value);
    if (value.message) return String(value.message).slice(0, 600);
    try { return (typeof value === 'string' ? value : JSON.stringify(value)).slice(0, 1200); }
    catch (_) { return '[unavailable]'; }
}
function record(kind, detail) {
    // Local, bounded diagnostics. No inventory snapshots, console interception,
    // background requests or automatic export of another mod's configuration.
    if (clientEvents.length >= 32) clientEvents.shift();
    clientEvents.push({kind:kind, detail:detail || {}});
}
function echoRenderNode(node, includeText) {
    if (!node) return null;
    var result = {tag:String(node.tagName || ''), id:String(node.id || ''), class_name:String(node.className || '')};
    if (typeof node.getBoundingClientRect === 'function') {
        var rect = node.getBoundingClientRect();
        result.rect = {x:Number(rect.left), y:Number(rect.top), width:Number(rect.width), height:Number(rect.height)};
    }
    if (includeText) result.text_content = String(node.textContent || '').slice(0, 220);
    return result;
}
