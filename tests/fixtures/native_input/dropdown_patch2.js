"use strict";

////////////////////////////////////////////////////////////////////////////////////
//	GbxDropDown
//
//	Elements:
//
//	Attributes:
//		native-code-expand : boolean
//          - Showing/hiding the dropdown is strictly owned by CPP code
//		
//      show-selected-header : boolean
//		    - Header should display the last selected option
//
//		items-consume-input : boolean
//          - Clicking a dropdown item does not count as clicking the dropdown itself
//
//      collapse-nested-items : boolean
//          - Nested items are only shown when parent item is selected

class GbxDropDown extends GbxCustomElement
{
    constructor()
    {
        super();
    }

    Init()
    {
        super.Init();
        this.EVENTS = {
            OnDropdownItemSelected: "OnDropdownItemSelected"
        }
        this.IsExpanded = false;
        this.SetDataModel = this.SetDataModel.bind(this);
        this.SetListener = this.SetListener.bind(this);
        this.Event_DataUpdated = this.Event_DataUpdated.bind(this);
        this.OnWindowClick = this.OnWindowClick.bind(this);
        
        this.DropdownList = this.querySelector(".dropdown_scroll_list");
        this.InitListInput();

        this.CursorHandler = new CursorHandler
        ({
            element: this,
            onClickEvent: this.OnClick,
            onEnter: ()=>
            {
		        this.Widget.TriggerWidgetEvent("OnInputFocusChanged", this.Widget.WidgetIdent, this.Name, -2); // Can't use a positive value because that would indicate hovering a dispay item inside the list
                this.Widget.PlaySoundAtNode(this, "ElementFocused");
            },
            onLeave: ()=>
            {
		        this.Widget.TriggerWidgetEvent("OnInputFocusChanged", this.Widget.WidgetIdent, this.Name, -1); // -1 == INDEX_NONE
                this.Widget.PlaySoundAtNode(this, "ElementUnfocused");
            }
        });

        this.Name = this.parentElement.getAttribute("name");
        this.bConsumeNextClick = false;
        this.bHideNextClickAudio = false;
        this.bHasNestedItems = false;
        this.bNeedsCustomCursorHandlerSetup = false;

        this.DropdownScrollList = undefined;

        this.functionEscapeInputListener = this.EscapeInputListener.bind(this);
        document.addEventListener('Event_CohEscapeInput', this.functionEscapeInputListener);
    }

    UpdateScrollBar()
    {
        if (this.classList.contains("dropdown"))
        {
            if(this.DropdownScrollList)
            {
                window.setTimeout(() => {
                    this.DropdownScrollList.update();
                }, 100);
            }
            else
            {
                this.DropdownScrollList = new OAKScroll(this.DropdownList);
            }
        }
    }

    DeInit()
    {
        document.removeEventListener('Event_CohEscapeInput', this.functionEscapeInputListener);

        if (this.IsExpanded)
        {
            this.OnClick(undefined);
        }

        super.DeInit();
    }
    
    FixUpAttributes()
    {
        this.bNativeCodeExpand = this.parentElement.hasAttribute("native-code-expand");
        this.bShowSelectedInHeader = this.parentElement.hasAttribute("show-selected-header");
        this.bItemsConsumeInput = this.parentElement.hasAttribute("items-consume-input");
        this.bCollapseNestedItems = this.parentElement.hasAttribute("collapse-nested-items");
        this.bNativeClickListener = this.parentElement.hasAttribute("native-click-listener");
        this.componentInputId = this.parentElement.getAttribute("component-input-id");

        this.InitListInput();
    }

    EscapeInputListener(e)
    {
        if (this.bNativeCodeExpand) 
        {
            let nameIdent = this.Name;

            if (!this.Widget) return;
            if (nameIdent != e.detail.ident) return;
            this.Widget.TriggerWidgetEvent("Event_OnDropdownClicked", nameIdent);
        } 
        else 
        {
            if (!this.DataModel) return;
            if (this.DataModel.ident != e.detail.ident) return;

            if (this.IsExpanded) 
            {
                this.OnClick(undefined);
            }
        }
    }

    SetDataModel(Model)
    {
        this.DataModel = Model;
    }

    SetListener(Listener)
    {
        this.ListenerElement = Listener;
    }

    // Only use this if you need to manually or dynamically update the Name value instead of setting it as an attribute.
    SetName(InName)
    {
        this.Name = InName;
    }

    OnWindowClick(e)
    {
        if (!this.IsExpanded) return;

        if (!this.contains(e.target))
        {
            this.OnClickedOutsideDropdown();
        }
    }

    SetWidget(Widget)
    {
        this.Widget = Widget;
    }

    OnDropdownItemFocused(Idx, event)
    {
        this.Widget.PlaySoundAtNode(this, (Idx === -1) ? "ElementUnfocused" : "ElementFocused");

        this.focusedItemElement = (Idx === -1) ? undefined : event.currentTarget;

        //console.warn(this.Name + " - OnDropdownItemFocused("+Idx+")");

        if (this.ListenerElement && typeof this.ListenerElement.OnDropdownItemFocused === 'function') 
        {
            this.ListenerElement.OnDropdownItemFocused(this.Name, Idx, event);
        }
    }

    OnDropdownItemClicked(Idx)
    {
        if (!this.DataModel) return;
        const DisplayItemData = this.DataModel.displayitems[Idx];
        if (DisplayItemData.hasOwnProperty("isdisabled") && DisplayItemData.isdisabled)
        {
            this.bHideNextClickAudio = true;

            if (this.bItemsConsumeInput)
            {
                this.bConsumeNextClick = true; // GBX:GVand - Disabled buttons in the dropdown still consume the input (if the list says buttons consume input)
            }
            return;
        }
        
        let bRefreshDataModel = false;

        if (!this.bNativeCodeExpand && DisplayItemData.haschildren)
        {
            DisplayItemData.isexpanded = !DisplayItemData.isexpanded;
            bRefreshDataModel = true;
        }

        if (this.bShowSelectedInHeader)
        {
            this.DataModel.headerlabel = DisplayItemData.label;
            bRefreshDataModel = true;
        }

        if (bRefreshDataModel)
        {
            engine.updateWholeModel(this.DataModel);
            engine.synchronizeModels();
        }

        //console.warn(this.Name + " - OnDropdownItemClicked("+Idx+")");
        if (this.ListenerElement && typeof this.ListenerElement.OnDropdownItemSelected === 'function') 
        {
            this.ListenerElement.OnDropdownItemSelected(this.Name, Idx);
        }
        else
        {
            console.warn(this.Name + " - OnDropdownItemSelected("+Idx+") - Listener Function Does Not Exist!");
        }

        if (this.bItemsConsumeInput) 
        {
            this.bConsumeNextClick = true;
        }

        this.bHideNextClickAudio = true;
    }

    OnClick(event)
    {
        if (this.bConsumeNextClick)
        {
            this.bConsumeNextClick = false;
        }
        else
        {
            if (this.ListenerElement && typeof this.ListenerElement.OnDropdownClicked === 'function') 
            {
                this.ListenerElement.OnDropdownClicked(this.Name, this.IsExpanded);
            }
            if (this.bNativeCodeExpand)
            {
                // GBX:GVand - Do nothing, CPP code owns this functionality
                // GBX:KChong - EscapeInputHandler functionality will need to be handled in code.
            }
            else
            {
                if (this.IsExpanded)
                {
                    this.classList.remove("expanded");

                    if (this.Widget)
                    {
                        this.Widget.TriggerWidgetEvent("Event_OnCohEscapeInputHandlerRemoved", this.Name);

                        if (!this.bHideNextClickAudio)
                        {
                            this.Widget.PlaySoundAtNode(this, "EscapeInput");
                        }
                        
                    } 

                    this.ClearFocusedEntry();
                }
                else 
                {
                    this.classList.add("expanded");
                    
                    if (this.Widget) 
                    {
                        this.Widget.TriggerWidgetEvent("Event_OnCohEscapeInputHandlerAdded", this.Name);

                        if (!this.bHideNextClickAudio)
                        {
                            this.Widget.PlaySoundAtNode(this, "ElementClicked");
                        }
                    }
                }

                this.IsExpanded = !this.IsExpanded;
                this.UpdateWindowClickListener();
                this.UpdateDirectionalNavigation();
            }
        }

        if (!InputMgr.IsUsingCursor())
        {
            // The below is intended to halt a situation where we trigger a click inside the dropdown while using directional navigation
            // that then propagates until it reaches the entry that contains the dropdown, which could potentially trigger unwanted behavior.
            if (event)
            {
                event.stopPropagation();
            }
        }

        this.bHideNextClickAudio = false;
    }

    OnClickedOutsideDropdown()
    {
        if (this.IsExpanded)
        {
            this.OnClick(undefined);

            // Use the below code should calling OnClick ever not result in closing an expanded dropdown.
            /*
            if (this.bNativeCodeExpand)
            {
                this.Widget.TriggerWidgetEvent("Event_OnDropdownClicked", this.Name);

                // GBX:kchong - Event_DataUpdated() will handle the call to UpdateWindowClickListener().
            }
            else
            {
                this.firstElementChild.classList.remove("expanded");
                this.IsExpanded = false;

                this.UpdateWindowClickListener();
                this.UpdateDirectionalNavigation();
            }
            */
        }
    }

    OnFocusList()
    {
        
    }

    OnUnfocusList()
    {
        this.Widget.PlaySoundAtNode(this, "ElementUnfocused");
    }

    Event_DataUpdated()
    {
        if (!this.DataModel) return;

        if (this.bNativeCodeExpand && (this.IsExpanded != this.DataModel.isexpanded))
        {
            if (this.DataModel.isexpanded) this.classList.add("expanded");
            else this.classList.remove("expanded");

            this.IsExpanded = this.DataModel.isexpanded;
            
            if (!this.IsExpanded) {
                this.ClearFocusedEntry();
            }

            if (this.bNativeClickListener)
            {
                this.UpdateWindowClickListener();
            }

            this.UpdateDirectionalNavigation();
        }
        
        this.UpdateScrollBar();
        this.UpdateDropdownItems();
    }

    UpdateDropdownItems()
    {
        const DisplayItemsData = this?.DataModel?.displayitems;
        if (DisplayItemsData === undefined) return;

        if (!this.DropdownItemContainer) this.DropdownItemContainer = this.querySelector(".dropdown_scroll_list");
        if (!this.DropdownItemContainer) return;

        this.bHasNestedItems = false;
        DisplayItemsData.forEach((Data, Idx)=>
        {
            if (!this.DropdownItemContainer.children.hasOwnProperty(Idx)) return;
            let Item = this.DropdownItemContainer.children[Idx];

            if (this.bNeedsCustomCursorHandlerSetup) {
                Item = this.GetCursorHandlerElementForItem(Item);
            }

            if(Item === undefined) return;
            Item.Widget = this.Widget;
            if (!Item.hasOwnProperty("CursorHandler"))
            {
                Item.CursorHandler = new CursorHandler
                ({
                    element: Item,
                    onClick: ()=>{this.OnDropdownItemClicked(Idx);},
                    onEnterEvent: (event)=>{this.OnDropdownItemFocused(Idx, event);},
                    onLeaveEvent: (event)=>{this.OnDropdownItemFocused(-1, event);}
                });
            }

            if (Data.tooltipkey) {
                Item.setAttribute("tooltip-data-key", Data.tooltipkey);
            }

            if (Item.DepthClass !== undefined) Item.classList.remove(Item.DepthClass);
            Item.DepthClass = "depth" + Data.depth;

            let itemClassList = Item.classList;

            itemClassList.add(Item.DepthClass);

            itemClassList.toggle("collapsed_child", Data.iscollapsedchild);
            itemClassList.toggle("blacklist", Data.isblacklisted);
            itemClassList.toggle("has_items", Data.haschildren);
            itemClassList.toggle("checkbox", Data.ischeckbox);
            itemClassList.toggle("selected", Data.isselected);
            itemClassList.toggle("disabled", Data.isdisabled);
            itemClassList.toggle("expanded", Data.isexpanded);
            itemClassList.toggle("locked", Data.islocked);

            let bDirectionalInputEnabled = true;
            bDirectionalInputEnabled &= !(Data.islocked || Data.isdisabled || this.DataModel.isdisabled);
            bDirectionalInputEnabled &= !(this.bCollapseNestedItems && Data.iscollapsedchild);
            Item.dataset.inputDisabled = bDirectionalInputEnabled ? "false" :  "true";

            this.bHasNestedItems |= (Data.depth > 0);
        });
    }

    UpdateWindowClickListener()
    {
        if (this.IsExpanded)
        {
            // We should only ever have this event listener active when the dropdown is expanded.
            window.addEventListener("click", this.OnWindowClick);
        }
        else
        {
            window.removeEventListener("click", this.OnWindowClick);
        }
    }

    UpdateDirectionalNavigation()
    {
        if (!this.Widget) return;
        if (!this.DropdownList) return;

        this.DropdownList.dataset.inputDisabled = this.IsExpanded ? "false" :  "true";

        if (this.DropdownList)
        {
            if (this.IsExpanded)
            {
                this.DropdownList.addEventListener('Event_OnDirectionalNavigationItemFocus', InputMgr.functionOnDirectionalNavigationItemFocus);
            }
            else
            {
                this.DropdownList.removeEventListener('Event_OnDirectionalNavigationItemFocus', InputMgr.functionOnDirectionalNavigationItemFocus);
            }
        }

        this.Widget.dispatchEvent(new CustomEvent('Event_DropdownNavigationUpdate', {
            detail: {
                navigationEnabled: this.IsExpanded,
				dropdownInputContainer: this.DropdownList
            }
        }));
    }

    GetCursorHandlerElementForItem(CurrentItem)
    {
        return CurrentItem;
    }

    ClearFocusedEntry()
    {
        // Focusing is handled when using directional navigation, this function is intended to handle when using mouse/cursor.
        if (!InputMgr.IsUsingCursor()) {
            return;
        }

        if (!this.focusedItemElement) {
            return;
        }

        this.focusedItemElement.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, view: window }));
        this.focusedItemElement = undefined;
    }

    InitListInput()
    {
        if (this.DropdownList)
        {
            if (this.componentInputId)
            {
                this.DropdownList.dataset.inputId = this.componentInputId;
            }
            
            this.DropdownList.dataset.inputDisabled = "true";
        }
    }
};

window.customElements.define('gbx-dropdown', GbxDropDown);