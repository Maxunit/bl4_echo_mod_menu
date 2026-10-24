/* Shared locale identities, explicit selection and a bounded language popup.
 * Only this panel owns its focus/cancel context. No native model is changed.
 */
var echoLanguages = __ECHO_LANGUAGES__;
var echoLanguageFontFaces = __ECHO_LANGUAGE_FONTS__;
function echoLanguageInstallFonts() {
    if (document.getElementById('echo-language-fonts')) return;
    var style = document.createElement('style');
    style.id = 'echo-language-fonts';
    style.textContent = echoLanguageFontFaces.map(function (font) {
        return '@font-face {font-family:"' + font.family + '";font-style:normal;font-weight:400;' +
            'src:url("coui://uiresources/echo_mod_menu/fonts/' + font.file + '") format("truetype");}';
    }).join('\n');
    // Keep the registration for this document's lifetime. It is independent
    // from widget destruction/recreation and is never removed on redraw.
    (document.head || document.body).appendChild(style);
}
function echoLocale(code) {
    code = String(code || '').toLowerCase().replace(/_/g, '-');
    var exact = echoLanguages.filter(function (row) { return row.code === code || row.aliases.indexOf(code) >= 0; })[0];
    if (exact) return exact.code;
    var prefix = echoLanguages.filter(function (row) { return code.indexOf(row.code + '-') === 0; })[0];
    if (prefix) return prefix.code;
    var base = code.split('-')[0];
    return (echoLanguages.filter(function (row) { return row.code === base || row.aliases.indexOf(base) >= 0; })[0] || echoLanguages[0]).code;
}
function echoLanguage(state) {
    if (state.preference && state.preference !== 'auto') return echoLocale(state.preference);
    var detected = typeof LanguageSettings !== 'undefined' && LanguageSettings.CurrentLangCode || '';
    return echoLocale(detected || document.documentElement && document.documentElement.lang);
}
function echoLanguageEntry(code) {
    return echoLanguages.filter(function (row) { return row.code === code; })[0] || echoLanguages[0];
}
function echoLanguageFont(code) {
    var font = echoLanguageFontFaces.filter(function (row) { return row.code === code; })[0];
    var common = echoLanguageFontFaces.filter(function (row) { return row.code === 'latin'; })[0];
    return (font ? '"' + font.family + '",' : '') + 'Industry-Medium' + (common ? ',"' + common.family + '"' : '');
}
function echoMenuFont(code) {
    var font = echoLanguageFontFaces.filter(function (row) { return row.code === code; })[0];
    var common = echoLanguageFontFaces.filter(function (row) { return row.code === 'latin'; })[0];
    return 'Industry-Medium' + (font ? ',"' + font.family + '"' : '') + (common ? ',"' + common.family + '"' : '');
}
function echoLanguageExpanded(menu, expanded) {
    menu.anchor.setAttribute('aria-expanded',expanded ? 'true' : 'false');
    menu.arrow.style.borderTop = expanded ? '0 solid transparent' : '0.55rem solid #90b9c8';
    menu.arrow.style.borderBottom = expanded ? '0.55rem solid #90b9c8' : '0 solid transparent';
}
function echoLanguageClose(state, restore) {
    var menu = state.languageMenu;
    if (!menu) return;
    state.languageMenu = null;
    menu.pane.frame.style.display = 'none';
    if (menu.pane.observer) menu.pane.observer.disconnect();
    state.scrollPanes = state.scrollPanes.filter(function (pane) { return pane !== menu.pane; });
    delete state.paneCache['echo-language-list'];
    delete state.positions['language-list'];
    if (echoScrollDrag && echoScrollDrag.pane === menu.pane) echoScrollDrag = null;
    [menu.panel,menu.shield].forEach(function (node) { if (node.parentElement) node.parentElement.removeChild(node); });
    echoLanguageExpanded(menu,false);
    if (menu.captureBefore === undefined) delete state.widget.dataset.bIsDirectionalInputCaptureActive;
    else state.widget.dataset.bIsDirectionalInputCaptureActive = menu.captureBefore;
    var nav = state.controller;
    nav.current = 'language:select'; nav.region = 'language';
    echoControllerEscapeSync(state);
    if (restore && state.visible && !state.closed && state.widget.IsActivated) {
        echoControllerRefresh(state);
        if (!nav.directional) menu.anchor.focus();
    }
}
function echoLanguageOpen(state, anchor, wrap, arrow) {
    if (state.languageMenu) { echoLanguageClose(state, true); return; }
    if (state.busy || !state.active || !state.visible || !state.widget.IsActivated || state.closed) return;
    echoControllerEndEdit(state, true); echoCancelCapture(state); echoReleaseTextFocus(state);
    var selected = echoLanguage(state), menu = {anchor:anchor,arrow:arrow,generation:state.generation,
        captureBefore:state.widget.dataset.bIsDirectionalInputCaptureActive};
    menu.shield = echoNode(state.root, 'div', null, 'echo-language-shield',
        'position:absolute;left:0;right:0;top:0;bottom:0;z-index:60;background-color:rgba(0,8,14,0.2);');
    menu.panel = echoNode(wrap, 'div', null, 'echo-language-popup',
        'position:absolute;right:0;top:3.8rem;width:29rem;height:34rem;z-index:80;padding:0.5rem;border:1px solid #6ea3b3;background-color:#04151e;');
    menu.panel.setAttribute('role','listbox'); menu.panel.setAttribute('aria-label',echoT(state,'language'));
    var content = echoScrollPane(state, menu.panel, 'language-list', 'echo-language-list', '0.2rem');
    menu.pane = state.paneCache['echo-language-list'];
    state.languageMenu = menu;
    function current() { return state.languageMenu === menu && state.generation === menu.generation && state.visible && state.widget.IsActivated && !state.closed && !state.busy; }
    echoLanguages.forEach(function (row) {
        var button = echoControllerButton(state, content, 'language-option:' + row.code, 'language-list', '', function () {
            if (!current()) return;
            echoLanguageClose(state, true); echoPrefer(state, row.code);
        }, row.code === selected, 'width:100%;height:3.8rem;min-height:3.8rem;margin:0 0 0.3rem 0;padding:0.4rem 0.7rem;justify-content:flex-start;', false,
        {background:row.code === selected ? '#15485a' : '#092a35',hover:'#1a5264',border:'transparent',focus:'#9ae9ff',corner:false});
        button.className = 'echo-language-option'; button.setAttribute('role','option'); button.setAttribute('aria-selected',row.code === selected ? 'true' : 'false');
        echoNode(button, 'div', null, '', 'width:0.5rem;height:0.5rem;margin-right:0.9rem;background-color:' + (row.code === selected ? '#df9d4e' : 'transparent') + ';pointer-events:none;');
        var label = echoText(button, row.name, 'echo-language-name', 'flex:1;white-space:nowrap;font-size:1.5rem;font-style:normal;font-weight:400;font-family:' + echoLanguageFont(row.code) + ';');
        label.setAttribute('lang',row.code); button.setAttribute('lang',row.code);
    });
    echoLanguageExpanded(menu,true);
    if (state.controller.available && typeof InputMgr !== 'undefined' && echoControllerState(InputMgr) === state)
        InputMgr.SetDirectionalInputCaptureActiveForWidget(state.widget,true);
    state.controller.current = 'language-option:' + selected; state.controller.region = 'language-list';
    echoControllerEscapeSync(state); echoControllerRefresh(state);
    // In cursor mode there is no directional focus yet. Still expose the
    // currently selected language in the scrolled viewport on first open.
    var target = echoControllerCurrent(state);
    if (target) {
        var box = target.node.getBoundingClientRect(), view = menu.pane.view.getBoundingClientRect();
        if (box.bottom > view.bottom) echoScrollTo(menu.pane, box.bottom - view.bottom);
    }
}
function echoLanguageRender(state, parent) {
    echoLanguageInstallFonts();
    var auto = echoControllerButton(state, parent, 'language:auto', 'language', echoT(state,'auto'), function () { echoPrefer(state,'auto'); },
        state.preference === 'auto', 'height:3.4rem;font-size:1.2rem;padding:0.4rem 0.8rem;');
    auto.setAttribute('aria-pressed',state.preference === 'auto' ? 'true' : 'false');
    var wrap = echoNode(parent, 'div', null, 'echo-language-select', 'width:25rem;overflow:visible;');
    var selected = echoLanguageEntry(echoLanguage(state)), arrow;
    var button = echoControllerButton(state, wrap, 'language:select', 'language', '', function () { echoLanguageOpen(state,button,wrap,arrow); },
        state.preference !== 'auto', 'width:100%;height:3.4rem;margin:0;justify-content:space-between;padding:0.4rem 0.9rem;', false,
        {background:'#092a35',hover:'#17475a',border:'#578293',focus:'#9ae9ff',corner:false});
    button.className = 'echo-language-trigger'; button.setAttribute('aria-haspopup','listbox'); button.setAttribute('aria-expanded','false');
    var label = echoText(button, selected.name, 'echo-language-current', 'flex:1;font-size:1.4rem;white-space:nowrap;font-style:normal;font-weight:400;font-family:' + echoLanguageFont(selected.code) + ';');
    label.setAttribute('lang',selected.code);
    arrow = echoNode(button,'div',null,'echo-language-arrow','width:0;height:0;margin-left:1rem;border-left:0.45rem solid transparent;border-right:0.45rem solid transparent;border-top:0.55rem solid #90b9c8;pointer-events:none;');
}
function echoLanguagePointer(state, event) {
    if (event.type === 'mousedown') state.languageDismissClick = false;
    if (event.type === 'click' && state.languageDismissClick) {
        state.languageDismissClick = false;
        if (event.preventDefault) event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation(); else event.stopPropagation();
        return;
    }
    var menu = state.languageMenu;
    if (!menu || echoControllerContains(menu.panel,event.target) || echoControllerContains(menu.anchor,event.target)) return;
    echoLanguageClose(state,true);
    state.languageDismissClick = event.type === 'mousedown';
    if (event.preventDefault) event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation(); else event.stopPropagation();
}
function echoLanguageKey(state, event) {
    var menu = state.languageMenu;
    if (!menu) return;
    var key = event.key || ({27:'Escape',13:'Enter',38:'ArrowUp',40:'ArrowDown',37:'ArrowLeft',39:'ArrowRight',9:'Tab'})[event.keyCode];
    if (['Escape','Esc','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].indexOf(key) < 0) return;
    if (event.preventDefault) event.preventDefault(); event.stopPropagation();
    if (key === 'Escape' || key === 'Esc' || key === 'Tab') { echoLanguageClose(state,true); return; }
    var targets = echoControllerTargets(state,'language-list'), target = echoControllerCurrent(state), index = targets.indexOf(target);
    if (key === 'Enter') { if (target) target.node.echoInvoke(); return; }
    if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
    target = targets[Math.max(0,Math.min(targets.length - 1,index + (key === 'ArrowUp' ? -1 : 1)))];
    if (!target) return;
    echoControllerRemember(state,target);
    target.node.focus();
    var box = target.node.getBoundingClientRect(), view = menu.pane.view.getBoundingClientRect();
    if (box.top < view.top) echoScrollTo(menu.pane,echoScrollPosition(menu.pane) + box.top - view.top);
    else if (box.bottom > view.bottom) echoScrollTo(menu.pane,echoScrollPosition(menu.pane) + box.bottom - view.bottom);
}
