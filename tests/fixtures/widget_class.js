"use strict";

class WidgetBase extends GbxCustomElement
{
    constructor()
    {
        super()
        this.ClassIdent = undefined;
        this.WidgetIdent = undefined;
        this.WidgetDiv = null;
        this.Def = undefined;
        this.DataModel = undefined;
        
        this.DataModelId = undefined;
        this.WidgetInstId = undefined;
        this.InstId = 0;
        this.IsActivated = false;
        this.ActiveTextInputs = new Set();

        this.DirectionalInputPriority = 0;

        this.SupportsRootClass = false;
        this.SupportsHideFlags = false;
        this.RootClassHTML = undefined;
        this.HideFlags = 0;
    }

    connectedCallback()
    {
        this.WidgetDiv = this;
        this.WidgetDiv.id = this.dataset.WidgetIdent;
        this.ClassIdent = this.dataset.ClassIdent;
        this.WidgetIdent = this.dataset.WidgetIdent;
        this.DataModelId = this.dataset.DataModelId;
        this.DataModel = window[this.DataModelId];
        this.WidgetInstId = this.dataset.WidgetInstId;
        this.InstId = Number(this.dataset.InstId);
        this.setAttribute("gbx-component-id",this.ClassIdent);

        WidgetMgr.SetWidget(this.WidgetIdent, this);
        super.connectedCallback();
	}

    MakeEventName(eventName)
    {
        return "Event_" + this.WidgetIdent + "_" + this.InstId + "_" + eventName;
    }

    TriggerWidgetEvent(eventName, ...args)
    {
        engine.trigger(this.MakeEventName(eventName), ...args);
    }

    WidgetCall(call)
    {
        engine.trigger(this.MakeEventName(call));
    }

    Create(widgetIdent)
    {
        return eval(`new ${this.constructor.name}("${this.ClassIdent}", "${widgetIdent}")`);
    }

    SetupDataModel(instId)
    {
        this.InstId = instId;
        this.DataModelId = "data_" + this.WidgetIdent + "_" + instId;
        this.DataModel = window[this.DataModelId];
        this.WidgetInstId = this.WidgetIdent + "_" + instId;
    }

    Init()
    {
        super.Init();
        this.RegisterEvents();

        this.WidgetDiv.dataset.widgetIdent = this.WidgetIdent;
        this.WidgetDiv.dataset.classIdent = this.ClassIdent;

        this.InitSafeArea();

        this.Deactivate();
    }

    InitSafeArea()
    {
        this.SafeAreaElement = undefined;

        if (this.classList.contains("safe-area"))
        {
            this.SafeAreaElement = this;
        }
        else
        {
            this.SafeAreaElement = this.querySelector(".safe-area");
        }

        if (this.SafeAreaElement)
        {
            document.addEventListener("Event_SetSafeArea", (e) => this.Event_SetSafeArea(e));

            this.SafeAreaElement.safeAreaStyleMap = this.SafeAreaElement.attributeStyleMap; 
        }
    }

    RegisterWidgetEvent(eventName, method)
    {
        if (method === undefined || method === null)
        {
            console.warn("!!! [RegisterWidgetEvent] Trying to register a null js method for the engine");
            return;
        }

        if (eventName === undefined || eventName === null || eventName == "anonymous")
        {
            console.warn("!!! [RegisterWidgetEvent] Trying to register a js event without a name");
            return;
        }

        //console.info("[RegisterWidgetEvent] " + methodName)
        engine.on(this.MakeEventName(eventName), method);
    }

    Event_RegisterInput()
    {
        if (InputMgr)
        {
            InputMgr.Event_Input_FocusWidget(this.WidgetIdent, this.InstId, this.DirectionalInputPriority, true);
        }
    }

    Event_UnregisterInput()
    {
        if (InputMgr)
        {
            InputMgr.ClearWidgetFocus(this.WidgetIdent, this.InstId);
        }
    }

    Event_Activate()
    {
        this.BeginActivate();
    }

    Event_Deactivate()
    {
        this.BeginDeactivate();
    }

    BeginActivate()
    {
        this.Activate();
    }

    BeginDeactivate()
    {
        this.Deactivate();
    }

    Activate()
    {
        this.SupportsRootClass = (this.hasAttribute("root-class-enabled"));
        this.SupportsHideFlags = (this.hasAttribute("hide-flags-enabled"));
        this.classList.toggle("inactive", this.SupportsHideFlags && this.HideFlags);
        //this.classList.remove("inactive");
        this.IsActivated = true;

        if (InputMgr)
        {
            this.OnInputDeviceChanged(InputMgr);
        }

		this.TriggerWidgetEvent("ScriptEvent", "Activate");
    }

    Deactivate()
    {
        this.CleanupAnimations();
     
        if (InputMgr)
        {
            InputMgr.ClearWidgetFocus(this.WidgetIdent, this.InstId);
        }
        
        this.WidgetDiv.classList.add("inactive");
        this.IsActivated = false;
        this.SupportsRootClass = false;
        this.SupportsHideFlags = false;
		this.TriggerWidgetEvent("OnDeactivationDone");
		this.TriggerWidgetEvent("ScriptEvent", "Deactivate");
    }

    AcceptDefPayload(def)
    {
        this.Def = def;
        this.Event_Deactivate();
    }

    Event_DataUpdated()
    {
        //console.info("data model id:" + this.DataModelId);
        //console.info(JSON.stringify(this.DataModel));

        this.UpdateRootClass();
        this.UpdateHideFlags();
    }

    UpdateRootClass()
    {
        if (!this.IsActivated || !this.SupportsRootClass) return;
        if (this?.DataModel && this.DataModel.hasOwnProperty("rootclasshtml") && this.DataModel.rootclasshtml !== this.RootClassHTML)
        {
            if (this.RootClassHTML) this.classList.remove(this.RootClassHTML);
            this.RootClassHTML = this.DataModel.rootclasshtml;
            if (this.RootClassHTML) this.classList.add(this.RootClassHTML);
        }
    }

    UpdateHideFlags()
    {
        if (!this.IsActivated || !this.SupportsHideFlags) return;
        //console.warn("data model id:" + this.DataModelId + " " + this.IsActivated + " " + this.SupportsHideFlags + " " + this.DataModel.hideflags);
        if (this?.DataModel && this.DataModel.hasOwnProperty("hideflags") && this.DataModel.hideflags !== this.HideFlags)
        {
            this.HideFlags = this.DataModel.hideflags;
            this.classList.toggle("inactive", this.HideFlags);
        }
    }

    RegisterEvents()
    {
        this.RegisterWidgetEvent("Activate", function () { this.Event_Activate(); }.bind(this));
        this.RegisterWidgetEvent("Deactivate", function () { this.Event_Deactivate(); }.bind(this));
        this.RegisterWidgetEvent("DataUpdated", function () { this.Event_DataUpdated(); }.bind(this));
        this.RegisterWidgetEvent("RegisterInput", function () { this.Event_RegisterInput(); }.bind(this));
        this.RegisterWidgetEvent("UnregisterInput", function () { this.Event_UnregisterInput(); }.bind(this));
        this.RegisterWidgetEvent("VirtualKeyboardTextInputComplete", function () { this.Event_OnVirtualKeyboardTextInputComplete(); }.bind(this));
        this.RegisterWidgetEvent("OnToggleUI", function(bShowUI) { this.Event_ToggleUI(bShowUI); }.bind(this));
        this.RegisterWidgetEvent("WidgetSpecificActionTriggerEvent", function(actionName, triggerEvent, elapsedTime) { this.Event_WidgetSpecificActionTriggerEvent(actionName, triggerEvent, elapsedTime); }.bind(this));

        document.addEventListener("Event_OnInputAction", (e) => this.OnInputAction(e));
        document.addEventListener("Event_InputDeviceChanged", (e) => this.Event_InputDeviceChanged(e));

    }

    Event_ToggleUI(bShowUI)
    {
        this.classList.toggle("invisible", !bShowUI);
    }

    Event_SetSafeArea(e)
    {
        if (!e || !e.detail || !e.detail.newSafeArea)
        {
            return;
        }
        
        let newMargin = e.detail.newSafeArea;

        // we dont want safe area applied in splitscreen
        if (OakUtils.IsSplitscreenActive()) 
        {
            newMargin.X = 0.0;
            newMargin.Y = 0.0;
        }    

        if (this.SafeAreaElement)
        {
            this.SetSafeAreaOnElement(this.SafeAreaElement, newMargin);
        }
    }

    SetSafeAreaOnElement(element, newMargin)
    {
        if (!element)
        {
            return;
        }

        let safeAreaStyleMap = element.safeAreaStyleMap;
        if (!safeAreaStyleMap)
        {
            return;
        }

        //Left And Right
        let HorizontalPadding = (newMargin.X)*100; 
        //Top and Bottom
        let VerticalPadding = (newMargin.Y)*100;
        
        //Div Width
        let SafeWidth = (1-(newMargin.X*2))*100;
        let SafeHeight = (1-(newMargin.Y*2))*100;

        safeAreaStyleMap.set("width",   CSS.percent(SafeWidth));
        safeAreaStyleMap.set("height",  CSS.percent(SafeHeight));
        safeAreaStyleMap.set("margin-top",      CSS.vh(VerticalPadding));
        safeAreaStyleMap.set("margin-bottom",   CSS.vh(VerticalPadding));
        safeAreaStyleMap.set("margin-left",     CSS.vw(HorizontalPadding));
        safeAreaStyleMap.set("margin-right",    CSS.vw(HorizontalPadding));
    }

    OnInputAction(e)
    {
        if (e.detail && e.detail.widgetId == this.WidgetInstId)
        {
            this.OnWidgetInputAction(e.detail.inputActionName, e.detail.inputActionType);
        }
    }

    OnWidgetInputAction(actionName, actionType)
    {
    }

    Event_InputDeviceChanged(e)
    {
        if (e.detail && this.IsActivated)
        {
            this.OnInputDeviceChanged(e.detail);
        }
    }

    OnInputDeviceChanged(inputMgr)
    {
    }

    IsUsingGamepad()
    {
        return InputMgr != null && InputMgr.IsUsingGamepad();
    }

    IsUsingMouseKeyboard()
    {
        return InputMgr != null && InputMgr.IsUsingMouseKeyboard();
    }

    CleanupAnimations()
    {
        this.Animator?.CleanupAnimations();
    }

    StopAllAnimations()
    {
        this.Animator?.StopAllAnimations();
    }

    StopAllAnimationsOnNode(node)
    {
        this.Animator?.StopAllAnimationsOnNode(node);
    }

    UpdateAnimationProgress(AnimationId, Progress, Root = this.WidgetDiv)
    {
        this.Animator?.UpdateAnimationProgress(AnimationId, Progress, Root);
    }

    PlayAnimation(AnimationId, Options = {})
    {
        this.Animator?.PlayAnimation(AnimationId, Options);
    }

    StopAnimation(AnimationId, Options = {})
    {
        this.Animator?.StopAnimation(AnimationId, Options);
    }

    EndAnimation(AnimationId, Options = {})
    {
        this.Animator?.EndAnimation(AnimationId, Options);
    }

	IsAnimationPlaying(animationId) 
    {
        return this.GetAnimationHandle(animationId) !== null;
    }

    GetAnimationHandle(AnimationId, RootNode)
    {
        return  this.Animator?.GetAnimationHandle(AnimationId, RootNode);
    }

    SetAnimationHandle(AnimationId, RootNode, AnimationHandle)
    {
        this.Animator?.SetAnimationHandle(AnimationId, RootNode, AnimationHandle);
    }

    DeleteAnimationHandle(AnimationId, RootNode)
    {
        this.Animator?.DeleteAnimationHandle(AnimationId, RootNode);
    }

    PlaySound(id)
    {
		this.TriggerWidgetEvent("ScriptEvent_Spatial", id, 0, 0);
    }

    PlaySoundAt(id, positionX = 0, positionY = 0)
    {
		this.TriggerWidgetEvent("ScriptEvent_Spatial", id, positionX, positionY);
    }

    PlaySoundAtNode(node, id)
    {
        const box = node.getBoundingClientRect();
        const xCenter = (box.left + box.right) / 2;
        const yCenter = (box.top + box.bottom) / 2;

        const windowSize = OakUtils.WindowSize;

        //from [0..windowSize] to [-1, 1]
        const posX = ((xCenter / windowSize.x) - 0.5) * 2;
        const posY = ((yCenter / windowSize.y) - 0.5) * 2;

		this.TriggerWidgetEvent("ScriptEvent_Spatial", id, posX, posY);
	}

	TriggerScriptEvent(id)
	{
		this.TriggerWidgetEvent("ScriptEvent", id);
	}

    OnTextInputFocusedChanged(textInput, newFocus, textIdent = '')
    {
        let wasFocused = this.ActiveTextInputs.size > 0;

        if (newFocus)
        {
            this.ActiveTextInputs.add(textInput);
        }
        else
        {
            this.ActiveTextInputs.delete(textInput);
        }

        let isFocused = this.ActiveTextInputs.size > 0;

        if (wasFocused != isFocused)
        {
            engine.trigger(this.MakeEventName("TextInputHasFocusChanged"), isFocused, textIdent);
        }
    }

    Event_OnVirtualKeyboardTextInputComplete()
    {
        // Implement in child classes.
    }

    TryInputOverride(overrideValue)
    {
        return false;
    }
    
    Event_WidgetSpecificActionTriggerEvent(actionName, triggerEvent, elapsedTime)
    {
        this.WidgetDiv.dispatchEvent(new CustomEvent('Event_Input_WidgetSpecificActionTriggerEvent', {
			detail: {
				actionName: actionName,
				triggerEvent: triggerEvent,
				elapsedTime: elapsedTime
			}
		}));
    }
}
