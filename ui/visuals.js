/* Decorative images only: no focus targets, native models, polling or timers. */
var echoBuiltinIcons = __ECHO_ICON_NAMES__;
function echoIcon(parent, name, size) {
    if (echoBuiltinIcons.indexOf(name) < 0) name = 'puzzle';
    var node = echoNode(parent, 'img', null, 'echo-icon', 'width:' + (size || '1.6rem') + ';height:' + (size || '1.6rem') + ';margin-right:0.8rem;pointer-events:none;');
    node.alt = ''; node.tabIndex = -1; node.draggable = false;
    node.setAttribute('aria-hidden', 'true');
    node.src = 'coui://uiresources/echo_mod_menu/icons/' + name + '.png';
    node.addEventListener('error', function () { node.style.visibility = 'hidden'; });
    return node;
}
function echoButtonIcon(node, name, size) {
    // Cohtml does not support CSS order. Give both parts real DOM order and
    // keep the button's existing corner marker, input target and listeners.
    var text = node.textContent, children = Array.prototype.slice.call(node.children);
    node.textContent = '';
    var icon = echoIcon(node, name, size);
    echoText(node, text, 'echo-button-label', 'width:auto;font-size:inherit;color:inherit;white-space:nowrap;flex-wrap:nowrap;pointer-events:none;');
    children.forEach(function (child) { node.appendChild(child); });
    return icon;
}
function echoDecorateButton(node, id) {
    var names = {'action:refresh':'restore', 'action:reset':'restore', 'action:discard':'restore',
        'action:clear':'trash', 'action:save':'device-floppy'};
    var name = names[id] || (id.indexOf('status:') === 0 ? 'power' : '');
    if (name) {
        var icon = echoButtonIcon(node, name, '1.45rem');
        if (id === 'action:save') icon.style.backgroundColor = '#123544';
    }
    return node;
}
function echoCategoryIcon(mod, category) {
    var id = String(category.id || '').split(':').pop();
    var declared = (mod.artwork || {}).category_icons || {};
    if (echoBuiltinIcons.indexOf(declared[id]) >= 0) return declared[id];
    var names = {__info:'info-circle', general:'settings', keybinds:'keyboard', camera:'camera',
        ads:'target', aiming:'target', motion:'run', movement:'run', vehicle:'car',
        omni:'compass', diagnostics:'activity'};
    return names[id] || 'adjustments-horizontal';
}
function echoArtworkReset(state) {
    var cache = state.artworkCache || {};
    // Detach first: abort() can deliver a synchronous error callback.
    state.artworkCache = {};
    Object.keys(cache).forEach(function (id) {
        var entry = cache[id];
        entry.nodes = [];
        if (entry.xhr && typeof entry.xhr.abort === 'function') entry.xhr.abort();
    });
}
function echoArtworkComplete(state, entry, source) {
    entry.source = source; entry.finished = true; entry.xhr = null;
    var nodes = entry.nodes; entry.nodes = [];
    nodes.forEach(function (node) {
        if (!echoControllerContains(state.root, node)) return;
        echoArtworkSetSource(node, source);
    });
    // Loading never redraws the editor or changes an edit/capture/draft.
    if (typeof echoFlushScrollLayout === 'function') echoFlushScrollLayout(state);
}
function echoArtworkSetSource(node, source) {
    if (source) {
        if (node.echoArtworkIcon) echoModIconSize(node, node.echoArtworkReference);
        if (node.src !== source) node.src = source;
    }
    else echoArtworkHideHeader(node);
}
function echoArtworkHideHeader(node) {
    var frame = node.echoArtworkHeader;
    if (!frame) return;
    frame.style.display = 'none';
    if (frame.echoArtworkFallback) frame.echoArtworkFallback.style.display = 'flex';
}
function echoArtworkDecodeError(state, reference) {
    var entry = state.artworkCache && reference && state.artworkCache[reference.id];
    if (entry) { entry.source = ''; entry.finished = true; entry.nodes = []; }
}
function echoArtworkLoad(state, reference, node) {
    var id = reference && reference.id;
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || !state.epoch || state.closed) return;
    state.artworkCache = state.artworkCache || {};
    var cache = state.artworkCache, entry = cache[id];
    if (entry && entry.finished) {
        echoArtworkSetSource(node, entry.source);
        return;
    }
    if (entry) {
        entry.nodes = entry.nodes.filter(function (target) { return echoControllerContains(state.root, target); });
        if (entry.nodes.indexOf(node) < 0 && entry.nodes.length < 256) entry.nodes.push(node);
        return;
    }
    var epoch = state.epoch, generation = state.generation, xhr = new XMLHttpRequest();
    entry = cache[id] = {nodes:[node], finished:false, source:'', xhr:xhr};
    function finish(source) {
        if (entry.finished || state.closed || state.artworkCache !== cache || state.epoch !== epoch || state.generation !== generation) return;
        echoArtworkComplete(state, entry, source);
    }
    try {
        xhr.open('POST', 'http://127.0.0.1:19401/' + service + '/artwork', true);
        xhr.timeout = 4000; xhr.setRequestHeader('Content-Type', 'text/plain');
        xhr.onload = function () {
            try {
                var reply = JSON.parse(xhr.responseText), source = reply.data_url;
                if (xhr.status !== 200 || !reply.ok || reply.service !== service || reply.id !== id ||
                    typeof source !== 'string' || source.length > 5592430 ||
                    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(source)) return finish('');
                finish(source);
            } catch (_) { finish(''); }
        };
        xhr.onerror = xhr.ontimeout = function () { finish(''); };
        xhr.send(JSON.stringify({token:token, epoch:epoch, id:id}));
    } catch (_) { finish(''); }
}
function echoModIcon(state, parent, mod) {
    var node = echoIcon(parent, 'puzzle', '2rem');
    node.className += ' echo-mod-symbol';
    node.echoArtworkIcon = true;
    node.addEventListener('error', function () {
        if (node.src !== node.echoArtworkFallback) {
            echoArtworkDecodeError(state, node.echoArtworkReference);
            echoModIconSize(node, null);
            node.style.visibility = 'visible'; node.src = node.echoArtworkFallback;
        }
    });
    return node;
}
function echoModIconUpdate(state, node, mod) {
    var reference = (mod.artwork || {}).icon;
    node.echoArtworkReference = reference;
    var name = typeof reference === 'string' && echoBuiltinIcons.indexOf(reference) >= 0 ? reference : 'puzzle';
    var key = state.epoch + ':' + (reference && typeof reference === 'object' ? reference.id : name);
    node.echoArtworkFallback = 'coui://uiresources/echo_mod_menu/icons/' + name + '.png';
    if (node.echoArtworkKey !== key) {
        node.echoArtworkKey = key; node.src = node.echoArtworkFallback; node.style.visibility = 'visible';
        echoModIconSize(node, null);
    }
    if (reference && typeof reference === 'object') echoArtworkLoad(state, reference, node);
}
function echoArtworkContain(reference, width, height) {
    if (!reference || typeof reference.width !== 'number' || typeof reference.height !== 'number' ||
        !isFinite(reference.width) || !isFinite(reference.height) ||
        reference.width <= 0 || reference.height <= 0 ||
        !isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return null;
    var scale = Math.min(width / reference.width, height / reference.height);
    return {width:reference.width * scale, height:reference.height * scale};
}
function echoModIconSize(node, reference) {
    var size = echoArtworkContain(reference, 2, 2) || {width:2, height:2};
    node.style.width = size.width + 'rem'; node.style.height = size.height + 'rem';
    // Reserve a square slot even for a non-square PNG, keeping names aligned.
    node.style.marginRight = (2 - size.width + 0.8) + 'rem';
}
function echoArtworkFitHeaders(state) {
    var changed = false;
    Array.prototype.forEach.call(state.root.querySelectorAll('.echo-mod-header-image'), function (node) {
        var width = node.parentElement.clientWidth, height = node.parentElement.clientHeight;
        if (!(width > 0 && height > 0)) {
            var box = node.parentElement.getBoundingClientRect(); width = box.width; height = box.height;
        }
        var size = echoArtworkContain(node.echoArtworkReference, width, height);
        if (!size) return;
        var styles = {width:size.width + 'px', height:size.height + 'px',
            left:(width - size.width) / 2 + 'px', top:(height - size.height) / 2 + 'px'};
        Object.keys(styles).forEach(function (key) {
            if (node.style[key] !== styles[key]) { node.style[key] = styles[key]; changed = true; }
        });
    });
    return changed;
}
function echoModHeader(state, parent, mod) {
    var reference = (mod.artwork || {}).header || {};
    // Category and language changes retain the same image node. A different
    // mod, image, inventory session or reopened view gets a fresh header.
    var key = JSON.stringify([state.generation, state.epoch, mod.id,
        reference.id, reference.width, reference.height]);
    if (parent.echoHeaderKey !== key) {
        echoClear(parent); parent.echoHeaderKey = key;
        parent.echoHeaderTitle = echoText(parent, '', 'echo-mod-heading',
            'height:4.8rem;align-items:center;justify-content:center;overflow:hidden;font-size:2.4rem;color:#a3c2cf;margin-bottom:0.8rem;');
        echoArtworkHeader(state, parent, mod, parent.echoHeaderTitle);
    }
    var name = echoModText(state, mod, 'name');
    if (parent.echoHeaderTitle.textContent !== name) parent.echoHeaderTitle.textContent = name;
    parent.style.display = 'flex';
}
function echoArtworkHeader(state, parent, mod, fallback) {
    var reference = (mod.artwork || {}).header;
    if (!reference || typeof reference !== 'object' || typeof reference.id !== 'string' ||
        !/^[a-f0-9]{64}$/.test(reference.id) || !echoArtworkContain(reference, 1, 1)) return;
    var frame = echoNode(parent, 'div', null, 'echo-mod-artwork', 'height:15rem;width:100%;margin-bottom:1.2rem;border-bottom:1px solid #214858;overflow:hidden;pointer-events:none;');
    frame.echoArtworkFallback = fallback;
    if (fallback) fallback.style.display = 'none';
    var viewport = echoNode(frame, 'div', null, 'echo-mod-artwork-viewport', 'position:absolute;left:1rem;right:1rem;top:0.5rem;bottom:0.5rem;overflow:hidden;pointer-events:none;');
    // Explicit proportional dimensions avoid unsupported object-fit and do
    // not change the original PNG, including its transparent margins.
    var image = echoNode(viewport, 'img', null, 'echo-mod-header-image', 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;');
    image.alt = ''; image.tabIndex = -1; image.draggable = false;
    image.echoArtworkReference = reference;
    image.setAttribute('aria-hidden', 'true'); image.echoArtworkHeader = frame;
    image.addEventListener('error', function () {
        echoArtworkDecodeError(state, reference); echoArtworkHideHeader(image); echoFlushScrollLayout(state);
    });
    echoArtworkLoad(state, reference, image);
}
