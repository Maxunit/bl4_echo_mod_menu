/* Give the existing native entry its public caption. Keep selection, state,
 * sound and lifecycle delivery entirely in the original navigation widget. */
(function () {
    'use strict';
    if (window.EchoNavigationCaption || typeof Widget_NavigationBar === 'undefined') return;
    window.EchoNavigationCaption = true;
    function updateCaption(widget) {
        if (!widget || widget.WidgetIdent !== 'def_status_menu_nav_bar') return;
        var entries = widget.DataModel && widget.DataModel.entries || [];
        var items = widget.getElementsByClassName('top_nav_item_cntr');
        for (var i = 0; i < entries.length; ++i) {
            if (String(entries[i].ident || '').toLowerCase() !== 'bl4_mods_empty_v39' || !items[i]) continue;
            var caption = String(entries[i].text || '').trim(), nodes = items[i].querySelectorAll('*');
            for (var j = 0; j < nodes.length; ++j) {
                if (nodes[j].childElementCount === 0 && caption && String(nodes[j].textContent || '').trim() === caption) {
                    nodes[j].textContent = 'Mods'; return;
                }
            }
        }
    }
    ['Init','Event_DataUpdated','Event_Activate','Event_SetActiveNavItemByIndex'].forEach(function (name) {
        var original = Widget_NavigationBar.prototype[name];
        if (typeof original !== 'function') return;
        Widget_NavigationBar.prototype[name] = function () {
            var result = original.apply(this, arguments); updateCaption(this); return result;
        };
    });
})();
