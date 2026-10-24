/* Attach only to ECHO's native ListMenu instance, after the game's original
 * attachment/lifecycle method. Never activate a tab or modify native models. */
if (!window.EchoModMenu) {
    var viewClosed = false, materialDisabled = false;
    window.EchoModMenu = {version:'1.2.0', diagnostics:function () { return clientEvents.slice(); }};
    window.addEventListener('pagehide', function () { viewClosed = true; }, true);
    function playTransition(widget) {
        if (widget.IsActivated !== true || widget.IsInitialized !== true || viewClosed || materialDisabled) return;
        try {
            if (typeof widget.PlayMaterialAnimation !== 'function') throw new Error('Native material animation bridge unavailable');
            widget.PlayMaterialAnimation('MenuSwitchRight', {});
        } catch (error) {
            materialDisabled = true;
            record('transition_error', {error:short(error)});
        }
    }
    function observeEditor(widget) {
        if (!widget || widget.WidgetIdent !== 'def_bl4_empty_page_v40' || widget.EchoObserved) return;
        widget.EchoObserved = true;
        var title = widget.querySelector('.list_title');
        if (title) title.style.display = 'none';
        echoOnEditorLifecycle(widget, 'attached');
        ['Event_Activate','Event_Deactivate','Event_DataUpdated','UpdateHintBar'].forEach(function (name) {
            var original = widget[name];
            if (typeof original !== 'function') return;
            widget[name] = function () {
                var wasActive = this.IsActivated === true;
                var result = original.apply(this, arguments);
                if (name === 'Event_Activate' && !wasActive) playTransition(this);
                if (name !== 'Event_Activate' || !wasActive) echoOnEditorLifecycle(this, name);
                return result;
            };
        });
    }
    if (typeof WidgetManager !== 'undefined') {
        var attachInstance = WidgetManager.prototype.AttachInstance;
        WidgetManager.prototype.AttachInstance = function (request) {
            var result = attachInstance.apply(this, arguments);
            if (request && request.WidgetIdent === 'def_bl4_empty_page_v40') observeEditor(this.WidgetMap.get(request.WidgetIdent));
            return result;
        };
    }
    if (typeof WidgetMgr !== 'undefined' && WidgetMgr.WidgetMap) observeEditor(WidgetMgr.WidgetMap.get('def_bl4_empty_page_v40'));
}
