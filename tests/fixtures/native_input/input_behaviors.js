"use strict";

class InputBehaviorBase
{
    constructor()
    {
        this.FocusElementInternal = false;
    }

    Navigate(action, node, idx)
    {
        this.TryFollowLink(action, node, idx);
    }

    GetLinkId(node, linkAttr)
    {
        if (!node)
        {
            return;
        }

        let link = node.getAttribute(linkAttr);

        let parentContainer = InputMgr.FindContainer(node)
        if (!parentContainer)
        {
            return;
        }
        if (!link && parentContainer)
        {
            link = parentContainer.getAttribute(linkAttr);
        }

        return link;
    }

    FindNextLinkId(node, linkAttr, startingLinkId)
    {
        let linkId = this.GetLinkId(node, linkAttr);

        if (!linkId || linkId == startingLinkId)
            return;

        let parentContainer = InputMgr.FindContainer(node);
        let nodeToFocus = parentContainer.parentWidget.querySelector('[data-input-id=\"' + linkId + "\"]");
        
        if (nodeToFocus && nodeToFocus.dataset.inputDisabled == "true")
        {
            linkId = this.FindNextLinkId(nodeToFocus, linkAttr, startingLinkId);
        }

        return linkId;
    }

    TryFollowLink(action, node, idx)
    {
        if (!node)
        {
            return;
        }

        let linkAttr = undefined;
        switch (action)
        {
            case INPUT_NAV_UP:
                linkAttr = INPUT_LINK_UP;
                break;
            case INPUT_NAV_RIGHT:
                linkAttr = INPUT_LINK_RIGHT;
                break;
            case INPUT_NAV_LEFT:
                linkAttr = INPUT_LINK_LEFT;
                break;
            case INPUT_NAV_DOWN:
                linkAttr = INPUT_LINK_DOWN;
                break;
        }

        const overrideAttr = this.GetOverrideAttribute(linkAttr);

        if (!this.TryOverride(node, overrideAttr))
        {
            let startingLinkId = node.getAttribute(INPUT_ID);
            let linkId = this.FindNextLinkId(node, linkAttr, startingLinkId);
            if (linkId)
            {
                if(this.FocusElementInternal)
                {
                    let parentContainer = InputMgr.FindContainer(node);
                    let nodeToFocus = parentContainer.parentWidget.querySelector('[data-input-id=\"' + linkId + "\"]");
                    InputMgr.FocusElementInternal(nodeToFocus, linkId, {
                        wantSimulateMouse: true
                    });
                }
                else
                {
                    InputMgr.FocusWidgetElement(linkId, {
                        wantSimulateMouse: true
                    });
                }
            }
        }
    }

    TryOverride(node, attr)
    {
        if (!node)
        {
            return false;
        }

        if (!attr)
        {
            return false;
        }

        let overrideValue = node.getAttribute(attr);

        if (overrideValue != null)
        {
            let parentContainer = InputMgr.FindContainer(node);
            if (parentContainer && parentContainer.parentWidget)
            {
                return parentContainer.parentWidget.TryInputOverride(overrideValue);
            }
        }

        return false;
    }

    GetOverrideAttribute(linkAttri)
    {
        switch (linkAttri)
        {
            case INPUT_LINK_UP:
                return INPUT_BEHAVIOR_OVERRIDE_UP;

            case INPUT_LINK_DOWN:
                return INPUT_BEHAVIOR_OVERRIDE_DOWN;

            case INPUT_LINK_LEFT:
                return INPUT_BEHAVIOR_OVERRIDE_LEFT;

            case INPUT_LINK_RIGHT:
                return INPUT_BEHAVIOR_OVERRIDE_RIGHT;
        }
    }
}
InputMgr.BehaviorMap.set("base", new InputBehaviorBase());

class InputBehavior_Grid extends InputBehaviorBase
{
    constructor()
    {
        super();

        this.Width = 1;
    }

    Navigate(action, node, idx)
    {
        this.FindContainerWidth(node, idx);
        this.TryMove(action, node, idx)
    }

    FindContainerWidth(node, idx)
    {
        let parentContainer = InputMgr.FindContainer(node);
        if (!parentContainer)
        {
            return;
        }
        let currTop = undefined;
        this.Width = 0;

        for (let i = 0; i < parentContainer.children.length; i++)
        {
            let child = parentContainer.children[i];
            if (currTop === undefined)
            {
                currTop = child.offsetTop;
            }

            if (child.offsetTop > currTop)
            {
                return;
            }

            this.Width++;
        }
    }

    TryMove(action, node, idx)
    {
        const actualWidth = this.Width;

        //Need to shift this by 1 since the column calculations are done with 1 as the lowest value while idx is starts at 0
        const column = (idx % actualWidth) + 1;

        let step = 0;

        switch (action)
        {
            case INPUT_NAV_UP:
                step = -1 * this.Width;
                break;
            case INPUT_NAV_RIGHT:
                if (column < actualWidth)
                {
                    step = 1;
                } else
                {
                    step = 0;
                }
                break;
            case INPUT_NAV_LEFT:
                if (column > 1)
                {
                    step = -1;
                } else
                {
                    step = 0;
                }
                break;
            case INPUT_NAV_DOWN:
                step = this.Width;
                break;
        }

        let nextInfo = this.GetNextNode(node, idx, step);

        if (nextInfo && nextInfo.node)
        {
            InputMgr.FocusElementInternal(nextInfo.node, nextInfo.idx, {
                wantSimulateMouse: true
            });
        }
        else if (nextInfo && nextInfo.shouldTryLink)
        {
            this.TryFollowLink(action, node, idx);
        }
    }

    GetNextNode(node, idx, step)
    {
        let nextInfo = {
            idx: -1,
            node: undefined,
            shouldTryLink: true
        };

        if (step == 0)
        {
            return nextInfo;
        }

        nextInfo.idx = idx;

        let parentContainer = InputMgr.FindContainer(node)
        if (!parentContainer)
        {
            return nextInfo;
        }

        let nextIdx = idx;
        while (nextIdx >= 0 && nextIdx < parentContainer.children.length)
        {
            nextIdx = nextIdx + step;

            let nextNode = parentContainer.children[nextIdx];
            if (!nextNode)
            {
                continue;
            }

            let inputChild = null;
            if (nextNode.dataset.inputElem)
            {
                inputChild = nextNode;
            }
            else
            {
                inputChild = nextNode.querySelector('[data-input-elem=\"true\"]');
            }

            if (!inputChild)
            {
                continue;
            }

            if (inputChild.dataset.inputDisabled == "true")
            {
                continue;
            }

            nextInfo.node = inputChild;
            nextInfo.idx = nextIdx;
            return nextInfo;
        }

        return nextInfo;
    }
}
InputMgr.BehaviorMap.set("grid", new InputBehavior_Grid());

class InputBehavior_List extends InputBehavior_Grid
{
    GetNavDirection(node)
    {
        let parentContainer = InputMgr.FindContainer(node);

        if (parentContainer.dataset && parentContainer.dataset.inputDir)
        {
            return parentContainer.dataset.inputDir;
        }

        return INPUT_DIR_VERT;
    }

    FindContainerWidth(node, idx)
    {
        const direction = this.GetNavDirection(node);
        if (direction == INPUT_DIR_VERT)
        {
            this.Width = 1;
        }
        else
        {
            super.FindContainerWidth(node);
        }
    }
}
InputMgr.BehaviorMap.set("list", new InputBehavior_List());

class InputBehavior_MultipleList extends InputBehavior_List
{
    Navigate(action, node, idx)
    {
        //Because we have multiple list, the root idx when selecting the default item is 0.
        //It refers to the first list within the container of list, not the node. That's why we need to retreive the good idx within the lists.
        if (idx == 0)
        {
            idx = this.FindNodeIndex(node);
        }

        this.FindContainerWidth(node, idx);
        this.TryMove(action, node, idx)
    }

    GetNextNode(node, idx, step)
    {
        let nextInfo = {
            idx: -1,
            node: undefined,
            shouldTryLink: true
        };

        let parentContainer = InputMgr.FindContainer(node)
        if (!parentContainer || step == 0)
        {
            return nextInfo;
        }

        nextInfo.idx = idx;
        let nextIdx = idx + step;
        let childIndexToCheck = step > 0 ? 0 : this.GetLastChildIndex(parentContainer);

        let nextParentIndex = step > 0 ? 0 : parentContainer.children.length - 1;
        while (nextParentIndex >= 0 && nextParentIndex < parentContainer.children.length)
        {
            let parentChild = parentContainer.children[nextParentIndex];
            if (parentChild)
            {
                let nextChildIndex = step > 0 ? 0 : parentChild.children.length - 1;
                while (nextChildIndex >= 0 && nextChildIndex < parentChild.children.length)
                {
                    if (nextIdx == childIndexToCheck)
                    {
                        let inputChild = this.FindInputChild(parentChild.children[nextChildIndex]);
                        if (inputChild)
                        {
                            nextInfo.node = inputChild;
                            nextInfo.idx = nextIdx;
                            return nextInfo;
                        }

                        nextIdx = nextIdx + step;
                    }

                    childIndexToCheck += step;
                    nextChildIndex += step;
                }
            }

            nextParentIndex += step;
        }

        return nextInfo;
    }

    FindInputChild(nextNode)
    {
        if (!nextNode)
            return null;

        let inputChild = null;
        if (nextNode.dataset.inputElem)
        {
            inputChild = nextNode;
        }
        else
        {
            inputChild = nextNode.querySelector('[data-input-elem=\"true\"]');
        }

        if (!inputChild)
            return null;

        if (inputChild.dataset.inputDisabled == "true")
            return null;

        return inputChild;
    }

    GetLastChildIndex(parentContainer)
    {
        let childCount = 0;

        for (let i = 0; i < parentContainer.children.length; i++)
        {
            let parentChild = parentContainer.children[i];
            if (parentChild)
            {
                childCount += parentChild.children.length;
            }
        }

        return Math.max(childCount - 1, 0);
    }

    FindNodeIndex(node)
    {
        let parentContainer = InputMgr.FindContainer(node)
        if (!parentContainer)
        {
            return 0;
        }

        let index = 0;
        for (let i = 0; i < parentContainer.children.length; i++)
        {
            let parentChild = parentContainer.children[i];
            if (parentChild)
            {
                for (let j = 0; j < parentChild.children.length; j++)
                {
                    if (parentChild.children[j] == node)
                    {
                        return index;
                    }
                    index++;
                }
            }
        }
        return 0;
    }
}
InputMgr.BehaviorMap.set("multiple_list", new InputBehavior_MultipleList());

// This is meant to only be used for an input container inside a gbx-grid-scrolling-list.
class InputBehavior_VirtualList extends InputBehavior_Grid
{
    GetNextNode(node, idx, step)
    {
        let nextInfo = {
            idx: -1,
            node: undefined,
            shouldTryLink: true
        };

        if (step == 0)
        {
            return nextInfo;
        }

        nextInfo.idx = idx;

        let parentContainer = InputMgr.FindContainer(node)
        if (!parentContainer)
        {
            return nextInfo;
        }

        let virtualList = parentContainer.parentNode;
        if (!virtualList || !virtualList.DirectionalNavigation_VirtualListHelper)
        {
            return;
        }

        let nextIdx = idx;
        while (nextIdx >= 0 && nextIdx < parentContainer.children.length)
        {
            nextIdx = nextIdx + step;
            
            let nextNode = parentContainer.children[nextIdx];
            if (!nextNode)
            {
                if (virtualList.DirectionalNavigation_VirtualListHelper(nextIdx))
                {
                    break;
                }

                continue;
            }

            let inputChild = null;
            if (nextNode.dataset.inputElem)
            {
                inputChild = nextNode;
            }
            else
            {
                inputChild = nextNode.querySelector('[data-input-elem=\"true\"]');
            }

            if (!inputChild)
            {
                continue;
            }

            if (inputChild.dataset.inputDisabled == "true")
            {
                continue;
            }

            if (virtualList.DirectionalNavigation_VirtualStartIndexHandling(inputChild))
            {
                break;
            }

            nextInfo.node = inputChild;
            nextInfo.idx = nextIdx;
            return nextInfo;
        }

        return nextInfo;
    }
}
InputMgr.BehaviorMap.set("virtual_list", new InputBehavior_VirtualList());

class InputBehavior_SkillTree extends InputBehaviorBase
{
    constructor()
    {
        super();
        this.FocusElementInternal = true;
    }
}
InputMgr.BehaviorMap.set("skilltree", new InputBehavior_SkillTree());