class Widget_MenuBase extends WidgetBase
{
    Init()
    {
        super.Init();

        this.registerToInputManager = false;
        this.inputActive = false;
    }

    connectedCallback()
	{
		super.connectedCallback();
	}

    Event_Deactivate()
    {
        super.Event_Deactivate();

        this.inputActive = false;
        this.Event_UnregisterInput();
    }

    RegisterEvents()
    {
        super.RegisterEvents();

        this.RegisterWidgetEvent("ManualActivate", function () { this.Event_ManualActivate(); }.bind(this));
        this.RegisterWidgetEvent("ManualDeactivate", function () { this.Event_ManualDeactivate(); }.bind(this));
    }

    Event_ManualActivate()
    {
        // Add anything you want a menu to do on an activation caused by user input here.
    }

    Event_ManualDeactivate()
    {
        InputMgr.ClearLastFocusedInfoForWidget(this);
    }

    UpdateInputRegistration()
    {
        if (!this.DataModel)
        {
            return;
        }

        if (!this.registerToInputManager)
        {
            return;   
        }

        if (this.inputActive != this.DataModel.inputactive)
        {
            this.inputActive = this.DataModel.inputactive;

            if (this.inputActive)
            {
                if (!this.dataset.defaultContainerId)
                {
                    this.dataset.defaultContainerId = InputMgr.GetFirstDefaultContainerId(this);
                }

                this.Event_RegisterInput();
            }
            else
            {
                this.Event_UnregisterInput();
            }
        }
    }
}