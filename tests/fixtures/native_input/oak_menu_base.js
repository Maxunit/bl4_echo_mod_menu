class Widget_OakMenuBase extends Widget_MenuBase
{
    connectedCallback()
    {
		super.connectedCallback();
	}

    Init()
    {
        super.Init();
        this.functionOnInfoElementFocused = (e) => this.OnInfoElementFocused(e);
		this.functionOnInfoElementUnfocused = (e) => this.OnInfoElementUnfocused(e);
        this.functionOnScrollbarSound = (e) => this.OnScrollbarSound(e);

		this.MaterialEvent = "";
		this.MaterialParams = {};
    }

    Event_Activate()
    {
        super.Event_Activate();

        this.UpdateHintBar();
        
        this.WidgetDiv.addEventListener('Event_Tooltip_ElementFocused', this.functionOnInfoElementFocused);
        this.WidgetDiv.addEventListener('Event_Tooltip_ElementUnfocused', this.functionOnInfoElementUnfocused);

        this.addEventListener('OakScroll-scrollbarSound', this.functionOnScrollbarSound);
    }

    Event_Deactivate()
    {
        this.OnInfoElementUnfocused({ detail: undefined });

        this.WidgetDiv.removeEventListener('Event_Tooltip_ElementFocused', this.functionOnInfoElementFocused);
        this.WidgetDiv.removeEventListener('Event_Tooltip_ElementUnfocused', this.functionOnInfoElementUnfocused);

        this.removeEventListener('OakScroll-scrollbarSound', this.functionOnScrollbarSound);

        super.Event_Deactivate();
    }

    Event_UnregisterInput()
    {
        super.Event_UnregisterInput();
        
        this.OnInfoElementUnfocused({
            detail: {
                targetTooltipId: ''
            }
        });
    }

    Event_ManualActivate()
    {
        super.Event_ManualActivate();

        this.PlaySound("MenuOpen");
    }

    Event_ManualDeactivate()
    {
        this.PlaySound("MenuClose");

        super.Event_ManualDeactivate();
    }

    RegisterEvents()
    {
        super.RegisterEvents();

        this.RegisterWidgetEvent("TriggerCohEscapeInput", function (inIdent) { this.Event_TriggerCohEscapeInput(inIdent); }.bind(this));
    }

    UpdateHintBar()
    {
        var hintBarParams = OakUtils.SetupHintBarParams(this.WidgetIdent);

        // Child classes should replace this functionality, if desired.
        engine.trigger("Event_OnHintBarEntriesReceived", [], hintBarParams);
    }

    OnInfoElementFocused(eventData)
    {
        if (eventData)
        {
            if (eventData.detail.tooltipKey)
            {
                this.TriggerWidgetEvent("Event_OnTooltipFocused", eventData.detail.tooltipKey);

                this.WidgetDiv.dispatchEvent(new CustomEvent('Event_TooltipFocused', {
                    detail: {
                        infoData: eventData.detail
                }}));

                document.dispatchEvent(new CustomEvent('Event_DocumentTooltipFocused', {
                    detail: {
                        infoData: eventData ? eventData.detail : undefined
                    }
                }));
            }
			else
            {
                this.WidgetDiv.dispatchEvent(new CustomEvent('Event_TooltipUnfocused', {
                    detail: {
                        infoData: eventData.detail
                    }
                }));
            }            
        }
    }

    OnInfoElementUnfocused(eventData)
    {
        this.TriggerWidgetEvent("Event_OnTooltipUnfocused");

        this.WidgetDiv.dispatchEvent(new CustomEvent('Event_TooltipUnfocused', {
            detail: {
                infoData: eventData ? eventData.detail : undefined
            }
        }));
    }

    Event_TriggerCohEscapeInput(inIdent)
    {
        document.dispatchEvent(new CustomEvent('Event_CohEscapeInput', {
            detail: {
                ident: inIdent
            }
        }));
	}

	PlayMaterialAnimation(materialEvent, params = {})
	{
		// The material animation to play
		this.MaterialEvent = materialEvent;
		// Optional parameters to pass into the material
		this.MaterialParams = params;

		engine.trigger("Event_PlayMaterialAnimation", this.GetMaterialAnimationEventObject());
	}

	PlayMaterialAnimationTargetDiv(materialEvent, divBoundingRect)
	{
		this.MaterialEvent = materialEvent;

		// divBoundingRect should have the X/Y/Width/Height of the div to target.
		// This can be returned from getBoundingClientRect().
		this.MaterialParams = {
			divX: divBoundingRect.x / window.innerWidth,
			divY: divBoundingRect.y / window.innerHeight,
			divWidth: divBoundingRect.width / window.innerWidth,
			divHeight: divBoundingRect.height / window.innerHeight
		}

		engine.trigger("Event_PlayMaterialAnimation", this.GetMaterialAnimationEventObject());
	}

	GetMaterialAnimationEventObject()
	{
		// create object that will be converted to c++ struct type
		return {
			__Type: 'FOakUIMaterialAnimationEventObject',
			MaterialEvent: this.MaterialEvent,
			Params: this.MaterialParams
		}
	}

    OnScrollbarSound(eventData)
    {
        if (!eventData || !eventData.detail)
        {
            return;
        }

        this.PlaySound(eventData.detail.soundIdent);
    }
}

class Widget_OakMenuBase_Debug extends Widget_OakMenuBase
{
    // Fill this out with debug-specific functionality.
    connectedCallback()
    {
		super.connectedCallback();
	}

    Event_RegisterInput()
    {

    }
}