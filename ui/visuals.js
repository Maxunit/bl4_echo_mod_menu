/* Decorative images only: no focus targets, native models, polling or timers. */
var echoBuiltinIcons = __ECHO_ICON_NAMES__;
function echoIcon(parent, name, size) {
    if (echoBuiltinIcons.indexOf(name) < 0) name = 'puzzle';
    var node = echoNode(parent, 'img', null, 'echo-icon', 'width:' + (size || '1.6rem') + ';height:' + (size || '1.6rem') + ';margin-right:0.6rem;object-fit:contain;pointer-events:none;');
    node.alt = ''; node.tabIndex = -1; node.draggable = false;
    node.setAttribute('aria-hidden', 'true');
    node.src = 'coui://uiresources/echo_mod_menu/icons/' + name + '.png';
    node.addEventListener('error', function () { node.style.visibility = 'hidden'; });
    return node;
}
function echoDecorateButton(node, id) {
    var names = {'action:refresh':'restore', 'action:reset':'restore', 'action:discard':'restore',
        'action:clear':'trash', 'action:save':'device-floppy'};
    var name = names[id] || (id.indexOf('status:') === 0 ? 'power' : '');
    if (name) {
        var icon = echoIcon(node, name, '1.45rem'); icon.style.order = '-1';
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
    if (source) { if (node.src !== source) node.src = source; }
    else if (node.echoArtworkHeader) node.echoArtworkHeader.style.display = 'none';
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
    node.addEventListener('error', function () {
        if (node.src !== node.echoArtworkFallback) {
            echoArtworkDecodeError(state, node.echoArtworkReference);
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
    }
    if (reference && typeof reference === 'object') echoArtworkLoad(state, reference, node);
}
function echoArtworkHeader(state, parent, mod) {
    var reference = (mod.artwork || {}).header;
    if (!reference || typeof reference !== 'object' || !reference.id) return;
    var frame = echoNode(parent, 'div', null, 'echo-mod-artwork', 'height:15rem;width:100%;margin-bottom:1.2rem;padding:0.5rem 1rem;border-bottom:1px solid #214858;overflow:hidden;pointer-events:none;');
    var image = echoNode(frame, 'img', null, 'echo-mod-header-image', 'width:100%;height:100%;object-fit:contain;object-position:left center;pointer-events:none;');
    image.alt = ''; image.tabIndex = -1; image.draggable = false;
    image.setAttribute('aria-hidden', 'true'); image.echoArtworkHeader = frame;
    image.addEventListener('error', function () {
        echoArtworkDecodeError(state, reference); frame.style.display = 'none'; echoFlushScrollLayout(state);
    });
    echoArtworkLoad(state, reference, image);
}
