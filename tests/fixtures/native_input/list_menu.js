"use strict";

class Widget_ListMenu extends Widget_OakMenuBase
{
    constructor()
	{
		super();
	}
	
	connectedCallback()
	{
		super.connectedCallback();
        this.LastEntryRev = -1;
        this.ListDiv = undefined;

        this.ListDiv = this.querySelector(".list");

        if (this.DataModel.Horizontal)
        {
            this.ListDiv.classList.add("list-horizontal");
        }
	}
	
	Init()
	{
		super.Init();

        this.registerToInputManager = true;
	}

    Create(widgetIdent)
    {
        // debugger
        let inst = new Widget_ListMenu(this.ClassIdent, widgetIdent, false);
        return inst;
    }

    Event_DataUpdated()
    {
    	super.Event_DataUpdated();
        if (this.DataModel.entriesrev == -1 || this.LastEntryRev == this.DataModel.entriesrev)
        {
            return;
        }

        this.LastEntryRev = this.DataModel.entriesrev;

        this.UpdateInputRegistration();
 
        this.UpdateHintBar();

        // TODO: jbrown needs to determine if we actually want this check anymore.
        /*
        if (!InputMgr.IsWidgetRegistered(this.id))
        {
            return;
        }
        */
    }

    UpdateHintBar()
    {
        var hintBarEntries = [];
        var hintBarParams = OakUtils.SetupHintBarParams(this.WidgetIdent);

        // Child classes should replace this functionality, if desired.
        hintBarEntries.push(OakUtils.SetupHintEntry("action_ui_menu_escape", "BackText"));

        engine.trigger("Event_OnHintBarEntriesReceived", hintBarEntries, hintBarParams);
    }
}
window.customElements.define('widget-list-menu', Widget_ListMenu);