/* ECHO's own focus graph and edit lifetime. Native InputManager still owns
 * action names, press/release delivery, widget priority and cursor mode.
 * Sources: original input_manager.js and dropdown.js exported 2026-10-24.
 * No physical pad mapping, timers, model writes or replacement input manager.
 */
var echoControllerBehavior = 'bl4_echo_editor';
var echoControllerEscape = 'bl4_echo_edit_cancel';

function echoControllerContains(parent, child) {
    for (var node = child; node; node = node.parentElement) if (node === parent) return true;
    return false;
}
function echoControllerLog(state, kind, details) {
    var nav = state.controller;
    nav.counts[kind] = (nav.counts[kind] || 0) + 1;
    if (nav.records < 48) { ++nav.records; record('controller_' + kind + '', details || {}); }
}
function echoControllerState(manager) {
    var widget = manager && manager.CurrWidget, state = widget && widget.EchoMenuState;
    if (!state || !state.controller || !state.controller.available || state.closed || !state.visible ||
        !widget.IsActivated || widget.WidgetIdent !== 'def_bl4_empty_page_v40' || manager.pause ||
        widget.DataModel && widget.DataModel.inputactive === false) return null;
    return state;
}
function echoControllerContext(state) {
    if (state.languageMenu) return function () { echoLanguageClose(state,true); };
    if (state.keyCapture) return function () {
        state.keyCapture.close('native_cancel');
        if (document.activeElement && document.activeElement.echoTextOwner === state) document.activeElement.blur();
    };
    if (state.controller && state.controller.edit) return function () { echoControllerEndEdit(state, true); };
    var input = state.nativeTextInput && state.nativeTextInput.input;
    return input && typeof input.echoCancelText === 'function' ? input.echoCancelText : null;
}
function echoControllerEscapeSync(state) {
    var nav = state.controller;
    if (!nav || !nav.escapeCapable) return;
    var needed = !state.closed && state.visible && state.widget.IsActivated && !!echoControllerContext(state);
    if (needed === nav.escapeRegistered) return;
    // Same native ownership protocol used by GbxDropDown.OnClick. Set the
    // local state first because TriggerWidgetEvent can reenter UI callbacks.
    nav.escapeRegistered = needed;
    try { state.widget.TriggerWidgetEvent(needed ? 'Event_OnCohEscapeInputHandlerAdded' : 'Event_OnCohEscapeInputHandlerRemoved', echoControllerEscape); }
    catch (error) {
        nav.escapeRegistered = !needed;
        echoControllerLog(state, 'error', {operation:'escape_registration', error:short(error)});
    }
}
function echoControllerTag(node, spec) {
    node.echoControllerTarget = spec;
    return node;
}
function echoControllerButton(state, parent, id, region, text, fn, picked, style, disabled, palette) {
    return echoControllerTag(echoButton(state, parent, text, fn, picked, style, disabled, palette),
        {id:id, region:region, preferred:!!picked});
}
function echoControllerOptionButton(state, parent, mod, option, role, text, fn, picked, style, disabled, palette) {
    var key = 'value:' + mod.id + ':' + option.id;
    return echoControllerTag(echoButton(state, parent, text, fn, picked, style, disabled, palette),
        {id:role + ':' + key, region:'options', row:option.id, slot:role === 'unbind' ? 1 : role === 'capture' || role === 'increase' ? 2 : 0, key:key});
}
function echoControllerTargets(state, region) {
    if (state.busy || !state.active || !state.visible || state.closed) return [];
    return state.controller.targets.filter(function (target) {
        if (state.languageMenu && target.region !== 'language-list') return false;
        if (region && target.region !== region || target.node.disabled ||
            !echoControllerContains(state.root, target.node)) return false;
        for (var at = target.node; at && at !== state.root; at = at.parentElement)
            if (at.style && at.style.display === 'none') return false;
        return !target.editor || target.editor.available();
    });
}
function echoControllerMemoryKey(state, region) {
    return region + (['categories','presets','options','status'].indexOf(region) >= 0 ? ':' + state.selected : '') +
        (['presets','options'].indexOf(region) >= 0 ? ':' + state.category : '');
}
function echoControllerCurrent(state) {
    return echoControllerTargets(state).filter(function (target) { return target.id === state.controller.current; })[0] || null;
}
function echoControllerRemember(state, target) {
    var nav = state.controller, key = echoControllerMemoryKey(state, target.region);
    nav.current = target.id; nav.region = target.region; nav.memory[key] = target.id;
    var keys = Object.keys(nav.memory); if (keys.length > 512) delete nav.memory[keys[0]];
}
function echoControllerRegion(state, region, fallbackLast) {
    var targets = echoControllerTargets(state, region), remembered = state.controller.memory[echoControllerMemoryKey(state, region)];
    return targets.filter(function (target) { return target.id === remembered; })[0] ||
        targets.filter(function (target) { return target.preferred; })[0] ||
        targets[fallbackLast ? targets.length - 1 : 0] || null;
}
function echoControllerPrepareMarker(node, row) {
    if (node.tagName === 'INPUT' || node.echoControllerFrame) return;
    var frame = node.echoControllerFrame = echoNode(node, 'div', null, 'echo-controller-focus',
        'display:none;position:absolute;left:0.15rem;right:0.15rem;top:0.15rem;bottom:0.15rem;border:2px solid #9ae9ff;pointer-events:none;z-index:30;');
    frame.style.display = 'none'; frame.style.borderWidth = row ? '1px' : '2px';
    var vertical = row || node.echoControllerTarget && node.echoControllerTarget.region === 'mods';
    frame.echoBar = echoNode(frame, 'div', null, 'echo-controller-focus-bar',
        'position:absolute;background-color:#9ae9ff;pointer-events:none;' +
        (vertical ? 'left:0;top:0;bottom:0;width:0.35rem;' : 'left:0;right:0;bottom:0;height:0.25rem;'));
}
function echoControllerMarker(node, mode, row) {
    // Cohtml did not display CSS outline focus reliably in game. Use the same
    // ordinary borders/filled divs as the working ECHO design, inset so a
    // scrolling viewport or clipped mod card cannot cut the marker away.
    // Absolute children never participate in the control's flex layout.
    var color = mode === 'edit' ? '#ffb34f' : '#9ae9ff';
    if (node.tagName === 'INPUT') {
        // Inputs are void elements. Paint their existing border/background
        // instead of appending an invalid child or changing their dimensions.
        var ink = node.echoControllerInk;
        if (mode) {
            if (!ink) ink = node.echoControllerInk = {before:{
                borderColor:node.style.borderColor || '', backgroundColor:node.style.backgroundColor || ''}, own:{}};
            ink.own = {borderColor:color, backgroundColor:mode === 'edit' ? '#583816' : '#17475a'};
            Object.keys(ink.own).forEach(function (key) {
                echoScrollStyle(node, key, ink.own[key]);
                // CSSOM may serialize a hex assignment as rgb(...). Keep the
                // actual value so ownership comparison also works in Cohtml.
                ink.own[key] = node.style[key];
            });
        } else if (ink) {
            Object.keys(ink.own).forEach(function (key) {
                // A validation/capture update may have replaced a property.
                // Only undo a color which is still owned by this marker.
                if (node.style[key] === ink.own[key]) node.style[key] = ink.before[key];
            });
            node.echoControllerInk = null;
        }
    } else {
        if (mode) echoControllerPrepareMarker(node, row);
        var frame = node.echoControllerFrame;
        if (frame) {
            echoScrollStyle(frame, 'display', mode ? 'flex' : 'none');
            if (mode) {
                echoScrollStyle(frame, 'borderColor', color);
                echoScrollStyle(frame, 'borderWidth', row ? '1px' : '2px');
                echoScrollStyle(frame.echoBar, 'backgroundColor', color);
            }
        }
    }
    if (mode) node.dataset.echoControllerFocus = mode;
    else delete node.dataset.echoControllerFocus;
}
function echoControllerPaint(state) {
    var nav = state.controller, current = nav.directional && state.visible && !state.closed && echoControllerCurrent(state);
    var mode = nav.edit || state.languageMenu || state.keyCapture || state.nativeTextInput ? 'edit' : 'browse', marked = [];
    if (current) {
        marked.push(current.node);
        (state.optionRows || []).forEach(function (item) {
            if (current.key === 'value:' + item.mod.id + ':' + item.option.id) marked.push(item.row);
        });
    }
    (nav.paintNodes || []).forEach(function (node) {
        if (marked.indexOf(node) < 0) echoControllerMarker(node, null, false);
    });
    marked.forEach(function (node, index) { echoControllerMarker(node, mode, index > 0); });
    nav.paintNodes = marked;
    if (state.regions && state.regions.scrollHint) state.regions.scrollHint.textContent =
        echoT(state, nav.directional ? nav.edit ? 'controllerEdit' : 'controllerBrowse' : 'scrollHint');
}
function echoControllerScrollItem(target, content) {
    var rowClass = target.region === 'options' ? 'echo-option-row' :
        target.region === 'presets' ? 'echo-presets' : null;
    if (rowClass) {
        for (var node = target.node; node && node !== content; node = node.parentElement)
            if (node.classList && node.classList.contains(rowClass)) return node;
    }
    return target.node;
}
function echoControllerScrollDestination(state, target, content, view, position, range) {
    var box = target.node.getBoundingClientRect(), viewport = view.getBoundingClientRect();
    var height = view.clientHeight || viewport.height, extent = box;
    if (!height || !box.height) return position;
    // Option controls and preset buttons share larger labeled rows. Reveal
    // the complete row when it fits; otherwise keep the actual input visible.
    var item = echoControllerScrollItem(target, content);
    if (item !== target.node) {
        var row = item.getBoundingClientRect();
        if (row.height > 0 && row.height <= height && row.top <= box.top + 1 &&
            row.top + row.height >= box.top + box.height - 1) extent = row;
    }
    var top = extent.top, bottom = top + extent.height, limit = viewport.top + height;
    // An oversized control already covering the viewport cannot fit at both
    // edges. Retain its position instead of alternating between alignments.
    var delta = top <= viewport.top && bottom >= limit ? 0 :
        top < viewport.top ? top - viewport.top : bottom > limit ? bottom - limit : 0;
    var destination = position + delta;
    var entries = echoControllerTargets(state).filter(function (entry) { return echoControllerContains(content, entry.node); });
    function sameItem(entry) {
        return entry && echoControllerScrollItem(entry, content) === item;
    }
    // Include leading/trailing spacing at the ends. All controls within an
    // option or preset row count as one item, regardless of the focused button.
    var edge = sameItem(entries[0]) ? 0 : sameItem(entries[entries.length - 1]) ? range : null;
    if (edge !== null && extent.height <= height) {
        // Long headings or read-only tails can make an exact endpoint hide
        // the selected row. Move as far as its full visible extent allows.
        destination = Math.max(position + bottom - limit, Math.min(position + top - viewport.top, edge));
    }
    return Math.max(0, Math.min(range, destination));
}
function echoControllerEnsureVisible(state) {
    var nav = state.controller, target = nav && echoControllerCurrent(state);
    if (!target || !nav.directional || nav.scrolling) return;
    nav.scrolling = true;
    try {
        (state.scrollPanes || []).forEach(function (pane) {
            if (!echoControllerContains(pane.content, target.node) || pane.frame.style.display === 'none') return;
            if (!echoSyncScroll(pane, true)) return;
            var position = echoScrollPosition(pane);
            var destination = echoControllerScrollDestination(state, target, pane.content, pane.view, position, pane.range);
            if (destination !== position) echoScrollTo(pane, destination);
        });
        var tabs = state.regions && state.regions.categories;
        if (tabs && echoControllerContains(tabs, target.node) && tabs.scrollHeight > tabs.clientHeight) {
            tabs.scrollTop = echoControllerScrollDestination(state, target, tabs, tabs,
                tabs.scrollTop || 0, tabs.scrollHeight - tabs.clientHeight);
        }
    } finally { nav.scrolling = false; }
}
function echoControllerFocus(state, target) {
    if (!target || typeof InputMgr === 'undefined' || echoControllerState(InputMgr) !== state) return false;
    if (InputMgr.IsUsingCursor()) return false;
    // Footer controls can become enabled after a draft edit without a redraw.
    // Keep native input metadata in step with their actual disabled property.
    target.node.dataset.inputDisabled = target.node.disabled ? 'true' : 'false';
    InputMgr.FocusElement(target.node, {wantSimulateMouse:false});
    if (InputMgr.CurrElement !== target.node) return false;
    echoControllerRemember(state, target); state.controller.directional = true;
    state.focusedOption = target.key || ''; echoMarkRows(state);
    echoControllerPaint(state); echoControllerEnsureVisible(state);
    return true;
}
function echoControllerDefault(state) {
    return echoControllerCurrent(state) || echoControllerRegion(state, state.controller.region) ||
        echoControllerRegion(state, 'mods') || echoControllerTargets(state)[0];
}
function echoControllerRefresh(state) {
    var nav = state.controller; if (!nav) return;
    if (state.root.dataset) {
        if (nav.available) {
            state.root.dataset.inputElem = 'true'; state.root.dataset.inputBeh = echoControllerBehavior;
            state.root.dataset.inputId = 'bl4_echo_root';
        } else if (state.root.dataset.inputBeh === echoControllerBehavior) {
            delete state.root.dataset.inputElem; delete state.root.dataset.inputBeh; delete state.root.dataset.inputId;
        }
    }
    nav.targets = [];
    var nodes = state.root.querySelectorAll('*');
    for (var i = 0; i < nodes.length; ++i) {
        var spec = nodes[i].echoControllerTarget; if (!spec) continue;
        var target = Object.assign({}, spec, {node:nodes[i]}); nav.targets.push(target);
        if (!nodes[i].dataset) continue;
        if (!nav.available) {
            delete nodes[i].dataset.inputElem; delete nodes[i].dataset.inputId; delete nodes[i].dataset.inputDisabled; continue;
        }
        nodes[i].dataset.inputElem = 'true'; nodes[i].dataset.inputId = 'echo:' + spec.id;
        nodes[i].dataset.inputDisabled = nodes[i].disabled ? 'true' : 'false';
        echoControllerPrepareMarker(nodes[i], false);
        (state.optionRows || []).forEach(function (item) {
            if (spec.key === 'value:' + item.mod.id + ':' + item.option.id) echoControllerPrepareMarker(item.row, true);
        });
    }
    // Build the markers before the existing one-per-redraw layout settle.
    // Moving focus then only recolors/shows them and cannot delay text capture
    // or invalidate the viewport geometry used by EnsureVisible.
    echoFlushScrollLayout(state);
    if (nav.available && typeof InputMgr !== 'undefined' && echoControllerState(InputMgr) === state && !InputMgr.IsUsingCursor())
        echoControllerFocus(state, echoControllerCurrent(state) || echoControllerRegion(state, nav.region) || echoControllerDefault(state));
    else echoControllerPaint(state);
}
function echoControllerMove(state, direction) {
    var nav = state.controller;
    if (state.busy || state.keyCapture || state.nativeTextInput) return;
    if (state.languageMenu) {
        if (direction !== 'up' && direction !== 'down') return;
        var languages = echoControllerTargets(state,'language-list'), focused = echoControllerCurrent(state);
        var at = languages.indexOf(focused), step = direction === 'up' ? -1 : 1;
        echoControllerFocus(state,languages[Math.max(0,Math.min(languages.length - 1,at + step))]);
        return;
    }
    if (nav.edit) {
        if (direction === 'left' || direction === 'right') nav.edit.editor.step(direction === 'left' ? -1 : 1);
        echoControllerPaint(state); return;
    }
    var current = echoControllerCurrent(state) || echoControllerDefault(state);
    if (!current) return;
    var targets = echoControllerTargets(state, current.region), index = targets.indexOf(current), next;
    var vertical = current.region === 'mods' || current.region === 'options' || current.region === 'status';
    if (current.region === 'options') {
        if (direction === 'up' || direction === 'down') {
            var rows = []; targets.forEach(function (target) { if (rows.indexOf(target.row) < 0) rows.push(target.row); });
            var rowIndex = rows.indexOf(current.row) + (direction === 'up' ? -1 : 1), row = rows[rowIndex];
            if (row !== undefined) next = targets.filter(function (target) { return target.row === row && target.slot === current.slot; })[0] ||
                targets.filter(function (target) { return target.row === row; })[0];
        } else {
            var siblings = targets.filter(function (target) { return target.row === current.row; });
            next = siblings[siblings.indexOf(current) + (direction === 'left' ? -1 : 1)];
        }
    } else if (vertical && (direction === 'up' || direction === 'down') || !vertical && (direction === 'left' || direction === 'right')) {
        next = targets[index + (direction === 'up' || direction === 'left' ? -1 : 1)];
    }
    if (!next) {
        var links = {
            language:{down:['categories','filters','mods'],left:['filters']},
            filters:{down:['mods','status','actions'],up:['language'],right:['categories','language']},
            mods:{up:['filters','language'],down:['status','actions'],right:['categories','options','actions']},
            status:{up:['mods'],down:['actions'],right:['options','categories','actions']},
            categories:{up:['language'],down:['presets','options','actions'],left:['mods'],right:['actions']},
            presets:{up:['categories'],down:['options','actions'],left:['mods'],right:['actions']},
            options:{up:['presets','categories'],down:['actions'],left:['mods'],right:['actions']},
            actions:{up:['options','presets','categories','mods'],left:['status','mods'],right:['language']}
        };
        var regions = (links[current.region] || {})[direction] || [];
        for (var i = 0; i < regions.length && !next; ++i) next = echoControllerRegion(state, regions[i], direction === 'up');
    }
    if (next) echoControllerFocus(state, next);
    echoControllerLog(state, 'move', {direction:direction, region:nav.region, target:nav.current});
}
function echoControllerBeginEdit(state, target) {
    var nav = state.controller;
    if (!nav.escapeCapable || !target.editor || !target.editor.available()) return;
    nav.edit = {id:target.id, key:target.key, editor:target.editor, draft:state.drafts[target.key] ? echoCopy(state.drafts[target.key]) : null,
        invalid:state.invalid[target.key] ? echoCopy(state.invalid[target.key]) : null,
        captureBefore:state.widget.dataset.bIsDirectionalInputCaptureActive};
    InputMgr.SetDirectionalInputCaptureActiveForWidget(state.widget, true);
    echoControllerEscapeSync(state); echoControllerPaint(state);
    echoControllerLog(state, 'edit_begin', {kind:target.kind, target:target.id});
}
function echoControllerEndEdit(state, cancel) {
    var nav = state.controller, edit = nav && nav.edit; if (!edit) return;
    nav.edit = null;
    if (cancel) {
        if (edit.draft) state.drafts[edit.key] = echoCopy(edit.draft); else delete state.drafts[edit.key];
        if (edit.invalid) state.invalid[edit.key] = echoCopy(edit.invalid); else delete state.invalid[edit.key];
        if (edit.editor.available()) edit.editor.show();
    }
    if (edit.captureBefore === undefined) delete state.widget.dataset.bIsDirectionalInputCaptureActive;
    else state.widget.dataset.bIsDirectionalInputCaptureActive = edit.captureBefore;
    echoControllerEscapeSync(state); echoControllerPaint(state); echoFooter(state); echoMarkRows(state);
    echoControllerLog(state, cancel ? 'edit_cancel' : 'edit_confirm', {target:edit.id});
}
function echoControllerSelect(state, node) {
    var nav = state.controller;
    if (state.keyCapture || state.busy || !state.active) return;
    if (state.nativeTextInput) {
        var input = state.nativeTextInput.input;
        if (input && typeof input.echoConfirmText === 'function') input.echoConfirmText();
        return;
    }
    if (nav.edit) { echoControllerEndEdit(state, false); echoDraw(state); return; }
    var target = echoControllerTargets(state).filter(function (entry) { return entry.node === node; })[0];
    if (!target) return;
    echoControllerRemember(state, target);
    if (target.kind === 'number' || target.kind === 'choice') echoControllerBeginEdit(state, target);
    else if (target.kind === 'text') {
        target.node.focus();
        if (typeof target.node.echoResumeText === 'function') target.node.echoResumeText();
    } else if (typeof target.node.echoInvoke === 'function') target.node.echoInvoke();
    echoControllerPaint(state);
    echoControllerLog(state, 'select', {target:target.id, kind:target.kind || 'button'});
}
function echoControllerConfirm(state, node, route) {
    if (!node) return;
    var nav = state.controller;
    // Match the native InputManager: each PRESSED callback is a selection.
    // Do not hold a latch until RELEASED or require a mouse down/up sequence;
    // those optional phases may never reach this view on a given input route.
    // Only reject a known native synthetic mouse event or synchronous reentry.
    if (route === 'click' && typeof InputMgr !== 'undefined' && InputMgr.SimulatingMouse) {
        echoControllerLog(state, 'confirm_synthetic', {}); return;
    }
    if (nav.confirmDispatching) { echoControllerLog(state, 'confirm_reentrant', {}); return; }
    nav.confirmDispatching = true;
    nav.confirmRoute = route; // last source for diagnostics, never an input gate
    echoControllerLog(state, 'confirm_' + route, {target:node.echoControllerTarget && node.echoControllerTarget.id});
    try { return echoControllerSelect(state, node); }
    finally { nav.confirmDispatching = false; }
}
function echoControllerPointerAllowed(state) {
    return !(state.controller && state.controller.available && typeof InputMgr !== 'undefined' &&
        echoControllerState(InputMgr) === state && InputMgr.ShouldBlockCursorInput());
}
function echoControllerSuspend(state, preserveLanguage) {
    if (!state.controller) return;
    if (!preserveLanguage) echoLanguageClose(state,false);
    echoControllerEndEdit(state, true);
    state.controller.directional = false; state.controller.confirmRoute = '';
    echoControllerPaint(state);
}
function echoControllerRestoreInput(state) {
    var widget = state.widget;
    if (!state.controller.available || state.closed || !state.visible || !widget.IsActivated ||
        !widget.registerToInputManager || !widget.DataModel || !widget.DataModel.inputactive ||
        typeof widget.UpdateInputRegistration !== 'function') return;
    // Widget_ListMenu skips this when entriesrev did not change. MenuBase
    // clears inputActive on every Deactivate, so explicitly reconcile at our
    // real Activate boundary, through the original native registration path.
    // This preserves the native priority stack and never edits the model.
    widget.UpdateInputRegistration();
    state.controller.confirmRoute = '';
    echoControllerLog(state, 'input_registration', {input_active:!!widget.inputActive});
}
var echoControllerClickInstalled = false;
function echoControllerInstallClick() {
    if (echoControllerClickInstalled || typeof document.addEventListener !== 'function') return;
    echoControllerClickInstalled = true;
    ['mousedown','mouseup','click'].forEach(function (type) {
        document.addEventListener(type, function (event) {
            if (typeof InputMgr === 'undefined') return;
            if (event.target && event.target.isConnected === false) return;
            var state = echoControllerState(InputMgr);
            if (!state || !state.controller.directional || InputMgr.IsUsingCursor() ||
                typeof InputMgr.IsUsingGamepad !== 'function' || !InputMgr.IsUsingGamepad() ||
                event.button !== undefined && event.button !== 0) return;
            // BL4's existing virtual-cursor Confirm can arrive as a primary
            // click, rather than NavSelect. In directional mode it belongs to
            // the semantic focus, not to the cursor's previous coordinates.
            if (event.preventDefault) event.preventDefault();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation(); else event.stopPropagation();
            if (type !== 'click' || state.busy || !state.active) return;
            var target = echoControllerCurrent(state); if (!target) return;
            echoControllerConfirm(state, target.node, 'click');
        }, true);
    });
}
function echoControllerInstall(state) {
    var nav = state.controller;
    nav.available = false;
    if (typeof InputManager !== 'function' || typeof InputMgr === 'undefined' || !InputMgr ||
        typeof INPUT_NAV_UP === 'undefined' || INPUT_NAV_UP !== 'Input.Action.Menu.NavUp' ||
        typeof INPUT_NAV_RIGHT === 'undefined' || INPUT_NAV_RIGHT !== 'Input.Action.Menu.NavRight' ||
        typeof INPUT_NAV_DOWN === 'undefined' || INPUT_NAV_DOWN !== 'Input.Action.Menu.NavDown' ||
        typeof INPUT_NAV_LEFT === 'undefined' || INPUT_NAV_LEFT !== 'Input.Action.Menu.NavLeft' ||
        typeof INPUT_NAV_SELECTED === 'undefined' || INPUT_NAV_SELECTED !== 'Input.Action.Menu.NavSelect' ||
        typeof InputActionType === 'undefined' || InputActionType.PRESSED !== 1 || InputActionType.RELEASED !== 16 ||
        !InputMgr.BehaviorMap || typeof InputMgr.BehaviorMap.set !== 'function') { nav.capabilityIssue = 'Native input action interface unavailable or changed'; return; }
    var prototype = InputManager.prototype;
    var methods = ['OnInputAction','Event_Input_Select','SelectElement','FocusDefaultElement','ResetCursorInput','FocusElement','ShouldBlockCursorInput','SetDirectionalInputCaptureActiveForWidget'];
    if (!methods.every(function (method) { return typeof prototype[method] === 'function'; })) { nav.capabilityIssue = 'Required native input method absent'; return; }
    nav.available = nav.escapeCapable;
    nav.capabilityIssue = nav.available ? '' : 'Native widget Escape bridge absent';
    if (!nav.available) return;
    echoControllerInstallClick();
    if (!InputMgr.BehaviorMap.has(echoControllerBehavior)) InputMgr.BehaviorMap.set(echoControllerBehavior, {Navigate:function (action) {
        var current = echoControllerState(InputMgr); if (!current) return;
        var directions = {}; directions[INPUT_NAV_UP] = 'up'; directions[INPUT_NAV_DOWN] = 'down';
        directions[INPUT_NAV_LEFT] = 'left'; directions[INPUT_NAV_RIGHT] = 'right';
        if (directions[action]) echoControllerMove(current, directions[action]);
    }});
    if (prototype.echoEchoNavigation) return;
    prototype.echoEchoNavigation = true;
    var inputSelect = prototype.Event_Input_Select;
    prototype.Event_Input_Select = function () {
        var current = echoControllerState(this);
        if (!current || this.IsUsingCursor()) return inputSelect.apply(this, arguments);
        // The semantic focus survives a redraw even if the native DOM cache
        // still points at a detached node or was cleared by the host.
        var target = echoControllerCurrent(current) || echoControllerDefault(current);
        if (target) return echoControllerConfirm(current, target.node, 'action');
    };
    var select = prototype.SelectElement;
    prototype.SelectElement = function (node) {
        var current = echoControllerState(this);
        if (!current) {
            var owner = this.CurrWidget && this.CurrWidget.EchoMenuState;
            if (owner && owner.controller && owner.controller.available &&
                this.CurrWidget.WidgetIdent === 'def_bl4_empty_page_v40') return;
            return select.apply(this, arguments);
        }
        // Own ECHO targets have no native model indices. Route once directly;
        // the original would emit InputSelectionChanged AND synthesize a click.
        if (!this.IsUsingCursor()) return echoControllerConfirm(current, node, 'select');
    };
    var defaultFocus = prototype.FocusDefaultElement;
    prototype.FocusDefaultElement = function () {
        var current = echoControllerState(this);
        if (!current) return defaultFocus.apply(this, arguments);
        return !this.IsUsingCursor() && echoControllerFocus(current, echoControllerDefault(current));
    };
    var cursor = prototype.ResetCursorInput;
    prototype.ResetCursorInput = function () {
        var result = cursor.apply(this, arguments), current = echoControllerState(this);
        if (current && this.IsUsingCursor() && current.controller.directional) {
            echoControllerSuspend(current,true); echoControllerLog(current, 'cursor', {});
        }
        return result;
    };
}
function echoControllerMount(state) {
    if (state.controller) { echoControllerInstall(state); return; }
    var widget = state.widget, originalEscape = widget.Event_TriggerCohEscapeInput;
    state.controller = {available:false, capabilityIssue:'', escapeCapable:typeof originalEscape === 'function', escapeRegistered:false,
        directional:false, current:'', region:'mods', targets:[], memory:{}, categories:{}, edit:null, confirmDispatching:false, confirmRoute:'', records:0, counts:{}};
    if (typeof originalEscape === 'function') widget.Event_TriggerCohEscapeInput = function (ident) {
        var cancel = echoControllerContext(state);
        if (ident === echoControllerEscape && state.visible && !state.closed && state.widget.IsActivated && cancel) {
            cancel(); echoControllerEscapeSync(state); echoControllerPaint(state);
            echoControllerLog(state, 'cancel', {native_handler:true}); return;
        }
        return originalEscape.apply(this, arguments);
    };
    var deactivate = widget.Event_Deactivate;
    if (typeof deactivate === 'function') widget.Event_Deactivate = function () {
        echoControllerSuspend(state); echoCancelCapture(state); echoReleaseTextFocus(state);
        return deactivate.apply(this, arguments);
    };
    function pointerGuard(event) {
        if (echoControllerPointerAllowed(state)) return;
        if (event.preventDefault) event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation(); else event.stopPropagation();
    }
    state.root.addEventListener('click', pointerGuard, true);
    state.root.addEventListener('mousedown', pointerGuard, true);
    echoControllerInstall(state);
    echoControllerLog(state, 'bridge', {available:state.controller.available, reason:state.controller.capabilityIssue});
}
