"use strict";

class Widget_NavigationBar extends Widget_OakMenuBase
{
    constructor()
	{
		super();
	}
	
	connectedCallback()
	{
		super.connectedCallback();
	}
	
	Init()
	{
		super.Init();

        this.LastActiveIndex = -1;
        this.LastActiveSubIndex = -1;
	}

    Event_RegisterInput()
    {

    }

    Event_Reset()
    {
        // TODO: Handle anything we may need to do during a reset event.
    }

    RegisterEvents()
    {
        super.RegisterEvents();
        this.RegisterWidgetEvent("Reset", function () { this.Event_Reset(); }.bind(this));

        this.RegisterWidgetEvent("Event_SetActiveNavItemByIndex", function (index) { this.Event_SetActiveNavItemByIndex(index); }.bind(this));
        this.RegisterWidgetEvent("Event_SetActiveSubNavItemByIndex", function (index) { this.Event_SetActiveSubNavItemByIndex(index); }.bind(this));
    }

    Event_SetActiveNavItemByIndex(index)
    {
        if (this.DataModel === undefined) return;
        
        this.SetActiveNavItem(this.querySelector(".top_nav_cntr"), this.getElementsByClassName("top_nav_item_cntr"), this.DataModel.entries, index, false);
    }

    Event_SetActiveSubNavItemByIndex(index)
    {
        if (this.DataModel === undefined) return;

        this.SetActiveNavItem(this.querySelector(".sub_nav"), this.getElementsByClassName("sub_nav_item_cntr"), this.DataModel.submenuentries, index, true);
    }

    SetActiveNavItem(itemContainer, items, listData, activeIndex, subNav) 
    {
        if (itemContainer && items)
        {
            if (listData.length && activeIndex < listData.length)
            {
                for (let index = 0; index < listData.length; index++)
                {
                    const element = items[index];
                    if (element)
                    {
                        if (index == activeIndex)
                        {
                            if (!element.classList.contains("selected"))
                            {
                                this.PlayTabAudio(subNav, activeIndex, element);
                                element.classList.add("selected");

                                this.TryVerticalSplitscreenNavScroll(itemContainer, element);
                            }
                        } else
                        {
                            element.classList.remove("selected");
                        }
                    }
                }
            }
        }
    }

    PlayTabAudio(subNav, activeIndex, element)
    {
        let lastActiveIndex = subNav ? this.LastActiveSubIndex : this.LastActiveIndex;
        if (lastActiveIndex >= 0)
        {
            if (lastActiveIndex < activeIndex)
            {
                this.PlaySoundAtNode(element, subNav ? "SubNavForward" : "NavForward");
            }
            else if (lastActiveIndex > activeIndex)
            {
                this.PlaySoundAtNode(element, subNav ? "SubNavBackward" : "NavBackward");
            }
        }

        if( subNav )
        {
            this.LastActiveSubIndex = activeIndex;
        }
        else
        {
            this.LastActiveIndex = activeIndex;
        }
    }

    // overriding the parent to prevent conflicting hints getting pushed
    UpdateHintBar() { }

    Event_GlyphClicked(action)
    {
        this.TriggerWidgetEvent("GlyphClicked", action);
    }
    
    TabSelected(node, index)
    {
		this.TriggerWidgetEvent("InputSelectionChanged", true, this.id, "", index);
    }

    SubtabSelected(node, index)
    {
        this.TriggerWidgetEvent("InputSelectionChanged", true, this.id, "sub_menu_container_ident", index);
    }

    TryVerticalSplitscreenNavScroll(itemContainer, element)
    {
        if (!OakUtils.IsVerticalSplitscreenActive())
        {
            return;
        }

        if (!itemContainer || !element)
        {
            return;
        }

        const containerBounds = itemContainer.getBoundingClientRect();
        const elementBounds = element.getBoundingClientRect();

        const padding = elementBounds.width * 0.5;

        let doScroll = false;
        let targetScrollPosition = 0;

        if (elementBounds.x + elementBounds.width + padding > containerBounds.x + containerBounds.width)
        {
            doScroll = true;
            targetScrollPosition = itemContainer.scrollLeft + (elementBounds.x + elementBounds.width + padding) - (containerBounds.x + containerBounds.width);
        }
        else if (elementBounds.x < containerBounds.x)
        {
            doScroll = true;
            targetScrollPosition = Math.max(itemContainer.scrollLeft - (containerBounds.left - elementBounds.left) - padding, 0);
        }

        if (doScroll) {
            itemContainer.scrollLeft = targetScrollPosition;
        }
    }
}
window.customElements.define('widget-navigationbar', Widget_NavigationBar);
