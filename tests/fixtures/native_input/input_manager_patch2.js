"use strict";

// attribute keywords
// these arent used directly since we use the property accessors
// but provide a good key for whats possible
const INPUT_ELEM = "data-input-elem";
const INPUT_ID = "data-input-id";
const INPUT_FOCUSED = "data-input-focused";
const INPUT_SELECTED = "data-input-selected";
const INPUT_LINK_UP = "data-input-link-up";
const INPUT_LINK_RIGHT = "data-input-link-right";
const INPUT_LINK_DOWN = "data-input-link-down";
const INPUT_LINK_LEFT = "data-input-link-left";
const INPUT_DEFAULT = "data-input-default";
const INPUT_BEHAVIOR = "data-input-beh";
const INPUT_DIR = "data-input-dir";
const INPUT_DISABLED = "data-input-disabled";
const INPUT_ALLOW_MULTISELECT = "data-input-multiselect"
const INPUT_DISABLE_LAST_FOCUS = "data-input-disable-last-focus";
const INPUT_BEHAVIOR_OVERRIDE_UP = "data-input-behavior-up";
const INPUT_BEHAVIOR_OVERRIDE_RIGHT = "data-input-behavior-right";
const INPUT_BEHAVIOR_OVERRIDE_DOWN = "data-input-behavior-down";
const INPUT_BEHAVIOR_OVERRIDE_LEFT = "data-input-behavior-left";
const INPUT_NAV_LEFT_DISABLED = "data-input-nav-left-disabled";
const INPUT_NAV_RIGHT_DISABLED = "data-input-nav-right-disabled";
const INPUT_NAV_UP_DISABLED = "data-input-nav-left-disabled";
const INPUT_NAV_DOWN_DISABLED = "data-input-nav-right-disabled";
const INPUT_NAV_IS_SELECTABLE_CHILD = "data-input-nav-is-selectable-child";

const INPUT_DIR_VERT = "vert";
const INPUT_DIR_HORIZ = "horiz";

// input keywords
const INPUT_NAV_UP = "Input.Action.Menu.NavUp";
const INPUT_NAV_RIGHT = "Input.Action.Menu.NavRight";
const INPUT_NAV_DOWN = "Input.Action.Menu.NavDown";
const INPUT_NAV_LEFT = "Input.Action.Menu.NavLeft";
const INPUT_NAV_SELECTED = "Input.Action.Menu.NavSelect";

var InputActionType = { PRESSED: 1, RELEASED: 16 };
var InputDeviceType = { UNKNOWN: -1, MOUSE_KEYBOARD: 0, GAMEPAD: 1 };

var GamepadModel = { UNKNOWN: -1, DUALSHOCK4: 0, XBOX_ONE: 1, DUALSENSE: 2, XBOX_SERIES_X: 3, JOY_CON: 4, JOY_CON2: 5, JOY_CON2_MOUSE_LEFT: 6, JOY_CON2_MOUSE_RIGHT: 7, PRO_CONTROLLER: 8, PRO_CONTROLLER2: 9, SAGE_HANDHELD: 10 }; // Only these values until we can detect the gamepad brand.
var GamepadBrand = { UNKNOWN: -1, PLAYSTATION: 0, XBOX: 1, NINTENDO: 2 }; // Only these values until we can detect the gamepad brand.

var GamepadModelString = { 0: 'Dualshock4', 1: 'XboxOne', 2: 'Dualsense', 3: 'XboxSeriesX', 4: 'JoyCon', 5: 'JoyCon2', 6: 'JoyCon2MouseLeft', 7: 'JoyCon2MouseRight', 8: 'ProController', 9: 'ProController2', 10: 'SageHandheld' };
var GamepadBrandString = { 0: 'Playstation', 1: 'Xbox', 2: 'Nintendo' };

class InputManager
{
	constructor()
	{
		this.NavigationStack = [];
		this.BehaviorMap = new Map();
		this.CurrElement = undefined;
		this.CurrElementIdx = -1;
		this.CurrContainer = undefined;
		this.CurrWidget = undefined;
		this.CurrBehavior = undefined;
		this.CurrSelected = undefined;
		this.AllowMultiSelect = false;
		//this.LastFocusMap = new Map();
		this.LastFocusedInfoMap = new Map();
		this.SimulateMouse = false;
		this.SimulatingMouse = false;
		this.bIsUsingCursorNavigation = true;
		this.bIsDirectionalInputCaptureActive = false;
		this.pause = false;

		this.UserIndex = -1;
		this.InputDeviceType = InputDeviceType.UNKNOWN;
		this.GamepadModel = GamepadModel.UNKNOWN;
		this.GamepadBrand = GamepadBrand.UNKNOWN;

		this.LastMouseX = 0;
		this.LastMouseY = 0;

		this.functionOnDirectionalNavigationItemFocus = this.OnDirectionalNavigationItemFocus.bind(this);
	}

	Init()
	{
		// Actions
		RegisterGlobalEvent("Input_OnAction", (actionName, actionType) => this.OnInputAction(actionName, actionType));		

		// Input
		RegisterGlobalEvent("Input_Device_Changed", (userIndex, inputDeviceType, gamepadModel, gamepadBrand) => this.OnInputDeviceChanged(userIndex, inputDeviceType, gamepadModel, gamepadBrand));
		
		// Navigation
		// RegisterGlobalEvent("Input_Navigation_Type_Changed", (isUsingCursorNavigation) => this.OnNavigationTypeChanged(isbIsUsingCursorNavigation)); // TODO: Might be useful later?
		document.addEventListener("mousemove", (e) => this.OnCursorMove(e));
	}

	OnInputAction(actionName, actionType)
	{
		if (actionType == InputActionType.PRESSED)
		{
			switch (actionName)
			{
				case INPUT_NAV_UP:
				case INPUT_NAV_DOWN:
				case INPUT_NAV_LEFT:
				case INPUT_NAV_RIGHT:
					this.TryNavigation(actionName);
					break;

				case INPUT_NAV_SELECTED:
					this.Event_Input_Select();
					break;
			}
		}

		let currentWidgetId = this.CurrWidget ? this.CurrWidget.id + "_" + this.InstId : "";

		document.dispatchEvent(new CustomEvent('Event_OnInputAction', {
			detail: {
				widgetId: currentWidgetId,
				inputActionName: actionName,
				inputActionType: actionType
			}
		}));
	}

	TryNavigation(actionName)
	{
		if(this.pause) return;

		let allowDirectionalNavInput = true;
		if (this.CurrWidget)
		{
			if (actionName === INPUT_NAV_LEFT && this.CurrWidget.dataset.inputNavLeftDisabled === "true")
			{
				allowDirectionalNavInput = false;
			}
			else if (actionName === INPUT_NAV_RIGHT && this.CurrWidget.dataset.inputNavRightDisabled === "true")
			{
				allowDirectionalNavInput = false;
			}
			else if (actionName === INPUT_NAV_UP && this.CurrWidget.dataset.inputNavUpDisabled === "true")
			{
				allowDirectionalNavInput = false;
			}
			else if (actionName === INPUT_NAV_DOWN && this.CurrWidget.dataset.inputNavDownDisabled === "true")
			{
				allowDirectionalNavInput = false;
			}
		}
		
		if (allowDirectionalNavInput)
		{
			this.OnNavigationTypeChanged(false);
			this.Event_Input_Navigate(actionName);
		}
	}

	OnInputDeviceChanged(userIndex, inputDeviceType, gamepadModel, gamepadBrand)
	{
		this.LastUserIndex = this.UserIndex;
		this.LastInputDeviceType = this.InputDeviceType;
		this.LastGamepadModel = this.GamepadModel;
		this.LastGamepadBrand = this.GamepadBrand;

		this.UserIndex = userIndex;
		this.InputDeviceType = inputDeviceType;
		this.GamepadModel = gamepadModel;
		this.GamepadBrand = gamepadBrand;

		document.dispatchEvent(new CustomEvent('Event_InputDeviceChanged', { detail: this }));
	}

	OnNavigationTypeChanged(inIsUsingCursorNavigation)
	{
		this.bIsUsingCursorNavigation = inIsUsingCursorNavigation;

		if (this.bIsUsingCursorNavigation)
		{
			this.ResetInputs();
		}
	}
	
	OnCursorMove(e)
	{
		this.ResetCursorInput(e);
	}

	ResetCursorInput(e)
	{
		if (!this.bIsUsingCursorNavigation && ((e.clientX != this.LastMouseX) || (e.clientY != this.LastMouseY)))
		{
			this.LastMouseX = e.clientX;
			this.LastMouseY = e.clientY;
			this.bIsUsingCursorNavigation = true;

			if (e.clientX != 0 && e.clientY != 0)
			{
				this.ResetInputs();
			}
		}
	}

	ResetInputs()
	{
		if (this.CurrElement)
		{
			if (this.CurrWidget)
			{
				this.LastFocusedInfoMap.delete(this.CurrWidget.id);
			}

			this.ClearFocusedElement({
				wantSimulateMouse: true
			});
			

			if (!this.IsDirectionalInputCaptureActive())
			{
				this.CurrElement = undefined;
				this.CurrElementIdx = -1;
				this.CurrContainer = undefined;
				this.CurrSelected = undefined;
			}
		}
	}

	IsUsingGamepad()
	{
		return this.InputDeviceType == InputDeviceType.GAMEPAD;
	}

	IsUsingMouseKeyboard()
	{
		return this.InputDeviceType == InputDeviceType.MOUSE_KEYBOARD;
	}

	IsUsingCursor()
	{
		return this.bIsUsingCursorNavigation;
	}

	ShouldBlockCursorInput()
	{
		return !this.IsUsingCursor() && !this.SimulatingMouse;
	}

	GetGamepad()
	{
		if (!this.IsUsingGamepad())
		{
			return null;
		}

        return navigator.getGamepads().find((gamepad => Number(gamepad.id) == this.UserIndex));
    }

	// set the widget as the top level element, try finding a default, or just select deepest, first child with an input-id
	Event_Input_FocusWidget(widgetId, instId, priority, focusDefault = true)
	{
		let widgetWasLowerPriority = false;
		let widgetInfoToAdd = { WidgetId: widgetId, InstId: instId, Priority: priority };
		for (let i = 0; i < this.NavigationStack.length; i++)
		{
			let entry = this.NavigationStack[i];
			if (entry.Priority > priority)
			{
				this.NavigationStack.splice(i, 0, widgetInfoToAdd);
				widgetWasLowerPriority = true;
				break;
			}
		}

		if (!widgetWasLowerPriority)
		{
			this.NavigationStack.push(widgetInfoToAdd);

			this.FocusWidgetInternal(widgetId, instId, focusDefault);
		}
	}

	FocusWidgetInternal(widgetId, instId, focusDefault = true)
	{
		this.ClearFocusedElement({
			wantSimulateMouse: true
		});
		this.CurrWidget = document.getElementById(widgetId);
		this.CurrElement = undefined;
		this.CurrElementIdx = -1;
		this.CurrContainer = undefined;
		this.CurrSelected = undefined;
		this.InstId = instId;
		if (focusDefault)
		{
			this.FocusDefaultElement();
		}
	}

	ClearWidgetFocus(widgetId, instId)
	{
		for (let i = this.NavigationStack.length - 1; i >= 0; i--)
		{
			let entry = this.NavigationStack[i];
			if (entry.WidgetId == widgetId && entry.InstId == instId)
			{
				if (i == this.NavigationStack.length - 1)
				{
					if (this.NavigationStack.length >= 2)
					{
						let previousEntry = this.NavigationStack[i - 1];
						this.FocusWidgetInternal(previousEntry.WidgetId, previousEntry.InstId);
					}
					else
					{
						this.ClearFocusedElement({
							wantSimulateMouse: true
						});
						this.CurrWidget = undefined;
						this.CurrElement = undefined;
						this.CurrElementIdx = -1;
						this.CurrContainer = undefined;
						this.CurrSelected = undefined;
						this.InstId = -1;
					}
				}
				this.NavigationStack.splice(i, 1);
			}
		}
	}

	Event_Input_Select()
	{
		if (this.CurrElement && !this.CurrElement.isConnected)
		{
			this.CurrElement = null;
		}

		let selectTarget = this.CurrElement;

		if (!selectTarget)
		{
			let potentialTarget = this.GetCurrentLastFocusedElementInfo();
			if (potentialTarget && potentialTarget.node.dataset.hasCursorFocus == "true" && potentialTarget.node.dataset.inputDisabled != "true")
			{
				selectTarget = potentialTarget.node;
			}
		}
		
		if (selectTarget)
		{
			this.SelectElement(selectTarget, {
				wantSimulateMouse: true
			});
		}
		
	}

	Event_Input_Deselect()
	{
		this.ExplicitDeselectElement(this.CurrSelected);
	}

	// Remove focus visually no c++ notification
	ExplicitRemoveFocus()
	{
		if (!this.CurrWidget) return;


		this.CurrElement = null;
		this.CurrContainer = null;
		this.CurrElementIdx = -1;
	}

	// Remove selection visually no c++ notification
	ExplicitDeselectElement(node)
	{
		node.dataset.inputSelected = false;
		this.CurrSelected = null;
	}

	DeSelectElement(node)
	{
		node.dataset.inputSelected = false;

		this.CurrSelected = null;
	}

	SelectElement(node, options = {})
	{
		if (!this.CurrWidget || !node || this.SimulatingMouse) return;

		let newContainer = this.FindContainer(node);

		if (newContainer.dataset.inputDisabled == "true" || node.dataset.inputDisabled == "true")
		{
			return;
		}

		if (!this.AllowMultiSelect && this.CurrSelected)
		{
			this.DeSelectElement(this.CurrSelected);
		}

		if (!node) return;

		this.CurrSelected = node;

		node.dataset.inputSelected = true;

		let elemId = "";
		if (node.dataset.inputId != "")
		{
			elemId = node.dataset.inputId;
		} else if (this.CurrContainer)
		{
			elemId = this.CurrContainer.dataset.inputId;
		}
		if (node.dataset.inputExplicitIdx)
		{
			this.CurrElementIdx = Number(node.dataset.inputExplicitIdx);
		}
		if (node.dataset.inputExplicitId)
		{
			elemId = node.dataset.inputExplicitId;
		}

		engine.trigger("Event_" + this.CurrWidget.id + "_" + this.InstId + "_InputSelectionChanged", true, this.CurrWidget.id, elemId, this.CurrElementIdx);

		if (this.SimulateMouse && options.wantSimulateMouse)
		{
			this.SimulatingMouse = true;
			this.CurrSelected.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
			this.SimulatingMouse = false;
		}
	}

	// focuses an element in the current widget
	FocusWidgetElement(elementId,  options = {})
	{
		if (this.CurrWidget)
		{
			this.CacheLastFocus();
			let element = this.CurrWidget.querySelector('[data-input-id=\"' + elementId + "\"]");
			this.FocusContainerElement(element, options);
		}
	}

	CacheLastFocus()
	{
		if (!this.CurrContainer || !this.CurrElement || !this.CurrContainer.dataset)
		{
			return;
		}

		if (!this.CurrElement.isConnected)
		{
			return;
		}

		if (this.CurrContainer.dataset.inputDisableLastFocus == "true")
		{
			return;
		}

		let containerId = this.CurrContainer.dataset.inputId;
		if (!containerId)
		{
			return;
		}

		if (containerId)
		{
			this.SetLastFocusedElementInfo(containerId, this.CurrElement);
		}
	}

	SetLastFocusedElementInfo(containerInputId, currentFocusedElement)
	{
		const WidgetID = this?.CurrWidget?.id;
		if (!WidgetID) return; 

		let currentWidgetFocusInfo = this.LastFocusedInfoMap.get(WidgetID);
		if (!currentWidgetFocusInfo)
		{
			this.LastFocusedInfoMap.set(WidgetID, new Map());
			currentWidgetFocusInfo = this.LastFocusedInfoMap.get(WidgetID);
		}
		
		let elemInfo = {
			node: currentFocusedElement
		};

		currentWidgetFocusInfo.set(containerInputId, elemInfo);
	}

	ClearLastFocusedElementInfo(containerInputId)
	{
		if(!this.CurrWidget) return;
		
		let currentWidgetFocusInfo = this.LastFocusedInfoMap.get(this.CurrWidget.id);
		currentWidgetFocusInfo?.delete(containerInputId);
	}

	ClearLastFocusedInfoForWidget(targetWidget)
	{
		if (!targetWidget)
		{
			return;
		}
		
		this.LastFocusedInfoMap.delete(targetWidget.id);
	}

	ClearFocusedElement(options = {})
	{
		if (!this.CurrWidget || this.SimulatingMouse) return;

		if (this.CurrElement)
		{
			if (this.SimulateMouse && !this.SimulatingMouse && options.wantSimulateMouse)
			{
				this.SimulatingMouse = true;
				this.CurrElement.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, view: window }));
				this.SimulatingMouse = false;
			}

			this.CurrElement.dataset.inputFocused = false;
			this.CurrElement = null;
		}
		
		let lastFocusedElementInfo = this.GetCurrentLastFocusedElementInfo();
		if (lastFocusedElementInfo && lastFocusedElementInfo.node)
		{
			if (this.SimulateMouse && !this.SimulatingMouse && options.wantSimulateMouse)
			{
				this.SimulatingMouse = true;
				lastFocusedElementInfo.node.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, view: window }));
				this.SimulatingMouse = false;
			}
		}

		if (!this.IsDirectionalInputCaptureActive())
		{
			this.CurrContainer = null;
		}

		this.CurrElementIdx = -1;
	}

	FocusWithElemInfo(elemInfo, options = {})
	{
		if (!elemInfo)
		{
			return;
		}

		if (!elemInfo.node && this.FallbackElem)
		{
			elemInfo.node = this.FallbackElem;
		}

		if (elemInfo.node)
		{
			let idx = elemInfo.idx == -1 ? 0 : elemInfo.idx;

			this.FocusElementInternal(elemInfo.node, idx, options);
		}
	}

	FindContainer(node)
	{
		if(node == null) return;

		let currNode = node.parentNode;
		while (currNode)
		{
			if (currNode.dataset && currNode.dataset.inputBeh && (currNode.dataset.inputElem == "true" || currNode.dataset.inputDefault == "true") && currNode.dataset.inputDisabled != "true")
			{
				return currNode;
			}
			currNode = currNode.parentNode;
		}

		return node;
	}

	FocusElement(node, options = {})
	{
		if (!this.CurrWidget) return;
		let idx = this.GetIndexToParent(node);

		this.FocusElementInternal(node, idx, options);
	}

	FocusElementInternal(node, idx, options = {})
	{
		if (this.SimulatingMouse) return;

		this.ClearFocusedElement(options);

		let newContainer = this.FindContainer(node);

		if(newContainer == null) return;

		if (newContainer.dataset.inputDisabled == "true" || node.dataset.inputDisabled == "true") return false;

		this.CurrElement = node;
		this.CurrContainer = newContainer;

		if (idx !== undefined)
		{
			this.CurrElementIdx = idx;
		}

		this.CurrElement.dataset.inputFocused = true;

		if (this.CurrElement)
		{			
			if (this.CurrElement.dataset.inputExplicitIdx)
			{
				this.CurrElementIdx = Number(this.CurrElement.dataset.inputExplicitIdx);
			}

			if (this.SimulateMouse && !this.SimulatingMouse && options.wantSimulateMouse)
			{
				this.SimulatingMouse = true;
				this.CurrElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true, view: window }));
				this.SimulatingMouse = false;
			}

			// Use of newContainer here is because simualting mouseEnter will change this.CurrContainer
			if (newContainer)
			{
				this.SetLastFocusedElementInfo(newContainer.dataset.inputId, this.CurrElement);
				newContainer.dispatchEvent(new CustomEvent('Event_OnDirectionalNavigationItemFocus', {
					detail: {
						node: this.CurrElement,
						container: newContainer,
					}
				}));
			}
		}

		let behId = newContainer.dataset.inputBeh;
		if (behId)
		{
			let behavior = this.BehaviorMap.get(behId);
			if (behavior)
			{
				this.CurrBehavior = behavior;
			}
		}

		if (!this.CurrBehavior)
		{
			this.CurrBehavior = this.BehaviorMap.get("base");
		}

		return true;
	}

	FocusContainerElement(container, options = {})
	{
		if (!container)
		{
			return;
		}

		let elemInfo = this.FocusDefaultElementInternal(container);
		this.FocusWithElemInfo(elemInfo, options);
	}

	FocusDefaultElement()
	{
		if (this.bIsUsingCursorNavigation)
			return;

		//try the fallback
		if (this.CurrElement == null && this.CurrContainer && this.CurrContainer.children.length > 0)
		{
			let elemInfo = this.FocusDefaultElementInternal(this.CurrContainer);
			this.FocusWithElemInfo(elemInfo, {
				wantSimulateMouse: true
			});
		}

		// well the container failed, lets try within the whole widget
		if (!this.CurrElement && !this.IsDirectionalInputCaptureActive())
		{
			let elemInfo = this.FocusDefaultElementInternal(this.CurrWidget);
			this.FocusWithElemInfo(elemInfo, {
				wantSimulateMouse: true
			});
		}

		if (this.CurrElement)
		{
			return true;
		}
		return false;
	}

	GetIndexToParent(node)
	{
		let lastChild = node;
		let currNode = node.parentNode;
		while (currNode)
		{
			if (currNode.dataset && (currNode.dataset.inputElem == "true" || currNode.dataset.inputDefault == "true"))
			{
				break;
			}
			lastChild = currNode;
			currNode = currNode.parentNode;
		}

		let idx = 0;

		// eslint-disable-next-line no-cond-assign
		while (lastChild = lastChild.previousElementSibling) {
			idx++;
		}

		return idx;
	}

	GetFirstDefaultContainerId(widgetNode)
	{
		let defNodes = widgetNode.querySelectorAll('[data-input-default=\"true\"]');
		for (let i = 0; i < defNodes.length; i++)
		{
			let currentDefNode = defNodes[i];

			if (currentDefNode.dataset.inputBeh)
			{
				return currentDefNode.dataset.inputId;
			}
		}

		return "";
	}

	GetFirstDefaultSelectableChild(node)
	{
		let defNodes = node.querySelectorAll('[data-input-default=\"true\"]');
		for (let i = 0; i < defNodes.length; i++)
		{
			let currentDefNode = defNodes[i];

			if (currentDefNode.dataset.inputDisabled == "true")
				continue;

			if (currentDefNode.dataset.inputNavIsSelectableChild == "false")
				continue;

			return currentDefNode;
		}
	}

	GetFirstSelectableChild(node)
	{
		let defNodes = node.querySelectorAll('[data-input-elem=\"true\"]');
		for (let i = 0; i < defNodes.length; i++)
		{
			let currentDefNode = defNodes[i];

			if (currentDefNode.dataset.inputDisabled == "true")
				continue;

			if (currentDefNode.dataset.inputNavIsSelectableChild == "false")
				continue;

			return currentDefNode;
		}

		return node;
	}

	FocusDefaultElementInternal(node, idx)
	{
		let elemInfo = {
			idx: -1,
			node: undefined
		};
		this.FallbackElem = null;

		if (!node)
		{
			return elemInfo;
		}

		if (node.dataset && node.dataset.inputDisabled == "true")
		{
			return elemInfo;
		}

		let currentLastFocusedKey = node.dataset.inputId;
		if (node.dataset.defaultContainerId)
		{
			currentLastFocusedKey = node.dataset.defaultContainerId;
		}

		// Check if the node has an entry in LastFocusedInfoMap.
		let lastFocusedElementInfo = this.GetLastFocusedElementInfoForContainerId(currentLastFocusedKey);
		if (lastFocusedElementInfo && lastFocusedElementInfo.node && lastFocusedElementInfo.node.dataset.inputDisabled != "true" && lastFocusedElementInfo.node.parentNode)
		{
			elemInfo.node = lastFocusedElementInfo.node;
			elemInfo.idx = this.GetIndexToParent(lastFocusedElementInfo.node);
			return elemInfo;
		}

		// try finding a default node
		let defNode = this.GetFirstDefaultSelectableChild(node);


		let defChild = undefined;
		// found a default, but it may be the container, try finding a child
		if (defNode)
		{
			defChild = this.GetFirstSelectableChild(defNode);
		}

		// if we found a child input node, and its the same as the default node, then its just a single element
		// return it as itself
		if (defChild)
		{
			elemInfo.node = defChild;
			elemInfo.idx = this.GetIndexToParent(defChild);
			return elemInfo;
		}
		else if (defNode)
		{
			elemInfo.node = defNode;
			elemInfo.idx = -1;
			return elemInfo;
		}

		let children = node.querySelectorAll('[data-input-elem=\"true\"]');
		if (children && children.length > 0)
		{
			for (let i = 0; i < children.length; i++)
			{
				let child = children[i];
				if (child.dataset.inputDisabled == "true" || (child.parentNode && child.parentNode.dataset.inputDisabled == "true"))
				{
					continue;
				}

				elemInfo.node = child;
				elemInfo.idx = this.GetIndexToParent(child);
				break;
			}
		} else
		{
			// Single case
			if (node && node.dataset && node.dataset.inputElem == "true" && node.dataset.inputDisabled != "true")
			{
				elemInfo.node = node;
				elemInfo.idx = 0;
				return elemInfo;
			}
		}

		return elemInfo;
	}

	SetCurrentContainer(container)
	{
		if (this.IsDirectionalInputCaptureActive())
		{
			return;
		}

		this.CurrContainer = container;
	}

	Event_Input_Navigate(action)
	{
		if (this.CurrElement == null || !this.CurrElement.parentNode || !this.CurrElement.isConnected)
		{
			let attemptNavigation = false;
			let lastFocusedElementInfo = this.GetCurrentLastFocusedElementInfo();
			if (lastFocusedElementInfo && lastFocusedElementInfo.node)
			{
				attemptNavigation = lastFocusedElementInfo.node.dataset.hasCursorFocus == "true"
			}

			this.CurrElement = null;
			this.FocusDefaultElement();

			if (!attemptNavigation)
			{
				return;
			}
		}
		// cant do much without a behavior, and we should have already tried a fallback
		if (!this.CurrBehavior)
		{
			return;
		}

		document.dispatchEvent(new CustomEvent("On_Input_Interaction"));
		this.CurrBehavior.Navigate(action, this.CurrElement, this.CurrElementIdx);
	}

	GetCurrentLastFocusedElementInfo()
	{
		let toReturn = undefined;

		if (this.CurrContainer)
		{
			let lastFocusedElementInfo = this.GetLastFocusedElementInfoForContainerId(this.CurrContainer.dataset.inputId);
			if (lastFocusedElementInfo && lastFocusedElementInfo.node)
			{
				toReturn = lastFocusedElementInfo;
			}
		}

		return toReturn;
	}

	GetLastFocusedElementInfoForContainerId(containerId)
	{
		if (!this.CurrWidget)
		{
			return undefined;
		}

		let currentWidgetFocusInfo = this.LastFocusedInfoMap.get(this.CurrWidget.id);
		if (currentWidgetFocusInfo)
		{
			let lastFocusedElementInfo = currentWidgetFocusInfo.get(containerId);
			if (lastFocusedElementInfo)
			{
				if (lastFocusedElementInfo.node && lastFocusedElementInfo.node.isConnected)
				{
					return lastFocusedElementInfo;
				}
				else
				{
					currentWidgetFocusInfo.delete(containerId);
				}
			}
		}

		return undefined;
	}

	OnDirectionalNavigationItemFocus(event)
    {
        if (!event)
        {
            return;
        }
        
        InputMgr.DirectionalNavigationItemFocusHelper(event.detail.node, event.detail.container);
    }

	DirectionalNavigationItemFocusHelper(element, scrollingContainer, isHorizontalScroll = false)
	{
		if (!element || !scrollingContainer)
		{
			return;
		}

		const containerBounds = scrollingContainer.getBoundingClientRect();
		const elementBounds = element.getBoundingClientRect();
		
		const padding = isHorizontalScroll ? elementBounds.width * 0.5 : elementBounds.height * 0.5;
		
		let doScroll = false;
		let targetScrollPosition = 0;
		
		if (isHorizontalScroll) {
			if (elementBounds.x + elementBounds.width + padding > containerBounds.x + containerBounds.width) {
				doScroll = true;
				targetScrollPosition = scrollingContainer.scrollLeft + (elementBounds.x + elementBounds.width + padding) - (containerBounds.x + containerBounds.width);
			} else if (elementBounds.x - padding < containerBounds.x) {
				doScroll = true;
				targetScrollPosition = Math.max(scrollingContainer.scrollLeft - (containerBounds.left - elementBounds.left) - padding, 0);
			}
		} else {
			if (elementBounds.y + elementBounds.height + padding > containerBounds.y + containerBounds.height) {
				doScroll = true;
				targetScrollPosition = scrollingContainer.scrollTop + (elementBounds.y + elementBounds.height + padding) - (containerBounds.y + containerBounds.height);
			} else if (elementBounds.y - padding < containerBounds.y) {
				doScroll = true;
				targetScrollPosition = Math.max(scrollingContainer.scrollTop - (containerBounds.top - elementBounds.top) - padding, 0);
			}
		}
		
		if (doScroll) {
			if (isHorizontalScroll) {
				scrollingContainer.scrollLeft = targetScrollPosition;
			} else {
				scrollingContainer.scrollTop = targetScrollPosition;
			}
			scrollingContainer.dispatchEvent(new CustomEvent('oakscrollupdate', {
				bubbles: true,
				cancelable: false,
			}));
		}
	}

	SetDirectionalInputCaptureActiveForWidget(TargetWidget, bActive)
	{
		if (TargetWidget)
		{
			TargetWidget.dataset.bIsDirectionalInputCaptureActive = bActive;
		}
	}

	IsDirectionalInputCaptureActive()
	{
		if (this.CurrWidget)
		{
			return this.CurrWidget.dataset.bIsDirectionalInputCaptureActive == 'true';
		}

		return false;
	}

	DropdownNavigationUpdateHelper(event, menuNavContainer)
	{
		if (!event || !event.detail)
		{
			return;
		}

		if (event.detail.dropdownInputContainer)
        {
            if (event.detail.navigationEnabled)
            {
                requestAnimationFrame(() =>
                {
                    this.SetCurrentContainer(event.detail.dropdownInputContainer);
					this.SetDirectionalInputCaptureActiveForWidget(this.CurrWidget, true);
                    if (!this.IsUsingCursor())
                    {
						this.CurrElement = null;
                        this.FocusDefaultElement();
                    }
                });
            }
            else
            {
                requestAnimationFrame(() =>
                {
                    this.SetDirectionalInputCaptureActiveForWidget(this.CurrWidget, false);
                    this.ClearFocusedElement({
                        wantSimulateMouse: true
                    });
					this.SetLastFocusedElementInfo(event.detail.dropdownInputContainer.dataset.inputId, null);
                    this.SetCurrentContainer(menuNavContainer);
                    this.FocusDefaultElement();
                });
            }
        }
	}
}

class InputDisabledHandler 
{
	init(element, value)
    {
        this.update(element, value);
    }

	update(element, value)
	{
		if (element)
		{
			element.setAttribute("data-input-disabled", value);
		}
	}
}

engine.registerBindingAttribute("input-disabled", InputDisabledHandler);

class InputSelectDisabledHandler 
{
	init(element, value)
    {
        this.update(element, value);
    }

	update(element, value)
	{
		if (element)
		{
			element.setAttribute("data-input-select-disabled", value);
		}
	}
}

engine.registerBindingAttribute("input-select-disabled", InputSelectDisabledHandler);