/* ECHO editor in the existing native host. All native models remain untouched. */
var echoTranslations = __ECHO_TRANSLATIONS__;
var echoEditorDrag = null;
var echoScrollDrag = null;
function echoClear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function echoRegion(state, parent, key, cls, style, clear) {
    var node = state.regions[key];
    if (!node) node = state.regions[key] = echoNode(parent, 'div', null, cls, style);
    if (clear) echoClear(node);
    return node;
}
function echoFixedText(state, parent, key, text, cls, style) {
    var node = state.regions[key];
    if (!node) node = state.regions[key] = echoText(parent, text, cls, style);
    else if (node.textContent !== String(text)) node.textContent = text;
    return node;
}
function echoScrollPosition(pane) { return pane.pendingTop !== null ? pane.pendingTop : pane.view.scrollTop || 0; }
function echoScrollStyle(node, key, value) { if (node.style[key] !== value) node.style[key] = value; }
function echoSyncScroll(pane, settled) {
    if (pane.state.closed || !pane.state.widget.IsActivated || pane.frame.style.display === 'none') return false;
    if (pane.awaitLayout && settled !== true) return false;
    var height = pane.view.clientHeight || pane.view.getBoundingClientRect().height || 0;
    var total = pane.view.scrollHeight || 0;
    var track = pane.track.clientHeight || pane.track.getBoundingClientRect().height || 0;
    if (!(height > 0 && total > 0 && track > 0)) { pane.awaitLayout = true; return false; }
    var range = Math.max(0, total - height);
    var size = range ? Math.min(track, Math.max(20, track * height / total)) : track;
    var position = Math.max(0, Math.min(range, echoScrollPosition(pane)));
    if (pane.pendingTop !== null) { pane.pendingTop = null; pane.view.scrollTop = position; }
    echoScrollStyle(pane.thumb, 'height', size + 'px');
    echoScrollStyle(pane.thumb, 'top', (range ? position / range * (track - size) : 0) + 'px');
    echoScrollStyle(pane.rail, 'opacity', range ? '1' : '0.25');
    var disabled = !range || !!pane.state.busy;
    if (pane.up.disabled !== disabled) pane.up.disabled = disabled;
    if (pane.down.disabled !== disabled) pane.down.disabled = disabled;
    pane.range = range; pane.travel = track - size; pane.awaitLayout = false;
    pane.state.positions[pane.key] = position;
    return true;
}
function echoFlushScrollLayout(state) {
    if (state.closed || !state.widget.IsActivated) return;
    var settled = false;
    try {
        if (typeof engine !== 'undefined' && typeof engine.executeImmediateLayoutSync === 'function') {
            engine.executeImmediateLayoutSync(); settled = true;
        }
    } catch (error) {
        if (!state.layoutError) { state.layoutError = short(error); record('scroll_layout_error', {error:state.layoutError}); }
    }
    state.layoutMode = settled ? 'batch_immediate_layout' : typeof ResizeObserver === 'function' ? 'resize_observer' : 'await_input';
    if (settled) state.scrollPanes.forEach(function (pane) { echoSyncScroll(pane, true); });
}
function echoScrollTo(pane, value) {
    if (!echoSyncScroll(pane, true)) return;
    pane.view.scrollTop = Math.max(0, Math.min(pane.range, value));
    echoSyncScroll(pane, true);
}
function echoScrollPane(state, parent, key, cls, padding) {
    var cached = state.paneCache[cls];
    if (cached) {
        cached.key = key; cached.pendingTop = state.positions[key] || 0; cached.awaitLayout = true;
        echoScrollStyle(cached.frame, 'display', 'flex');
        if (cls === 'echo-settings') {
            echoClear(cached.content);
            cached.content.echoPresets = null; cached.content.echoPresetButtons = null;
        }
        return cached.content;
    }
    var frame = echoNode(parent, 'div', null, 'echo-scroll-frame', 'flex:1;flex-shrink:1;flex-direction:row;width:100%;border:1px solid #193c4a;background-color:rgba(3,16,25,0.88);');
    var view = echoNode(frame, 'div', null, cls, 'flex:1;flex-shrink:1;height:100%;overflow:hidden;padding:' + padding + ';');
    var rail = echoNode(frame, 'div', null, 'echo-scrollbar', 'width:1.8rem;height:100%;padding:0.5rem 0.3rem;border-left:1px solid #193c4a;background-color:#061b27;');
    var content = echoNode(view, 'div', null, 'echo-scroll-content', 'width:100%;flex-shrink:0;');
    var pane = {key:key, state:state, frame:frame, view:view, content:content, rail:rail, pendingTop:state.positions[key] || 0, awaitLayout:true};
    function arrow(up) {
        var button = echoButton(state, rail, '', function () { echoScrollTo(pane, echoScrollPosition(pane) + (up ? -120 : 120)); }, false, 'width:100%;height:1.8rem;padding:0;margin:0;border:0;', false, {background:'transparent', hover:'#17475a', border:'transparent', focus:'#9ae9ff', corner:false});
        echoNode(button, 'div', null, '', 'width:0;height:0;border-left:0.35rem solid transparent;border-right:0.35rem solid transparent;border-' + (up ? 'bottom' : 'top') + ':0.45rem solid #78c8de;pointer-events:none;');
        return button;
    }
    pane.up = arrow(true);
    pane.track = echoNode(rail, 'div', null, 'echo-scroll-track', 'flex:1;flex-shrink:1;width:100%;margin:0.4rem 0;background-color:#0c2a38;border:1px solid #24536a;');
    pane.thumb = echoNode(pane.track, 'div', null, 'echo-scroll-thumb', 'position:absolute;left:0;top:0;width:100%;height:2rem;background-color:#78c8de;border:1px solid #a7e4f1;cursor:pointer;');
    pane.down = arrow(false);
    view.addEventListener('scroll', function () { echoSyncScroll(pane, true); });
    frame.addEventListener('mouseenter', function () { echoSyncScroll(pane, true); });
    frame.addEventListener('wheel', function (event) {
        var amount = Number(event.deltaY) || 0;
        if (event.deltaMode === 1) amount *= 20;
        else if (event.deltaMode === 2) amount *= view.clientHeight || 200;
        if (amount) { if (event.preventDefault) event.preventDefault(); event.stopPropagation(); echoScrollTo(pane, echoScrollPosition(pane) + amount); }
    });
    pane.thumb.addEventListener('mousedown', function (event) {
        if (event.button !== undefined && event.button !== 0) return;
        event.stopPropagation(); if (!echoSyncScroll(pane, true)) return;
        echoScrollDrag = {pane:pane, y:event.clientY, top:view.scrollTop || 0};
    });
    pane.track.addEventListener('mousedown', function (event) {
        if (event.target === pane.thumb || event.button !== undefined && event.button !== 0) return;
        event.stopPropagation(); if (!echoSyncScroll(pane, true)) return;
        var thumbTop = pane.thumb.getBoundingClientRect().top;
        echoScrollTo(pane, echoScrollPosition(pane) + (event.clientY < thumbTop ? -1 : 1) * (view.clientHeight || 200) * 0.9);
    });
    if (typeof ResizeObserver === 'function') {
        try {
            pane.observer = new ResizeObserver(function () { echoSyncScroll(pane, true); });
            pane.observer.observe(view); pane.observer.observe(content); pane.observer.observe(pane.track);
        } catch (error) {
            if (pane.observer) pane.observer.disconnect();
            pane.observer = null;
        }
    }
    state.paneCache[cls] = pane;
    state.scrollPanes.push(pane);
    return content;
}
function echoMarkRows(state) {
    (state.optionRows || []).forEach(function (item) {
        var key = 'value:' + item.mod.id + ':' + item.option.id, value = echoOptionValue(state, item.mod, item.option);
        var active = item.option.kind === 'boolean' && value === true || item.option.kind === 'choice' || !!state.drafts[key] || state.focusedOption === key;
        item.row.style.borderLeftColor = active ? '#c17e24' : 'transparent';
    });
}
function echoT(state, key, values) {
    var lang = echoLanguage(state), value = (echoTranslations[lang] || {})[key] || echoTranslations.en[key] || key;
    Object.keys(values || {}).forEach(function (name) { value = value.replace('{' + name + '}', String(values[name])); });
    return value;
}
function echoModText(state, object, field) {
    var texts = object[field + '_i18n'] || {}, language = echoLanguage(state);
    var candidates = [language].concat(echoLanguageEntry(language).aliases, [language.split('-')[0], 'en', 'default']);
    for (var i = 0; i < candidates.length; ++i) {
        if (Object.prototype.hasOwnProperty.call(texts, candidates[i])) return texts[candidates[i]];
    }
    return object[field] || '';
}
function echoModCondition(state, mod, condition, overrides) {
    if (!condition) return true;
    var dependency = mod.options.filter(function (o) { return o.identifier === condition.id; })[0];
    if (!dependency) return false;
    var value = overrides && Object.prototype.hasOwnProperty.call(overrides, dependency.identifier) ? overrides[dependency.identifier] : echoOptionValue(state, mod, dependency);
    return value === condition.equals;
}
function echoChoiceText(state, option, value) {
    var labels = option.choice_labels || {};
    return Object.prototype.hasOwnProperty.call(labels, value) ? echoModText(state, labels[value], 'name') : value;
}
function echoPresetValueValid(option, value) {
    if (!option || !option.editable) return false;
    if (option.kind === 'boolean') return typeof value === 'boolean';
    if (option.kind === 'choice') return option.choices.indexOf(value) >= 0;
    return option.kind === 'number' && typeof value === 'number' && isFinite(value) && value >= option.min && value <= option.max && (!option.integer || Math.floor(value) === value);
}
function echoNode(parent, tag, text, cls, style) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    node.style.cssText = 'display:flex;flex-direction:column;flex-shrink:0;box-sizing:border-box;min-width:0;min-height:0;position:relative;color:#bfd4dc;font-family:Industry-Medium,sans-serif;font-style:normal;font-weight:400;font-size:1.7rem;line-height:1.25;pointer-events:auto;' + (style || '');
    parent.appendChild(node);
    return node;
}
function echoText(parent, text, cls, style) {
    return echoNode(parent, 'div', text, cls, 'flex-direction:row;flex-wrap:wrap;white-space:pre-wrap;overflow-wrap:break-word;width:100%;' + (style || ''));
}
function echoButton(state, parent, text, fn, picked, style, disabled, palette) {
    palette = palette || {background:picked ? '#16495d' : '#092530', image:picked ? 'linear-gradient(180deg,#11364b,#205c74)' : 'linear-gradient(180deg,#081922,#092935)', hover:'#17475a', hoverImage:'linear-gradient(180deg,#0c2633,#154459)', border:picked ? '#8dddee' : '#365b6c', focus:'#9ae9ff'};
    var node = echoNode(parent, 'button', text, '', 'flex-direction:row;align-items:center;justify-content:center;border:1px solid ' + palette.border + ';background-color:' + palette.background + ';padding:0.7rem 1rem;margin:0 0.8rem 0 0;font-size:1.35rem;height:3.8rem;cursor:pointer;' + (style || ''));
    node.type = 'button'; node.disabled = !!disabled || state.busy;
    if (palette.image) node.style.backgroundImage = palette.image;
    if (palette.corner !== false && ['−','+','<','>'].indexOf(text) < 0) echoNode(node, 'div', null, 'echo-button-corner', 'position:absolute;right:0.3rem;bottom:0.3rem;width:0.5rem;height:0.5rem;background-color:' + (palette.cornerColor || '#246179') + ';pointer-events:none;');
    if (node.disabled) node.style.opacity = '0.45';
    node.echoInvoke = function () { if (!node.disabled && !state.closed && !state.busy) fn(); };
    node.addEventListener('click', function (event) {
        event.stopPropagation();
        if (!echoControllerPointerAllowed(state)) return;
        if (node.echoControllerTarget) echoControllerRemember(state, Object.assign({}, node.echoControllerTarget, {node:node}));
        node.echoInvoke();
    });
    node.addEventListener('mouseenter', function () { if (!node.disabled) { node.style.backgroundColor = palette.hover; node.style.backgroundImage = palette.hoverImage || palette.image || 'none'; } });
    node.addEventListener('mouseleave', function () { node.style.backgroundColor = palette.background; node.style.backgroundImage = palette.image || 'none'; });
    node.addEventListener('focus', function () { if (!node.disabled) { node.style.outline = '1px solid ' + palette.focus; node.style.outlineOffset = '2px'; } });
    node.addEventListener('blur', function () { node.style.outline = 'none'; });
    return node;
}
function echoModPalette(enabled, selected) {
    if (enabled === false) return {background:selected ? '#402719' : '#281d17', image:selected ? 'linear-gradient(180deg,#2d1c12,#55351e)' : 'linear-gradient(180deg,#211913,#352419)', hover:'#51321d', hoverImage:'linear-gradient(180deg,#3b2516,#674225)', border:selected ? '#efac63' : '#995827', focus:'#ffd0a1', text:'#ffdab6', muted:'#d3a47b', status:'#ffb86c', cornerColor:'#b67a3d'};
    if (enabled === true) return {background:selected ? '#10394a' : '#081c27', image:selected ? 'linear-gradient(180deg,#09222f,#104052)' : 'linear-gradient(180deg,#081922,#092935)', hover:'#17475a', hoverImage:'linear-gradient(180deg,#0c2633,#154459)', border:selected ? '#8dddee' : '#335d6c', focus:'#9ae9ff', text:'#c8e4ec', muted:'#7eb0c0', status:'#8acde0'};
    return {background:selected ? '#293139' : '#161e25', hover:'#343e46', border:selected ? '#b4c0c8' : '#62717b', focus:'#d9e1e7', text:'#d2d9df', muted:'#a0adb6', status:'#c2ccd3'};
}
function echoStatusPreview(state, mod) {
    var key = 'enabled:' + mod.id + ':', draft = state.drafts[key], saved = state.saved[key];
    if (!draft && !saved) return '';
    var unchanged = JSON.stringify(draft || null) === JSON.stringify(saved || null);
    return echoT(state, unchanged ? 'savedState' : 'draftState', {state:echoT(state, (draft ? draft.value : mod.enabled) ? 'on' : 'off')});
}
function echoAtmosphere(root) {
    // The native scene owns the animated hexagons. Keep our framing and a
    // translucent tint, without covering it with a static texture or solid fill.
    var atmosphere = echoNode(root, 'div', null, 'echo-atmosphere', 'position:absolute;left:0;right:0;top:0;bottom:0;overflow:hidden;background-image:linear-gradient(180deg,rgba(3,11,19,0.50) 0%,rgba(3,11,19,0.12) 50%,rgba(5,35,45,0.35) 100%);pointer-events:none;');
    echoNode(atmosphere, 'div', null, '', 'position:absolute;left:1.2%;right:1.2%;top:8%;bottom:4%;border-left:1px solid #164050;border-right:1px solid #164050;opacity:0.4;pointer-events:none;');
    ['left:1.2rem;top:1.8rem;border-left:2px solid #245062;border-top:2px solid #245062;', 'right:1.2rem;top:1.8rem;border-right:2px solid #245062;border-top:2px solid #245062;', 'left:1.2rem;bottom:1.8rem;border-left:2px solid #245062;border-bottom:2px solid #245062;', 'right:1.2rem;bottom:1.8rem;border-right:2px solid #245062;border-bottom:2px solid #245062;'].forEach(function (style) {
        echoNode(atmosphere, 'div', null, 'echo-frame-corner', 'position:absolute;width:2.5rem;height:2.2rem;opacity:0.75;pointer-events:none;' + style);
    });
}
function echoModSymbol(mod) {
    var words = String(mod.name || '').replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).filter(function (word) { return word && !/^(bl4|the|of|a|and)$/i.test(word); });
    var symbol = words.map(function (word) { return word.charAt(0); }).join('').slice(0,4).toUpperCase();
    return symbol || 'MOD';
}
function echoKey(command) { return command.kind + ':' + command.mod + ':' + (command.option || ''); }
function echoCopy(value) { return JSON.parse(JSON.stringify(value)); }
function echoMap(commands) { var result = {}; (commands || []).forEach(function (c) { result[echoKey(c)] = echoCopy(c); }); return result; }
function echoCommands(state) { return Object.keys(state.drafts).sort().map(function (key) { return state.drafts[key]; }); }
function echoDirty(state) {
    var a = state.drafts, b = state.saved, keys = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (k) { keys[k] = true; });
    return Object.keys(keys).filter(function (k) { return JSON.stringify(a[k] || null) !== JSON.stringify(b[k] || null); }).length;
}
function echoSetDraft(state, command, baseline) {
    var key = echoKey(command);
    if (command.kind !== 'action' && command.value === baseline) delete state.drafts[key];
    else state.drafts[key] = command;
    state.message = ''; echoFooter(state); echoMarkRows(state);
}
function echoOptionValue(state, mod, option) {
    var row = state.drafts['value:' + mod.id + ':' + option.id];
    return row ? row.value : option.value;
}
function echoSummary(state) {
    if (state.error) return state.error;
    if (state.busy) return echoT(state, 'loading');
    if (!state.active) return echoT(state, 'noSession');
    if (state.captureNotice) return echoT(state, state.captureNotice.key, state.captureNotice);
    if (Object.keys(state.invalid).length) return echoT(state, 'invalid');
    if (state.message) return echoT(state, state.message);
    var dirty = echoDirty(state), saved = Object.keys(state.saved).length;
    if (dirty) return echoT(state, 'draft', {n: dirty}) + (saved ? ' · ' + echoT(state, 'queued', {n: saved}) : '');
    if (saved) return echoT(state, 'queued', {n: saved});
    if (state.lastResult && state.lastResult.status !== 'applied') return echoT(state, 'lastFailed');
    return echoT(state, 'clean');
}
function echoFooter(state) {
    if (state.statusNode) {
        state.statusNode.textContent = echoSummary(state);
        state.statusNode.style.color = state.error || Object.keys(state.invalid).length ? '#ffbd83' : state.keyCapture || echoDirty(state) || Object.keys(state.saved).length ? '#d7b071' : '#7eb0c0';
    }
    if (state.saveButton) {
        state.saveButton.disabled = state.busy || !state.active || !!state.keyCapture || Object.keys(state.invalid).length > 0 || echoDirty(state) === 0;
        state.saveButton.style.opacity = state.saveButton.disabled ? '0.45' : '1';
    }
    if (state.discardButton) {
        state.discardButton.disabled = state.busy || echoDirty(state) === 0 && Object.keys(state.invalid).length === 0;
        state.discardButton.style.opacity = state.discardButton.disabled ? '0.45' : '1';
    }
}
function echoRequest(state, route, value, success) {
    if (state.closed || state.busy || !echoSyncPanelVisibility(state, 'request')) return;
    var generation = state.generation, xhr = new XMLHttpRequest(), finished = false;
    state.busy = true; state.error = ''; echoDraw(state);
    function done(error, reply) {
        if (finished) return; finished = true;
        if (state.closed || generation !== state.generation || !echoSyncPanelVisibility(state, 'response')) return;
        state.busy = false;
        if (error) state.error = echoT(state, error);
        else success(reply);
        echoDraw(state);
    }
    try {
        xhr.open('POST', 'http://127.0.0.1:19401/' + service + route, true);
        xhr.timeout = 4000; xhr.setRequestHeader('Content-Type', 'text/plain');
        xhr.onload = function () {
            try {
                var reply = JSON.parse(xhr.responseText);
                if (reply.service !== service || !reply.ok || xhr.status !== 200) return done(xhr.status === 409 ? 'conflict' : 'backendError');
                done('', reply);
            } catch (_) { done('backendError'); }
        };
        xhr.onerror = xhr.ontimeout = function () { done('backendError'); };
        xhr.send(JSON.stringify(Object.assign({token: token}, value)));
    } catch (_) { done('backendError'); }
}
function echoAdopt(state, reply, preserve) {
    var keep = preserve && reply.epoch === state.epoch && (echoDirty(state) > 0 || Object.keys(state.invalid).length > 0);
    if (reply.epoch !== state.epoch) state.message = '';
    state.catalog = reply.catalog; state.active = reply.active; state.epoch = reply.epoch;
    state.queueRevision = reply.queue_revision; state.saved = echoMap(reply.pending);
    if (!keep) { state.drafts = echoCopy(state.saved); state.invalid = {}; }
    state.lastResult = reply.last_result;
    if (reply.preferences) state.preference = reply.preferences.language;
}
function echoFetch(state) {
    echoRequest(state, '/catalog', {}, function (reply) {
        echoAdopt(state, reply, true);
        record('editor_catalog', {loaded: true, mod_count: state.catalog.mods.length, active: state.active});
    });
}
function echoSave(state, clear) {
    if (Object.keys(state.invalid).length) { state.error = echoT(state, 'invalid'); echoFooter(state); return; }
    var commands = clear ? [] : echoCopy(echoCommands(state));
    echoRequest(state, '/stage', {epoch: state.epoch, queue_revision: state.queueRevision, commands: commands}, function (reply) {
        echoAdopt(state, reply, false);
        state.message = clear ? 'queueCleared' : 'saved';
        record('editor_saved', {count: reply.pending.length, queue_revision: reply.queue_revision});
    });
}
function echoPrefer(state, language) {
    echoRequest(state, '/preferences', {language: language}, function (reply) { state.preference = reply.preferences.language; });
}
function echoNumber(state, mod, option, raw) {
    var key = 'value:' + mod.id + ':' + option.id;
    var source = String(raw).trim();
    if (echoLanguage(state) === 'de') source = source.replace(',', '.');
    var number = source === '' ? NaN : Number(source);
    if (!isFinite(number) || number < option.min || number > option.max || option.integer && Math.floor(number) !== number) {
        state.invalid[key] = {raw:String(raw)}; echoFooter(state); return null;
    }
    delete state.invalid[key];
    echoSetDraft(state, {kind: 'value', mod: mod.id, option: option.id, expected: option.value, value: number}, option.value);
    return number;
}
function echoNumberKey(event) {
    if (event.key === 'Enter' || event.key === 'Return' || event.code === 'Enter' || event.code === 'NumpadEnter' || event.keyCode === 13 || event.which === 13) return 'Enter';
    if (event.key === 'Escape' || event.key === 'Esc' || event.code === 'Escape' || event.keyCode === 27 || event.which === 27) return 'Escape';
    return '';
}
function echoTextFocusError(state, phase, error) {
    if (!state.textFocusErrors) state.textFocusErrors = {};
    if (!state.textFocusErrors[phase]) {
        state.textFocusErrors[phase] = short(error);
        record('text_input_focus_error', {phase:phase, error:state.textFocusErrors[phase]});
    }
}
function echoIsWindowFocusEvent(event) {
    // Window capture listeners also receive descendant focus/blur events.
    // Only loss/return of the Window itself is an application focus boundary.
    return !!event && event.target === window;
}
function echoReleaseTextFocus(state, input) {
    var held = state.nativeTextInput;
    if (!held || input && held.input !== input) { echoControllerEscapeSync(state); return; }
    state.nativeTextInput = null;
    try {
        held.owner.OnTextInputFocusedChanged(held.input, false, held.ident);
        state.textFocusReleases = (state.textFocusReleases || 0) + 1;
    } catch (error) { echoTextFocusError(state, 'release', error); }
    echoControllerEscapeSync(state);
}
function echoAcquireTextFocus(state, input) {
    if (state.nativeTextInput && state.nativeTextInput.input === input) return;
    echoReleaseTextFocus(state);
    if (typeof state.widget.OnTextInputFocusedChanged !== 'function') {
        echoTextFocusError(state, 'acquire', 'Native widget text-focus helper unavailable'); return;
    }
    var held = {owner:state.widget, input:input, ident:input.id};
    state.nativeTextInput = held;
    try {
        held.owner.OnTextInputFocusedChanged(input, true, held.ident);
        state.textFocusAcquires = (state.textFocusAcquires || 0) + 1;
    } catch (error) {
        echoTextFocusError(state, 'acquire', error);
        echoReleaseTextFocus(state, input);
    }
    echoControllerEscapeSync(state);
}
function echoNumericEditor(state, parent, mod, option) {
    var wrap = echoNode(parent, 'div', null, 'echo-number', 'flex-direction:row;align-items:center;width:35rem;');
    var value = echoOptionValue(state, mod, option), input, fill, thumb;
    var key = 'value:' + mod.id + ':' + option.id, editor = {}, epoch = state.epoch, generation = state.generation;
    var beforeEdit, beforeInvalid, finishKey = '', confirmed = false;
    state.numberEditors[key] = editor;
    function available() {
        return state.numberEditors[key] === editor && state.epoch === epoch && state.generation === generation &&
            !state.busy && state.active && state.widget.IsActivated && !state.closed;
    }
    function remember() { beforeEdit = state.drafts[key] ? echoCopy(state.drafts[key]) : null;
        beforeInvalid = state.invalid[key] ? echoCopy(state.invalid[key]) : null; }
    function meter(v) {
        var fraction = option.max === option.min ? 0 : (v - option.min) / (option.max - option.min);
        fill.style.width = String(fraction * 100) + '%'; thumb.style.left = String(fraction * 100) + '%';
    }
    function show(v) {
        input.value = String(v);
        input.style.borderColor = '#365b6c'; meter(v);
    }
    function commit() {
        if (!available()) return false;
        var n = echoNumber(state, mod, option, input.value);
        input.style.borderColor = n === null ? '#dd8866' : '#365b6c';
        if (n === null) return false;
        show(n); return true;
    }
    function step(amount) {
        var n = Number(echoOptionValue(state, mod, option)) + amount * option.step;
        n = Math.max(option.min, Math.min(option.max, Math.round(n * 100000000) / 100000000));
        if (option.integer) n = Math.round(n);
        var valid = echoNumber(state, mod, option, n); if (valid !== null) show(valid);
    }
    echoControllerOptionButton(state, wrap, mod, option, 'decrease', '−', function () { if (available()) step(-1); }, false, 'width:3rem;padding:0;height:3.2rem;', !state.active);
    var track = echoNode(wrap, 'div', null, 'echo-track', 'width:14rem;height:3.2rem;justify-content:center;margin-right:1rem;cursor:pointer;');
    var rail = echoNode(track, 'div', null, '', 'width:100%;height:0.5rem;background-color:#153745;border:1px solid #375a6b;pointer-events:none;');
    fill = echoNode(rail, 'div', null, '', 'height:100%;background-color:#458caa;pointer-events:none;');
    thumb = echoNode(rail, 'div', null, '', 'position:absolute;top:-0.6rem;margin-left:-0.5rem;width:1rem;height:1.5rem;background-color:#ade9f5;border:1px solid #9ae8ff;pointer-events:none;');
    input = echoNode(wrap, 'input', null, 'echo-value', 'width:7rem;height:3.5rem;padding:0.4rem;color:#b8efff;border:1px solid #365b6c;background-color:#041722;font-size:1.7rem;text-align:center;margin-right:0.6rem;');
    state.textInputSerial = (state.textInputSerial || 0) + 1;
    input.id = 'echo_number_' + state.textInputSerial;
    input.type = 'text'; input.value = String(value); input.disabled = state.busy || !state.active;
    editor.input = input;
    remember();
    input.addEventListener('focus', function () {
        if (available()) { remember(); finishKey = ''; confirmed = false; echoAcquireTextFocus(state, input); }
    });
    function pointerEdit(event) {
        if (!available() || event.button !== undefined && event.button !== 0) return;
        // A click on the same DOM-focused input need not dispatch another focus
        // event. Reconcile native ownership explicitly after Enter/cancel, even
        // when blur kept the activeElement or the Enter keyup was not delivered.
        var rearm = confirmed;
        if (rearm) echoReleaseTextFocus(state, input);
        if (document.activeElement !== input && typeof input.focus === 'function') input.focus();
        if (document.activeElement === input) {
            if (rearm || !state.nativeTextInput || state.nativeTextInput.input !== input) {
                remember(); finishKey = ''; confirmed = false;
                echoAcquireTextFocus(state, input);
                if (rearm) state.textInputRearms = (state.textInputRearms || 0) + 1;
            }
        }
    }
    input.addEventListener('mousedown', pointerEdit);
    input.addEventListener('click', pointerEdit);
    input.echoTextOwner = state;
    input.echoResumeText = function () { if (available()) echoAcquireTextFocus(state, input); };
    input.echoCancelText = function () {
        if (!available()) return;
        if (beforeEdit) state.drafts[key] = echoCopy(beforeEdit); else delete state.drafts[key];
        if (beforeInvalid) state.invalid[key] = echoCopy(beforeInvalid); else delete state.invalid[key];
        show(echoOptionValue(state, mod, option));
        if (beforeInvalid) { input.value = beforeInvalid.raw; input.style.borderColor = '#dd8866'; }
        if (typeof input.blur === 'function') input.blur();
        echoReleaseTextFocus(state, input); echoFooter(state); echoMarkRows(state);
    };
    input.echoConfirmText = function () {
        if (!commit()) return false;
        remember(); if (typeof input.blur === 'function') input.blur();
        echoReleaseTextFocus(state, input); return true;
    };
    input.addEventListener('input', function () {
        if (!available()) return;
        state.textInputEvents = (state.textInputEvents || 0) + 1;
        var n = echoNumber(state, mod, option, input.value);
        input.style.borderColor = n === null ? '#dd8866' : '#365b6c';
        // Updating .value while typing resets the caret/selection in Cohtml.
        if (n !== null) meter(n);
    });
    input.addEventListener('change', commit);
    input.addEventListener('blur', function () { finishKey = ''; commit(); echoReleaseTextFocus(state, input); });
    input.addEventListener('keydown', function (event) {
        if (!available()) return;
        state.textKeyEvents = (state.textKeyEvents || 0) + 1;
        var pressed = echoNumberKey(event); finishKey = '';
        if (!pressed || event.isComposing || event.keyCode === 229) return;
        event.preventDefault(); event.stopPropagation();
        // Enter confirms the draft in place. Keep both DOM and native text
        // focus: the next character belongs to this same editable field.
        if (pressed === 'Enter') {
            if (commit()) {
                remember(); state.textEnterConfirmed = (state.textEnterConfirmed || 0) + 1;
                if (state.textEnterConfirmed <= 16) record('editor_text_confirmed', {
                    layout_revision:'1.2.2', dom_focus:document.activeElement === input,
                    native_focus:!!state.nativeTextInput && state.nativeTextInput.input === input,
                    key_shape:event.code || (event.keyCode === 13 || event.which === 13 ? 'code13' : 'Enter')});
            }
        }
        else {
            if (beforeEdit) state.drafts[key] = echoCopy(beforeEdit); else delete state.drafts[key];
            delete state.invalid[key]; state.message = '';
            show(echoOptionValue(state, mod, option)); echoFooter(state); echoMarkRows(state);
            finishKey = pressed; confirmed = true;
        }
    });
    // Consume Enter's release without ending text entry. Escape still ends it.
    ['keypress', 'keyup'].forEach(function (phase) {
        input.addEventListener(phase, function (event) {
            if (!available()) return;
            var pressed = echoNumberKey(event);
            if (!pressed || event.isComposing || event.keyCode === 229) return;
            event.preventDefault(); event.stopPropagation();
            if (phase === 'keyup' && finishKey === pressed) {
                finishKey = ''; remember();
                if (typeof input.blur === 'function') input.blur();
                echoReleaseTextFocus(state, input);
            }
        });
    });
    function drag(event) {
        if (state.busy || !state.active || !state.widget.IsActivated || state.closed) return;
        var rect = track.getBoundingClientRect(); if (!rect.width) return;
        var portion = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        var number = option.min + Math.round(portion * (option.max - option.min) / option.step) * option.step;
        number = Math.max(option.min, Math.min(option.max, Math.round(number * 100000000) / 100000000));
        if (option.integer) number = Math.round(number);
        var n = echoNumber(state, mod, option, number); if (n !== null) show(n);
    }
    track.addEventListener('mousedown', function (event) { if (event.button !== undefined && event.button !== 0) return; event.stopPropagation(); if (state.busy || !state.active) return; echoEditorDrag = {state: state, move: drag}; drag(event); });
    editor.available = available; editor.step = step;
    editor.show = function () { show(echoOptionValue(state, mod, option));
        if (state.invalid[key]) { input.value = state.invalid[key].raw; input.style.borderColor = '#dd8866'; } };
    echoControllerTag(track, {id:key, key:key, row:option.id, slot:1, kind:'number', region:'options', editor:editor, preferred:true});
    echoControllerOptionButton(state, wrap, mod, option, 'increase', '+', function () { if (available()) step(1); }, false, 'width:3rem;padding:0;height:3.2rem;', !state.active);
    show(value);
    var invalid = state.invalid['value:' + mod.id + ':' + option.id];
    if (invalid) { input.value = invalid.raw; input.style.borderColor = '#dd8866'; }
}
// Decode a bounded keyboard subset. DOM code names are physical positions;
// letters deliberately use the logical key/keyCode, preserving QWERTZ Y/Z.
// OEM punctuation, unidentified modifier sides and gamepad events are not guessed.
function echoCaptureKey(event) {
    var key = event.key || '', code = event.code || '', number = event.keyCode || event.which || 0;
    var location = event.location || 0, match, side;
    var digits = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
    function modifier(name) {
        if (event.metaKey || event.ctrlKey && name.indexOf('Control') === -1 ||
            event.shiftKey && name.indexOf('Shift') === -1 || event.altKey && name.indexOf('Alt') === -1) return '';
        return name;
    }
    if (event.isComposing || number === 229 || key === 'Dead' || key === 'Process') return '';
    if (key === 'Escape' || key === 'Esc' || code === 'Escape' || number === 27) return 'Escape';
    match = /^(Shift|Control|Alt)(Left|Right)$/.exec(code);
    if (match) return modifier(match[2] + match[1]);
    if (number === 160 || number === 161) return modifier(number === 160 ? 'LeftShift' : 'RightShift');
    if (number === 162 || number === 163) return modifier(number === 162 ? 'LeftControl' : 'RightControl');
    if (number === 164 || number === 165) return modifier(number === 164 ? 'LeftAlt' : 'RightAlt');
    side = location === 1 ? 'Left' : location === 2 ? 'Right' : '';
    if (key === 'Shift' || number === 16) return side ? modifier(side + 'Shift') : '';
    if (key === 'Control' || number === 17) return side ? modifier(side + 'Control') : '';
    if (key === 'Alt' || number === 18) return side ? modifier(side + 'Alt') : '';
    // Existing SDK binds represent a single FKey, not a chord.
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return '';
    match = /^Numpad([0-9])$/.exec(code);
    if (match) {
        // With Num Lock off the same physical key can arrive as Insert/End/etc.
        // Require its digit event rather than incorrectly binding NumPadZero.
        if (number && (number < 96 || number > 105)) return '';
        if (key && key !== 'Unidentified' && key !== match[1]) return '';
        return 'NumPad' + digits[Number(match[1])];
    }
    if (number >= 96 && number <= 105) return 'NumPad' + digits[number - 96];
    var keypad = {NumpadAdd:'Add',NumpadSubtract:'Subtract',NumpadMultiply:'Multiply',NumpadDivide:'Divide',NumpadDecimal:'Decimal',NumpadEnter:'Enter'};
    var keypadCodes = {NumpadAdd:107,NumpadSubtract:109,NumpadMultiply:106,NumpadDivide:111,NumpadDecimal:110,NumpadEnter:13};
    if (keypad[code]) return number && number !== keypadCodes[code] ? '' : keypad[code];
    var keypadNumbers = {106:'Multiply',107:'Add',109:'Subtract',110:'Decimal',111:'Divide'};
    if (keypadNumbers[number]) return keypadNumbers[number];
    if (location === 3 && number !== 13) return '';
    match = /^F([1-9]|1[0-9]|2[0-4])$/.exec(key);
    if (match) return key;
    if (number >= 112 && number <= 135) return 'F' + (number - 111);
    if (/^[a-z]$/i.test(key)) return key.toUpperCase();
    if (/^[0-9]$/.test(key)) return digits[Number(key)];
    if (number >= 65 && number <= 90) return String.fromCharCode(number);
    if (number >= 48 && number <= 57) return digits[number - 48];
    var names = {Enter:'Enter',Return:'Enter',Tab:'Tab',Backspace:'BackSpace',Delete:'Delete',Del:'Delete',Insert:'Insert',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down',' ':'SpaceBar',Spacebar:'SpaceBar',CapsLock:'CapsLock',NumLock:'NumLock',ScrollLock:'ScrollLock',Pause:'Pause',PrintScreen:'PrintScreen'};
    if (names[key]) return names[key];
    var legacy = {8:'BackSpace',9:'Tab',13:'Enter',19:'Pause',20:'CapsLock',32:'SpaceBar',33:'PageUp',34:'PageDown',35:'End',36:'Home',37:'Left',38:'Up',39:'Right',40:'Down',44:'PrintScreen',45:'Insert',46:'Delete',144:'NumLock',145:'ScrollLock'};
    return legacy[number] || '';
}
function echoCancelCapture(state) {
    if (state.keyCapture) state.keyCapture.close();
}
// Capture reuses the already rendered, known-working key-name editor. No new
// modal, overlay, input node or global listener is needed for keyboard routing.
function echoStartCapture(state, mod, option) {
    var target = 'value:' + mod.id + ':' + option.id, editor = state.keyEditors[target];
    state.captureClicks = (state.captureClicks || 0) + 1;
    record('editor_capture_clicked', {editable:!!option.editable, active:!!state.active,
        activated:!!state.widget.IsActivated, busy:!!state.busy, editor_present:!!editor, editor_ready:!!editor && editor.available()});
    if (state.keyCapture && state.keyCapture.input === (editor && editor.input)) { state.keyCapture.close('cancel'); return; }
    echoCancelCapture(state);
    if (state.busy || !state.active || state.closed || !state.widget.IsActivated || !option.editable || option.kind !== 'keybind' || !editor || !editor.available()) {
        state.error = echoT(state, 'captureStartError'); echoFooter(state); return;
    }
    var input = editor.input, button = editor.captureButton;
    var epoch = state.epoch, generation = state.generation;
    var savedText = input.value, savedPlaceholder = input.placeholder, savedClass = input.className;
    var capture = {input:input, down:{}, pending:null, blocked:false, phase:'waiting_focus', domFocused:document.activeElement === input};
    state.keyCapture = capture; state.error = ''; state.message = '';
    input.className = savedClass + ' echo-key-capturing';
    input.value = '…'; input.style.borderColor = '#e5a451';
    button.textContent = echoT(state, 'cancelCaptureInline');
    function current() {
        return state.keyCapture === capture && state.epoch === epoch && state.generation === generation &&
            editor.available() && !state.busy && state.active && state.widget.IsActivated && !state.closed;
    }
    function token(event) {
        var number = event.keyCode || event.which || 0, code = event.code || '';
        // Cohtml may omit optional key/code text on release. A stable virtual
        // key is enough, except generic modifiers which also need their side.
        if (number) {
            var side = event.location === 1 || /Left$/.test(code) ? 'L' : event.location === 2 || /Right$/.test(code) ? 'R' : '?';
            return 'vk:' + number + (number === 16 || number === 17 || number === 18 ? ':' + side : '');
        }
        return code ? 'code:' + code : 'key:' + String(event.key || '').toUpperCase();
    }
    function consume(event) { event.preventDefault(); event.stopPropagation(); }
    function trace(stage, event) {
        var info = {stage:stage,phase:capture.phase,dom_focus:document.activeElement === input,
            native_focus:!!state.nativeTextInput && state.nativeTextInput.input === input,
            focus_event:capture.domFocused,native_helper:typeof state.widget.OnTextInputFocusedChanged === 'function',
            existing_editor:true};
        try { var rect = input.getBoundingClientRect(); info.box = {width:rect.width,height:rect.height}; } catch (_) {}
        if (event) info.event_shape = {key_code:Number(event.keyCode || event.which || 0),location:Number(event.location || 0),
            has_key:!!event.key,has_code:!!event.code,repeat:!!event.repeat,composing:!!event.isComposing};
        if (!state.captureFocusTrace) state.captureFocusTrace = [];
        if (state.captureFocusTrace.length < 32) { state.captureFocusTrace.push(info); try { record('editor_capture_focus',info); } catch (_) {} }
    }
    function notice(message) {
        state.captureNotice = {key:message,name:echoModText(state, option, 'name')}; echoFooter(state);
    }
    function waiting() {
        capture.phase = 'waiting_focus'; input.value = '…'; notice('captureClickInline');
    }
    function acquire() {
        if (!current() || document.activeElement !== input && !capture.domFocused) return false;
        echoAcquireTextFocus(state,input);
        if (!current()) { echoReleaseTextFocus(state,input); return false; }
        if (!state.nativeTextInput || state.nativeTextInput.input !== input) {
            capture.phase = 'focus_error'; notice('captureFocusError'); return false;
        }
        if (capture.phase !== 'listening') notice('captureWaitInline');
        capture.phase = 'listening'; return true;
    }
    function requestFocus(stage) {
        if (!current()) return;
        try { input.focus(); }
        catch (error) { echoTextFocusError(state,'capture_focus',error); }
        if (!current()) return;
        if (!acquire() && capture.phase !== 'focus_error') waiting();
        trace(stage);
    }
    capture.close = function (reason) {
        if (state.keyCapture !== capture) return;
        trace(reason || 'cancel');
        state.keyCapture = null; state.captureNotice = null;
        capture.phase = 'closed'; capture.pending = null; capture.down = {}; capture.domFocused = false;
        input.value = savedText; input.placeholder = savedPlaceholder; input.className = savedClass;
        input.style.borderColor = state.invalid[target] ? '#dd8866' : '#365b6c';
        button.textContent = echoT(state,'captureKey');
        echoReleaseTextFocus(state,input); echoFooter(state);
        // Keep DOM focus; ordinary manual editing can resume on the next pointer
        // interaction. Never manufacture blur/change callbacks from a close.
    };
    capture.handle = function (phase,event) {
        if (!current()) return;
        if (phase === 'focus') {
            capture.domFocused = true; acquire(); trace('focus'); return;
        }
        if (phase === 'blur') {
            capture.domFocused = false; capture.pending = null; capture.down = {}; capture.blocked = false;
            echoReleaseTextFocus(state,input); waiting(); trace('blur'); return;
        }
        if (phase === 'pointer') {
            if (event.button === undefined || event.button === 0) requestFocus('pointer'); return;
        }
        if (phase === 'input' || phase === 'change') { input.value = capture.pending ? capture.pending.name : '…'; return; }
        consume(event);
        if (phase === 'keypress') return;
        if (phase === 'keydown') {
            if (!acquire()) { trace('keydown_without_focus',event); return; }
            state.captureKeyDowns = (state.captureKeyDowns || 0) + 1;
            if (event.repeat || event.isComposing || event.keyCode === 229) return;
            var id = token(event), name = echoCaptureKey(event);
            capture.down[id] = true;
            if (name === 'Escape') { capture.pending = {token:id,name:name}; return; }
            if (capture.blocked || Object.keys(capture.down).length > 1) {
                capture.blocked = true; capture.pending = null; input.value = '…'; notice('captureSingle'); trace('chord',event); return;
            }
            if (!name) {
                capture.pending = null; notice('captureUnsupported');
                state.captureUnsupported = (state.captureUnsupported || 0) + 1; trace('unsupported',event); return;
            }
            capture.pending = {token:id,name:name}; input.value = name; notice('captureReleaseInline'); trace('keydown',event); return;
        }
        if (phase !== 'keyup') return;
        state.captureKeyUps = (state.captureKeyUps || 0) + 1; trace('keyup',event);
        if (capture.phase !== 'listening' || !state.nativeTextInput || state.nativeTextInput.input !== input) return;
        var id = token(event), pending = capture.pending;
        delete capture.down[id];
        if (pending && pending.token === id && pending.name === 'Escape') { capture.close('escape'); return; }
        if (capture.blocked) {
            if (!Object.keys(capture.down).length) { capture.blocked = false; notice('captureWaitInline'); }
            return;
        }
        if (!pending || pending.token !== id) { notice('captureReleaseMismatch'); return; }
        var name = pending.name;
        capture.close('accepted');
        delete state.invalid[target];
        echoSetDraft(state,{kind:'value',mod:mod.id,option:option.id,expected:option.value,value:name},option.value);
        state.captureAccepted = (state.captureAccepted || 0) + 1;
        record('editor_key_capture',{accepted:true,input_kind:'keyboard',existing_editor:true,applies_on:'saved_inventory_close'});
        echoDraw(state);
    };
    echoControllerEscapeSync(state);
    waiting(); trace('armed'); requestFocus('open');
}
function echoCaptureEditorEvent(state, input, phase, event) {
    var capture = state.keyCapture;
    if (!capture || capture.input !== input) return false;
    capture.handle(phase,event); return true;
}
function echoKeybindEditor(state, parent, mod, option) {
    var key = 'value:' + mod.id + ':' + option.id, editor = {}, epoch = state.epoch, generation = state.generation;
    var beforeEdit = null, beforeInvalid = null, escape = false;
    state.keyEditors[key] = editor;
    function available() {
        return state.keyEditors[key] === editor && state.epoch === epoch && state.generation === generation &&
            !state.busy && state.active && state.widget.IsActivated && !state.closed;
    }
    function remember() { beforeEdit = state.drafts[key] ? echoCopy(state.drafts[key]) : null;
        beforeInvalid = state.invalid[key] ? echoCopy(state.invalid[key]) : null; }
    function show() {
        var value = echoOptionValue(state, mod, option);
        input.value = value === null ? '' : String(value);
        input.style.borderColor = '#365b6c';
    }
    function commit(normalize) {
        if (!available() || state.keyCapture && state.keyCapture.input === input) return false;
        var name = input.value.trim(), value = name || null;
        var valid = value === null || /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(name) && ['None', 'Invalid', 'AnyKey'].indexOf(name) === -1;
        input.style.borderColor = valid ? '#365b6c' : '#dd8866';
        if (!valid) { state.invalid[key] = {raw:input.value}; echoFooter(state); return false; }
        delete state.invalid[key];
        echoSetDraft(state, {kind:'value', mod:mod.id, option:option.id, expected:option.value, value:value}, option.value);
        if (normalize) show();
        return true;
    }
    var input = echoNode(parent, 'input', null, 'echo-keybind-value', 'width:23rem;height:3.5rem;padding:0.5rem 0.8rem;color:#b8efff;border:1px solid #365b6c;background-color:#041722;font-size:1.5rem;margin-right:0.8rem;');
    state.textInputSerial = (state.textInputSerial || 0) + 1;
    input.id = 'echo_key_' + state.textInputSerial;
    editor.input = input; editor.available = available;
    input.type = 'text'; input.maxLength = 128; input.placeholder = echoT(state, 'unbound');
    input.disabled = state.busy || !state.active;
    show(); remember();
    if (state.invalid[key]) { input.value = state.invalid[key].raw; input.style.borderColor = '#dd8866'; }
    input.echoTextOwner = state;
    input.echoResumeText = function () { if (available()) echoAcquireTextFocus(state, input); };
    input.echoCancelText = function () {
        if (!available()) return;
        if (beforeEdit) state.drafts[key] = echoCopy(beforeEdit); else delete state.drafts[key];
        if (beforeInvalid) state.invalid[key] = echoCopy(beforeInvalid); else delete state.invalid[key];
        show(); if (beforeInvalid) { input.value = beforeInvalid.raw; input.style.borderColor = '#dd8866'; }
        if (typeof input.blur === 'function') input.blur();
        echoReleaseTextFocus(state, input); echoFooter(state); echoMarkRows(state);
    };
    input.echoConfirmText = function () {
        if (!commit(true)) return false;
        remember(); if (typeof input.blur === 'function') input.blur();
        echoReleaseTextFocus(state, input); return true;
    };
    echoControllerTag(input, {id:key, key:key, row:option.id, slot:0, kind:'text', region:'options', editor:editor});
    input.addEventListener('focus', function (event) {
        if (echoCaptureEditorEvent(state,input,'focus',event)) return;
        if (available()) { remember(); escape = false; echoAcquireTextFocus(state, input); }
    });
    function pointer(event) {
        if (echoCaptureEditorEvent(state,input,'pointer',event)) return;
        if (!available() || event.button !== undefined && event.button !== 0) return;
        if (document.activeElement !== input) input.focus();
        if (document.activeElement === input) echoAcquireTextFocus(state, input);
    }
    input.addEventListener('mousedown', pointer);
    input.addEventListener('click', pointer);
    input.addEventListener('input', function (event) { if (!echoCaptureEditorEvent(state,input,'input',event)) commit(false); });
    input.addEventListener('change', function (event) { if (!echoCaptureEditorEvent(state,input,'change',event)) commit(true); });
    input.addEventListener('blur', function (event) {
        if (echoCaptureEditorEvent(state,input,'blur',event)) return;
        commit(true); echoReleaseTextFocus(state, input);
    });
    input.addEventListener('keydown', function (event) {
        if (echoCaptureEditorEvent(state,input,'keydown',event)) return;
        if (!available() || event.isComposing || event.keyCode === 229) return;
        var pressed = echoNumberKey(event);
        if (!pressed) return;
        event.preventDefault(); event.stopPropagation();
        if (pressed === 'Enter') { if (commit(true)) remember(); }
        else {
            if (beforeEdit) state.drafts[key] = echoCopy(beforeEdit); else delete state.drafts[key];
            delete state.invalid[key]; state.message = ''; show(); echoFooter(state); echoMarkRows(state); escape = true;
        }
    });
    ['keypress', 'keyup'].forEach(function (phase) {
        input.addEventListener(phase, function (event) {
            if (echoCaptureEditorEvent(state,input,phase,event)) return;
            if (!available() || !echoNumberKey(event) || event.isComposing || event.keyCode === 229) return;
            event.preventDefault(); event.stopPropagation();
            if (phase === 'keyup' && escape && echoNumberKey(event) === 'Escape') { escape = false; input.blur(); echoReleaseTextFocus(state, input); }
        });
    });
    echoControllerOptionButton(state, parent, mod, option, 'unbind', echoT(state, 'unbind'), function () {
        delete state.invalid[key];
        echoSetDraft(state, {kind:'value', mod:mod.id, option:option.id, expected:option.value, value:null}, option.value);
        echoDraw(state);
    }, false, 'width:14rem;font-size:1.1rem;padding:0.5rem;', !state.active);
    editor.captureButton = echoControllerOptionButton(state, parent, mod, option, 'capture', echoT(state, 'captureKey'), function () {
        try { echoStartCapture(state, mod, option); }
        catch (error) {
            echoCancelCapture(state); state.error = echoT(state,'captureStartError'); echoFooter(state);
            record('editor_capture_error',{error:short(error)});
        }
    }, false, 'width:37.8rem;height:2.8rem;margin-top:0.5rem;font-size:1.1rem;padding:0.4rem;', !state.active);
}
function echoDrawOption(state, parent, mod, option) {
    if (!echoModCondition(state, mod, option.visible_when)) return;
    if (option.enabled_when) {
        var dependency = mod.options.filter(function (o) { return o.identifier === option.enabled_when.id; })[0];
        if (dependency && echoOptionValue(state, mod, dependency) !== option.enabled_when.equals) option = Object.assign({}, option, {editable:false, can_run:false});
    }
    var row = echoNode(parent, 'div', null, 'echo-option-row', 'flex-direction:row;align-items:center;justify-content:space-between;width:100%;min-height:8.8rem;padding:1.3rem 1.4rem 1.3rem 1.1rem;border-left:0.3rem solid transparent;border-bottom:1px solid #1c3948;background-image:linear-gradient(90deg,rgba(7,23,34,0.5),rgba(9,32,44,0.28));');
    state.optionRows.push({row:row, mod:mod, option:option});
    row.addEventListener('focus', function () { state.focusedOption = 'value:' + mod.id + ':' + option.id; echoMarkRows(state); }, true);
    row.addEventListener('blur', function () { state.focusedOption = ''; echoMarkRows(state); }, true);
    row.addEventListener('mouseenter', function () { row.style.backgroundImage = 'linear-gradient(90deg,rgba(11,42,57,0.8),rgba(13,44,60,0.6))'; row.style.borderBottomColor = '#386175'; });
    row.addEventListener('mouseleave', function () { row.style.backgroundImage = 'linear-gradient(90deg,rgba(7,23,34,0.5),rgba(9,32,44,0.28))'; row.style.borderBottomColor = '#1c3948'; });
    var labels = echoNode(row, 'div', null, '', 'flex:1;flex-shrink:1;padding-right:2rem;');
    echoText(labels, echoModText(state, option, 'name'), '', 'font-size:1.8rem;');
    if (echoModText(state, option, 'description')) echoText(labels, echoModText(state, option, 'description'), '', 'font-size:1.2rem;color:#7393a2;margin-top:0.5rem;');
    if (option.kind === 'number' && option.editable) echoText(labels, echoT(state, 'range', option), '', 'font-size:1rem;color:#53707e;margin-top:0.4rem;');
    var controls = echoNode(row, 'div', null, 'echo-option-control', 'width:39rem;flex-direction:row;justify-content:flex-end;align-items:center;flex-wrap:wrap;');
    var value = echoOptionValue(state, mod, option);
    if (option.editable && option.kind === 'number') {
        echoNumericEditor(state, controls, mod, option);
        if (option.unit) echoText(controls, echoModText(state, option, 'unit'), 'echo-unit', 'width:3rem;margin-left:0.6rem;font-size:1rem;color:#6c93a4;');
    }
    else if (option.editable && option.kind === 'keybind') {
        echoKeybindEditor(state, controls, mod, option);
        echoText(labels, echoT(state, 'keyHint'), '', 'font-size:1.1rem;color:#7393a2;margin-top:0.4rem;');
    }
    else if (option.editable && option.kind === 'boolean') {
        var toggle = echoControllerOptionButton(state, controls, mod, option, 'toggle', echoModText(state, option, value ? 'true_text' : 'false_text') || echoT(state, value ? 'yes' : 'no'), function () {
        echoSetDraft(state, {kind: 'value', mod: mod.id, option: option.id, expected: option.value, value: !value}, option.value); echoDraw(state);
        }, !!value, 'width:10rem;font-size:1.2rem;letter-spacing:0.12rem;padding-left:2.8rem;', !state.active);
        echoNode(toggle, 'div', null, '', 'position:absolute;left:1.2rem;top:1.5rem;width:0.6rem;height:0.6rem;background-color:' + (value ? '#9ce8f5' : '#426270') + ';pointer-events:none;');
    }
    else if (option.editable && option.kind === 'choice') {
        var choice = echoNode(controls, 'div', null, 'echo-choice', 'width:32rem;flex-direction:row;align-items:center;');
        var choiceKey = 'value:' + mod.id + ':' + option.id, choiceEditor = {}, choiceEpoch = state.epoch, choiceGeneration = state.generation;
        state.choiceEditors[choiceKey] = choiceEditor;
        function cycle(direction) {
            if (!option.choices.length) return;
            var at = option.choices.indexOf(echoOptionValue(state, mod, option)), next = (at + direction + option.choices.length) % option.choices.length;
            echoSetDraft(state, {kind:'value', mod:mod.id, option:option.id, expected:option.value, value:option.choices[next]}, option.value);
            choiceEditor.show(); echoFooter(state); echoMarkRows(state);
        }
        echoButton(state, choice, '<', function () { cycle(-1); echoDraw(state); }, false, 'width:3rem;padding:0;', !state.active);
        var choiceLabel = echoText(choice, echoChoiceText(state, option, value), '', 'width:24rem;justify-content:center;font-size:1.4rem;');
        echoButton(state, choice, '>', function () { cycle(1); echoDraw(state); }, false, 'width:3rem;padding:0;', !state.active);
        choiceEditor.show = function () { choiceLabel.textContent = echoChoiceText(state, option, echoOptionValue(state, mod, option)); };
        choiceEditor.step = cycle;
        choiceEditor.available = function () { return state.choiceEditors[choiceKey] === choiceEditor && state.epoch === choiceEpoch &&
            state.generation === choiceGeneration && !state.busy && state.active && state.widget.IsActivated && !state.closed; };
        echoControllerTag(choice, {id:choiceKey, key:choiceKey, row:option.id, slot:0, kind:'choice', region:'options', editor:choiceEditor});
    } else if (option.kind === 'action' && option.can_run) {
        var key = 'action:' + mod.id + ':' + option.id, queued = !!state.drafts[key];
        echoControllerOptionButton(state, controls, mod, option, 'run', echoT(state, queued ? 'actionQueued' : 'run'), function () {
            if (queued) delete state.drafts[key]; else state.drafts[key] = {kind: 'action', mod: mod.id, option: option.id};
            echoDraw(state);
        }, queued, 'width:28rem;', !state.active);
        echoText(labels, echoT(state, 'actionHint'), '', 'font-size:1.1rem;color:#7393a2;margin-top:0.5rem;');
    } else echoText(controls, (option.kind === 'boolean' ? echoT(state, value ? 'yes' : 'no') : String(value === null ? '–' : value)) + (option.unit ? ' ' + echoModText(state, option, 'unit') : '') + ' · ' + echoT(state, option.kind === 'keybind' ? 'keybind' : 'readonly'), '', 'font-size:1.3rem;justify-content:flex-end;');
}
function echoSyncPanelVisibility(state, reason) {
    var widget = state.widget, inactive = false;
    if (widget.classList && typeof widget.classList.contains === 'function') inactive = widget.classList.contains('inactive');
    var allowed = !state.closed && state.presented === true && widget.WidgetIdent === 'def_bl4_empty_page_v40' && widget.IsActivated === true && !inactive && !(widget.SupportsHideFlags === true && widget.HideFlags);
    var wasVisible = state.visible === true;
    state.visible = !!allowed;
    state.root.style.display = allowed ? 'flex' : 'none';
    state.root.style.pointerEvents = allowed ? 'auto' : 'none';
    if (wasVisible && !allowed) {
        echoControllerSuspend(state);
        ++state.generation; state.busy = false;
        echoEditorDrag = null; echoScrollDrag = null;
        echoCancelCapture(state); echoReleaseTextFocus(state);
    }
    if ((!state.visibilityReported || wasVisible !== state.visible) && (state.visibilityReports || 0) < 24) {
        state.visibilityReported = true; state.visibilityReports = (state.visibilityReports || 0) + 1;
        record('editor_visibility', {reason:reason, allowed:state.visible, native_active:widget.IsActivated === true, presented:state.presented === true, native_inactive:inactive, hide_flags:widget.HideFlags || 0, root_display:state.root.style.display});
    }
    return state.visible;
}
function echoDraw(state) {
    if (!echoSyncPanelVisibility(state, 'redraw')) return;
    echoLanguageInstallFonts();
    echoLanguageClose(state, false);
    echoControllerEndEdit(state, true);
    echoCancelCapture(state);
    echoEditorDrag = null;
    echoScrollDrag = null;
    // Invalidate detached editors before clearing/replacing any option nodes.
    state.numberEditors = {};
    state.keyEditors = {};
    state.choiceEditors = {};
    echoReleaseTextFocus(state);
    (state.scrollPanes || []).forEach(function (pane) { state.positions[pane.key] = echoScrollPosition(pane); });
    state.scrollPanes = state.scrollPanes || []; state.paneCache = state.paneCache || {}; state.optionRows = [];
    var root = state.content;
    if (!state.regions) { state.regions = {}; echoAtmosphere(root); }
    var header = echoRegion(state, root, 'header', '', 'position:absolute;left:4.15%;right:4.15%;top:2.6rem;height:8rem;flex-direction:row;justify-content:space-between;border-bottom:1px solid #286078;z-index:70;overflow:visible;', true);
    var titles = echoNode(header, 'div');
    echoText(titles, echoT(state, 'eyebrow'), '', 'font-size:1.1rem;letter-spacing:0.2rem;color:#648c9a;');
    echoText(titles, echoT(state, 'mods'), '', 'font-size:4rem;font-style:' + (['ja','ko','zh-hans','zh-hant','th','ru'].indexOf(echoLanguage(state)) >= 0 ? 'normal' : 'italic') + ';color:#38add4;margin-top:0.4rem;');
    var languages = echoNode(header, 'div', null, '', 'flex-direction:row;align-items:center;');
    echoText(languages, echoT(state, 'configuration'), 'echo-mode', 'width:auto;font-size:1.1rem;letter-spacing:0.1rem;padding:0.8rem 1rem;margin-right:2rem;border-left:2px solid #c17e24;color:#d7b071;background-color:rgba(28,31,26,0.5);');
    echoText(languages, echoT(state, 'language'), '', 'width:auto;font-size:1.2rem;margin-right:1rem;color:#7393a2;');
    echoLanguageRender(state, languages);
    echoFixedText(state, root, 'hint', echoT(state, 'hint'), '', 'position:absolute;left:4.15%;right:4.15%;top:11.8rem;width:auto;font-size:1.3rem;color:#90aab3;');
    echoFixedText(state, root, 'sessionHint', echoT(state, 'sessionHint'), 'echo-session-hint', 'position:absolute;left:4.15%;right:4.15%;top:14.3rem;width:auto;padding-left:1.2rem;border-left:0.3rem solid #267c99;font-size:1.2rem;color:#6196a8;');
    var body = echoRegion(state, root, 'body', 'echo-body', 'position:absolute;left:4.15%;right:4.15%;top:17.5rem;bottom:9.5rem;flex-direction:row;');
    var sidebar = echoRegion(state, body, 'sidebar', 'echo-sidebar', 'width:24.5rem;height:100%;padding:1.5rem 2rem 0 0;border-right:1px solid #244251;');
    echoFixedText(state, sidebar, 'modsLabel', echoT(state, 'mods'), '', 'font-size:1.1rem;letter-spacing:0.2rem;text-transform:uppercase;color:#648c9a;margin-bottom:1.2rem;');
    var filters = echoRegion(state, sidebar, 'filters', '', 'flex-direction:row;flex-wrap:wrap;margin-bottom:1rem;', true);
    [['all','all'], ['on','on'], ['off','off']].forEach(function (pair) { echoControllerButton(state, filters, 'filter:' + pair[0], 'filters', echoT(state, pair[1]), function () { state.filter = pair[0]; echoDraw(state); }, state.filter === pair[0], 'font-size:1.1rem;padding:0.3rem 0.5rem;height:2.6rem;'); });
    var modList = echoScrollPane(state, sidebar, 'mods:' + state.filter, 'echo-mod-list', '0.1rem 0.5rem 0 0.1rem');
    var mods = state.catalog && state.catalog.mods || [];
    var visible = mods.filter(function (mod) { return state.filter === 'all' || state.filter === 'on' && mod.enabled === true || state.filter === 'off' && mod.enabled === false; });
    if (!visible.some(function (m) { return m.id === state.selected; })) state.selected = visible.length ? visible[0].id : null;
    var order = visible.map(function (mod) { return mod.id; }).join('|');
    if (order !== state.cardOrder) { echoClear(modList); state.modCards = {}; state.cardOrder = order; }
    var selected = null;
    visible.forEach(function (mod) {
        if (mod.id === state.selected) selected = mod;
        var picked = mod.id === state.selected, targetPalette = echoModPalette(mod.enabled, picked), card = state.modCards[mod.id];
        if (!card) {
            var palette = targetPalette;
            card = state.modCards[mod.id] = echoControllerButton(state, modList, 'mod:' + mod.id, 'mods', '', function () { state.selected = mod.id; state.category = state.controller.categories[mod.id] || ''; echoDraw(state); record('editor_mod_selected', {id: mod.id}); }, picked, 'width:100%;height:12.8rem;min-height:12.8rem;overflow:hidden;margin:0 0 1rem 0;padding:1.1rem 1rem;flex-direction:column;align-items:flex-start;text-align:left;border-left:0.3rem solid ' + palette.border + ';clip-path:polygon(0 0,100% 0,100% 94%,96% 100%,0 100%);', false, palette);
            card.echoPalette = palette;
            var cardMeta = echoNode(card, 'div', null, '', 'width:100%;height:2rem;flex-direction:row;align-items:center;justify-content:space-between;margin-bottom:0.5rem;');
            card.echoSymbol = echoText(cardMeta, '', 'echo-mod-symbol', 'width:auto;font-size:1rem;letter-spacing:0.12rem;border:1px solid ' + palette.border + ';padding:0.2rem 0.4rem;');
            card.echoVersion = echoText(cardMeta, '', '', 'width:auto;max-width:65%;overflow:hidden;white-space:nowrap;font-size:1rem;');
            card.echoName = echoText(card, '', '', 'height:4.4rem;overflow:hidden;font-size:1.75rem;');
            card.echoStatus = echoText(card, '', 'echo-mod-state', 'font-size:1.1rem;margin-top:0.35rem;');
        }
        Object.keys(card.echoPalette).forEach(function (key) { card.echoPalette[key] = targetPalette[key]; });
        Object.keys(targetPalette).forEach(function (key) { card.echoPalette[key] = targetPalette[key]; });
        echoScrollStyle(card, 'backgroundColor', targetPalette.background);
        echoScrollStyle(card, 'backgroundImage', targetPalette.image || 'none');
        echoScrollStyle(card, 'borderColor', targetPalette.border);
        if (card.disabled !== !!state.busy) card.disabled = !!state.busy;
        echoScrollStyle(card, 'opacity', state.busy ? '0.45' : '1');
        card.echoControllerTarget.preferred = picked;
        var cardClass = 'echo-mod-card ' + (mod.enabled === false ? 'echo-mod-off' : mod.enabled === true ? 'echo-mod-on' : 'echo-mod-unknown') + (picked ? ' echo-mod-selected' : '');
        if (card.className !== cardClass) card.className = cardClass;
        [[card.echoSymbol, echoModSymbol(mod), targetPalette.status], [card.echoVersion, mod.version, targetPalette.muted], [card.echoName, echoModText(state, mod, 'name'), targetPalette.text], [card.echoStatus, echoT(state, mod.enabled === true ? 'on' : mod.enabled === false ? 'off' : 'unknown'), targetPalette.status]].forEach(function (entry) {
            if (entry[0].textContent !== String(entry[1])) entry[0].textContent = entry[1];
            echoScrollStyle(entry[0], 'color', entry[2]);
        });
        echoScrollStyle(card.echoSymbol, 'borderColor', targetPalette.border);
        var preview = echoStatusPreview(state, mod);
        if (preview) {
            if (!card.echoPreview) card.echoPreview = echoText(card, preview, 'echo-mod-preview', 'font-size:1rem;color:#e3c58e;margin-top:0.4rem;');
            else if (card.echoPreview.textContent !== preview) card.echoPreview.textContent = preview;
        } else if (card.echoPreview) { card.removeChild(card.echoPreview); card.echoPreview = null; }
    });
    if (!visible.length) {
        if (!modList.firstChild) echoText(modList, echoT(state, 'none'), '', 'font-size:1.3rem;color:#7393a2;');
        else modList.firstChild.textContent = echoT(state, 'none');
    }
    var modDetails = echoRegion(state, sidebar, 'modDetails', 'echo-mod-details', 'width:100%;padding-top:1.2rem;border-top:1px solid #244251;', true);
    echoText(modDetails, echoT(state, 'registered', {n: mods.length}), '', 'font-size:1.1rem;letter-spacing:0.06rem;color:#7596a3;');
    if (selected) {
        echoText(modDetails, echoModText(state, selected, 'name'), '', 'font-size:1.2rem;color:#a3c2cf;');
        echoText(modDetails, selected.author, '', 'font-size:1.1rem;color:#628591;margin-top:0.6rem;');
        var statusKey = 'enabled:' + selected.id + ':', target = state.drafts[statusKey];
        var preview = echoStatusPreview(state, selected);
        if (preview) echoText(modDetails, preview, '', 'font-size:1.1rem;color:#e3c58e;margin-top:0.5rem;');
        if (selected.can_toggle) {
            var next = !(target ? target.value : selected.enabled);
            echoControllerButton(state, modDetails, 'status:' + selected.id, 'status', echoT(state, next ? 'enable' : 'disable'), function () { echoSetDraft(state, {kind:'enabled', mod:selected.id, expected:selected.enabled, value:next}, selected.enabled); echoDraw(state); }, false, 'width:100%;height:3.3rem;margin:1rem 0 0;font-size:1.2rem;', !state.active);
        } else echoText(modDetails, echoT(state, 'locked'), '', 'font-size:1.1rem;color:#7393a2;margin-top:0.7rem;');
    }
    if ((state.catalog.errors || []).length) echoText(modDetails, echoT(state, 'catalogPartial'), '', 'font-size:1.1rem;color:#d7b071;margin-top:1rem;');
    var content = echoRegion(state, body, 'editor', 'echo-editor', 'flex:1;flex-shrink:1;height:100%;margin-left:2.7rem;');
    if (selected) {
        var categories = selected.categories.concat([{id:'__info', label_key:'info'}]);
        if (!categories.some(function (c) { return c.id === state.category; })) state.category = categories[0].id;
        state.controller.categories[selected.id] = state.category;
        var rememberedMods = Object.keys(state.controller.categories); if (rememberedMods.length > 128) delete state.controller.categories[rememberedMods[0]];
        var tabs = echoRegion(state, content, 'categories', 'echo-categories', 'min-height:4.5rem;max-height:12rem;overflow:auto;width:100%;flex-direction:row;flex-wrap:wrap;padding-bottom:0.6rem;border-bottom:1px solid #2a586c;', true);
        categories.forEach(function (category) {
            var picked = state.category === category.id;
            echoControllerButton(state, tabs, 'category:' + selected.id + ':' + category.id, 'categories', category.label_key ? echoT(state, category.label_key) : echoModText(state, category, 'name'), function () { state.category = category.id; echoDraw(state); }, picked, 'height:4rem;border-top:0;border-left:0;border-right:0;border-bottom-width:2px;padding:1.1rem 0.3rem;margin-right:1.8rem;font-size:1.3rem;letter-spacing:0.07rem;text-transform:uppercase;color:' + (picked ? '#abedff' : '#5995aa') + ';', false, {background:'transparent', image:picked ? 'linear-gradient(0deg,rgba(44,134,169,0.28),rgba(0,0,0,0))' : 'none', hover:'transparent', border:picked ? '#99dff1' : 'transparent', focus:'#9ae9ff', corner:false});
        });
        var settings = echoScrollPane(state, content, 'options:' + selected.id + ':' + state.category, 'echo-settings', '1.5rem 1rem 1.6rem 1rem');
        state.visibleOptions = selected.options.filter(function (o) { return o.category === state.category && echoModCondition(state, selected, o.visible_when); });
        if (selected.integration_notice) echoText(settings, selected.integration_notice_key ? echoT(state, selected.integration_notice_key) : echoModText(state, selected, 'integration_notice'), 'echo-integration-notice', 'font-size:1.1rem;color:#d7b071;padding:0.8rem;border-left:0.2rem solid #c17e24;margin-bottom:1rem;');
        if (state.category === '__info') {
            echoText(settings, echoT(state, 'info'), 'echo-category-title', 'font-size:2.5rem;text-transform:uppercase;color:#a3c2cf;padding-bottom:1rem;margin-bottom:1.3rem;border-bottom:1px solid #193c4a;');
            [echoModText(state, selected, 'description') || '–', selected.status, echoT(state, selected.persistent ? 'persistent' : 'notPersistent'), echoT(state, 'modTexts'), echoT(state, 'mouse'), echoT(state, 'restart')].forEach(function (line) { if (line) echoText(settings, line, '', 'font-size:1.4rem;margin-bottom:1.5rem;'); });
            if (state.lastResult) { echoText(settings, echoT(state, 'result'), '', 'font-size:1.8rem;color:#38add4;margin-top:1rem;'); echoText(settings, echoT(state, state.lastResult.status === 'applied' ? 'lastApplied' : 'lastFailed', {n:(state.lastResult.completed || []).length}), '', 'font-size:1.3rem;'); if ((state.lastResult.errors || []).length) echoText(settings, echoT(state, 'applyDetails'), '', 'font-size:1.2rem;color:#d7b071;'); }
        } else {
            var category = categories.filter(function (c) { return c.id === state.category; })[0];
            var section = echoNode(settings, 'div', null, 'echo-section', 'flex-direction:row;align-items:center;justify-content:space-between;padding:0 0 1rem;border-bottom:1px solid #193c4a;margin-bottom:1.3rem;');
            echoText(section, category.label_key ? echoT(state, category.label_key) : echoModText(state, category, 'name'), 'echo-category-title', 'width:auto;font-size:2.5rem;letter-spacing:0.03rem;text-transform:uppercase;color:#a3c2cf;');
            echoText(section, echoT(state, 'options') + ': ' + state.visibleOptions.length, '', 'width:auto;font-size:1.1rem;letter-spacing:0.12rem;text-transform:uppercase;color:#537f91;');
            (category.presets || []).forEach(function (preset) {
                if (!settings.echoPresets) {
                    settings.echoPresets = echoNode(settings, 'div', null, 'echo-presets', 'flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:1rem 1.2rem;margin-bottom:0.5rem;border:1px solid #2a566b;border-left:0.2rem solid #b47a29;background-image:linear-gradient(90deg,#0f2530,#091a27);');
                    echoText(settings.echoPresets, echoT(state, 'preset'), '', 'width:auto;font-size:1.6rem;color:#91bdce;margin-right:2rem;');
                    settings.echoPresetButtons = echoNode(settings.echoPresets, 'div', null, 'echo-preset-buttons', 'flex-direction:row;align-items:center;justify-content:flex-end;flex-wrap:wrap;margin-left:auto;');
                }
                var options = Object.keys(preset.values).map(function (key) { return selected.options.filter(function (o) { return o.identifier === key; })[0]; });
                var valid = options.every(function (o) { return o && echoPresetValueValid(o, preset.values[o.identifier]) && echoModCondition(state, selected, o.visible_when, preset.values) && echoModCondition(state, selected, o.enabled_when, preset.values); });
                var picked = valid && options.every(function (o) { return echoOptionValue(state, selected, o) === preset.values[o.identifier]; });
                echoControllerButton(state, settings.echoPresetButtons, 'preset:' + selected.id + ':' + state.category + ':' + (preset.id || preset.label), 'presets', echoModText(state, preset, 'label'), function () {
                    options.forEach(function (o) { echoSetDraft(state, {kind:'value', mod:selected.id, option:o.id, expected:o.value, value:preset.values[o.identifier]}, o.value); });
                    echoDraw(state);
                }, picked, 'font-size:1.1rem;letter-spacing:0.08rem;min-width:8rem;height:3.3rem;', !state.active || !valid);
            });
            var previousGroup = '';
            state.visibleOptions.forEach(function (option) {
                if (option.group && option.group !== previousGroup) { echoText(settings, echoModText(state, option, 'group'), '', 'font-size:1.2rem;letter-spacing:0.1rem;color:#64a5ba;margin:2rem 0 0;padding:0.9rem 1.2rem;border-left:0.2rem solid #3b7f98;background-image:linear-gradient(90deg,rgba(20,65,83,0.45),rgba(0,0,0,0));'); previousGroup = option.group; }
                echoDrawOption(state, settings, selected, option);
            });
            if (!state.visibleOptions.length) echoText(settings, echoT(state, 'noOptions'));
        }
        var hint = echoFixedText(state, content, 'scrollHint', echoT(state, 'scrollHint'), 'echo-scroll-hint', 'font-size:1rem;letter-spacing:0.07rem;text-transform:uppercase;color:#5d8a9c;justify-content:flex-end;padding-top:0.8rem;');
        hint.style.display = 'flex';
    } else {
        state.visibleOptions = [];
        if (state.regions.categories) echoClear(state.regions.categories);
        if (state.paneCache['echo-settings']) {
            var hiddenPane = state.paneCache['echo-settings'];
            hiddenPane.pendingTop = state.positions[hiddenPane.key] || 0;
            hiddenPane.frame.style.display = 'none';
        }
        if (state.regions.scrollHint) state.regions.scrollHint.style.display = 'none';
    }
    var footer = echoRegion(state, root, 'footer', '', 'position:absolute;left:4.15%;right:4.15%;bottom:2rem;height:6rem;flex-direction:row;align-items:center;justify-content:space-between;border-top:1px solid #37677d;padding-top:1.3rem;', true);
    state.statusNode = echoText(footer, echoSummary(state), 'echo-status', 'flex:1;flex-shrink:1;font-size:1.2rem;color:#7eb0c0;padding-right:2rem;');
    var actions = echoNode(footer, 'div', null, '', 'flex-direction:row;');
    echoControllerButton(state, actions, 'action:refresh', 'actions', echoT(state, 'refresh'), function () { echoFetch(state); });
    echoControllerButton(state, actions, 'action:reset', 'actions', echoT(state, 'reset'), function () {
        if (!selected) return;
        var defaults = {}, baseline = {};
        selected.options.forEach(function (o) { baseline[o.identifier] = o.value; });
        state.visibleOptions.forEach(function (o) { if (o.editable && o.has_default) defaults[o.identifier] = o.default; });
        state.visibleOptions.forEach(function (o) {
            var allowed = !o.enabled_when || echoModCondition(state, selected, o.enabled_when, baseline) || echoModCondition(state, selected, o.enabled_when, defaults);
            if (o.editable && o.has_default && allowed) { delete state.invalid['value:' + selected.id + ':' + o.id]; echoSetDraft(state, {kind:'value', mod:selected.id, option:o.id, expected:o.value, value:o.default}, o.value); }
        });
        echoDraw(state);
    }, false, '', !state.active || !state.visibleOptions.some(function (o) { return o.editable && o.has_default; }));
    state.discardButton = echoControllerButton(state, actions, 'action:discard', 'actions', echoT(state, 'discard'), function () { state.drafts = echoCopy(state.saved); state.invalid = {}; state.error = ''; echoDraw(state); });
    if (Object.keys(state.saved).length) echoControllerButton(state, actions, 'action:clear', 'actions', echoT(state, 'clear'), function () { state.invalid = {}; echoSave(state, true); });
    state.saveButton = echoControllerButton(state, actions, 'action:save', 'actions', echoT(state, 'save'), function () { echoSave(state, false); }, true, 'color:#092130;', false, {background:'#79c9db', image:'linear-gradient(180deg,#9de7f6,#6bbacf)', hover:'#9de7f6', border:'#a4e8f4', focus:'#c9f7ff', cornerColor:'#2d6579'});
    echoFooter(state);
    echoMarkRows(state);
    echoLanguageApplyFonts(state);
    echoControllerRefresh(state);
}
function echoMountEditor(widget) {
    if (!widget || widget.WidgetIdent !== 'def_bl4_empty_page_v40') return null;
    var wrapper = widget.querySelector('.list_wrapper'); if (wrapper) wrapper.style.display = 'none';
    if (widget.EchoMenuState) return widget.EchoMenuState;
    var root = echoNode(widget, 'div', null, '', 'display:none;pointer-events:none;position:absolute;left:0;top:9.5vh;width:100vw;height:83vh;background-color:transparent;background-image:none;overflow:hidden;');
    root.id = 'bl4_mod_panel';
    var state = {widget:widget, root:root, content:root, catalog:{mods:[], errors:[]}, selected:null, category:'', filter:'all', preference:'auto', drafts:{}, saved:{}, invalid:{}, positions:{}, scrollPanes:[], optionRows:[], focusedOption:'', active:false, epoch:'', queueRevision:0, busy:false, closed:false, generation:0, lastResult:null, message:'', error:'', presented:widget.IsActivated === true, visible:false};
    widget.EchoMenuState = state;
    echoControllerMount(state);
    root.addEventListener('mousedown', function (event) { echoLanguagePointer(state,event); }, true);
    root.addEventListener('click', function (event) { echoLanguagePointer(state,event); }, true);
    root.addEventListener('keydown', function (event) { echoLanguageKey(state,event); }, true);
    root.addEventListener('click', function (event) { event.stopPropagation(); });
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('pagehide', function () {
            echoControllerSuspend(state);
            state.closed = true; ++state.generation; echoEditorDrag = null; echoScrollDrag = null;
            echoSyncPanelVisibility(state, 'pagehide');
            echoCancelCapture(state);
            echoReleaseTextFocus(state);
            state.scrollPanes.forEach(function (pane) { if (pane.observer) pane.observer.disconnect(); });
        }, true);
        window.addEventListener('blur', function (event) {
            if (!echoIsWindowFocusEvent(event)) return;
            echoControllerSuspend(state);
            echoCancelCapture(state); echoReleaseTextFocus(state);
        }, true);
        window.addEventListener('focus', function (event) {
            if (!echoIsWindowFocusEvent(event)) return;
            var input = document.activeElement;
            if (input && input.echoTextOwner === state && typeof input.echoResumeText === 'function') input.echoResumeText();
        }, true);
        window.addEventListener('resize', function () {
            state.scrollPanes.forEach(function (pane) { pane.awaitLayout = true; });
            echoFlushScrollLayout(state);
        }, true);
    }
    echoDraw(state); record('editor_mounted', {native_host:widget.WidgetIdent, native_model_written:false, layout_revision:'1.2.2'});
    return state;
}
function echoOnEditorLifecycle(widget, name) {
    try {
        var state = echoMountEditor(widget); if (!state) return;
        var controllerWasAvailable = state.controller.available;
        echoControllerInstall(state);
        var wasVisible = state.visible === true;
        if (name === 'Event_Activate') state.presented = true;
        if (name === 'Event_Deactivate') state.presented = false;
        var allowed = echoSyncPanelVisibility(state, name);
        if (allowed && name === 'Event_Activate') echoControllerRestoreInput(state);
        if (!controllerWasAvailable && state.controller.available) echoControllerRefresh(state);
        if (allowed && (name === 'Event_Activate' || name === 'attached' || !wasVisible)) echoFetch(state);
        if (name === 'Event_Deactivate') {
            echoControllerSuspend(state);
            ++state.generation; state.busy = false; echoEditorDrag = null; echoScrollDrag = null;
            echoCancelCapture(state);
            echoReleaseTextFocus(state);
            state.scrollPanes.forEach(function (pane) { pane.pendingTop = state.positions[pane.key] || 0; pane.awaitLayout = true; });
        }
    } catch (error) { record('editor_error', {error:short(error)}); }
}
function echoProtoSelect() { /* The native placeholder model is retained; the ECHO editor owns its own selection. */ }
function echoDescribeEditor(widget) {
    var state = widget && widget.EchoMenuState; if (!state) return null;
    return {layout_revision:'1.2.2', catalog_count:state.catalog.mods.length, created_mod_rows:state.root.querySelectorAll('.echo-mod-card').length,
        controller:{available:!!state.controller.available, directional:!!state.controller.directional,
            capability_issue:state.controller.capabilityIssue,
            region:state.controller.region, target:state.controller.current, editing:!!state.controller.edit,
            visual_marker:'inset_border', marked_elements:(state.controller.paintNodes || []).length,
            confirm_route:state.controller.confirmRoute, confirm_dispatching:state.controller.confirmDispatching,
            native_input_active:!!widget.inputActive,
            native_focus_widget:typeof InputMgr !== 'undefined' && InputMgr && InputMgr.CurrWidget ? InputMgr.CurrWidget.WidgetIdent : null,
            native_input_device:typeof InputMgr !== 'undefined' && InputMgr ? InputMgr.InputDeviceType : null,
            native_cursor:typeof InputMgr !== 'undefined' && InputMgr ? InputMgr.IsUsingCursor() : null,
            escape_registered:!!state.controller.escapeRegistered, counts:state.controller.counts},
        visibility:{presentation_allowed:state.visible === true, presented:state.presented === true, native_active:widget.IsActivated === true, display:state.root.style.display, pointer_events:state.root.style.pointerEvents},
        root:echoRenderNode(state.root, false), body:echoRenderNode(state.root.querySelector('.echo-body'), false),
        sidebar:echoRenderNode(state.root.querySelector('.echo-sidebar'), false), editor:echoRenderNode(state.root.querySelector('.echo-editor'), false),
        settings:echoRenderNode(state.root.querySelector('.echo-settings'), false), language:echoLanguage(state),
        draft_count:echoCommands(state).length, queued_count:Object.keys(state.saved).length,
        created_option_rows:state.root.querySelectorAll('.echo-option-row').length, scroll_layout_mode:state.layoutMode || 'not_measured',
        text_input:{native_helper:typeof widget.OnTextInputFocusedChanged === 'function', focused:!!state.nativeTextInput,
            acquired:state.textFocusAcquires || 0, released:state.textFocusReleases || 0,
            key_events:state.textKeyEvents || 0, input_events:state.textInputEvents || 0,
            pointer_rearms:state.textInputRearms || 0, enter_confirmed:state.textEnterConfirmed || 0, errors:state.textFocusErrors || {}},
        key_capture:{active:!!state.keyCapture,phase:state.keyCapture ? state.keyCapture.phase : 'closed',
            clicks:state.captureClicks || 0,keydown:state.captureKeyDowns || 0,keyup:state.captureKeyUps || 0,
            accepted:state.captureAccepted || 0,unsupported:state.captureUnsupported || 0,focus_trace:state.captureFocusTrace || []},
        scroll_panes:state.scrollPanes.map(function (pane) { return {key:pane.key, top:pane.view.scrollTop || 0, range:pane.range || 0, client_height:pane.view.clientHeight || 0, scroll_height:pane.view.scrollHeight || 0, pending_layout:!!pane.awaitLayout, pending_top:pane.pendingTop, observer:!!pane.observer}; })};
}
if (typeof document.addEventListener === 'function') {
    document.addEventListener('mousemove', function (event) {
        var drag = echoEditorDrag; if (drag && drag.state.widget.IsActivated && !drag.state.closed) drag.move(event);
        var scroll = echoScrollDrag;
        if (scroll && scroll.pane.state.widget.IsActivated && !scroll.pane.state.closed && scroll.pane.travel > 0) echoScrollTo(scroll.pane, scroll.top + (event.clientY - scroll.y) * scroll.pane.range / scroll.pane.travel);
    }, true);
    document.addEventListener('mouseup', function () { echoEditorDrag = null; echoScrollDrag = null; }, true);
}
if (typeof window.addEventListener === 'function') window.addEventListener('blur', function (event) {
    if (!echoIsWindowFocusEvent(event)) return;
    echoEditorDrag = null; echoScrollDrag = null;
}, true);
