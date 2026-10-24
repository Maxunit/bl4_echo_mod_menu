/* eslint-disable gearbox/no-document-queryselector */
"use strict";

class WidgetManager
{
    constructor()
    {
        // Temporary promises polyfill until coherent switches to V8 on all consoles (should be in the next version)
        if (!Promise.allSettled)
        {
            const rejectHandler = reason => ({ status: 'rejected', reason });

            const resolveHandler = value => ({ status: 'fulfilled', value });

            Promise.allSettled = function (promises)
            {
                const convertedPromises = promises.map(p => Promise.resolve(p).then(resolveHandler, rejectHandler));
                return Promise.all(convertedPromises);
            };
        }

        this.WidgetMap = new Map();
        this.ArchetypeDivMap = new Map();
        this.LoadClassMap = new Map();
        this.FailedAttachments = [];
        this.HighestLayerIndex = 0;
        this.HighestLayerBehavior = "Show";
        this.WidgetLoader = new WidgetLoader();
    }

    Init()
    {
        console.info("[WidgetManager] Init ");

        let scriptDiv = document.createElement("div");
        scriptDiv.id = "loadedScripts";
        document.head.appendChild(scriptDiv);

        let cssDiv = document.createElement("div");
        cssDiv.id = "loadedCSS";
        document.head.appendChild(cssDiv);

        this.WidgetLoader.Init(scriptDiv, cssDiv);

        RegisterGlobalEvent("RequestLoadWidgets", (widgetRequests, batchId, components) =>
        {
            if(window.bakedComponentIds)
            {
                components = components.filter(c => window.bakedComponentIds.includes(c.Ident));
            }

            // Should use a finally here but it's not supported but consoles yet and the polyfill doesn't seem to work in coherent
            if (components.length > 0)
            {
                CompStore.Event_LoadComponents(components).then((result) => 
                {
                    this.Event_RequestLoadWidgets(widgetRequests, batchId);
                }).catch((error) => 
                {
                    console.log(error)
                    this.Event_RequestLoadWidgets(widgetRequests, batchId);
                });
            }
            else
            {
                this.Event_RequestLoadWidgets(widgetRequests, batchId);
            }
        });

        RegisterGlobalEvent("HighestLayerUpdated", (layerIndex, layerBehavior) => { this.UpdateHighestLayer(layerIndex, layerBehavior); });
        engine.trigger("Event_WidgetManagerReady");
    }

    Event_RequestLoadWidgets(widgetRequests, batchId)
    {
        let widgetPromises = [];
        let additionalLoads = [];
        console.info("[WidgetManager] RequestLoadWidgets Num:" + widgetRequests.length + " BatchId:" + batchId);
        this.ActiveBatchId = batchId;

        const onFinish = () =>
        {
            console.info("[WidgetManager] BatchLoadComplete")

            engine.trigger("Event_BatchLoadComplete", batchId);
            window.dispatchEvent(new CustomEvent("BatchLoadComplete"));
        };

        if (widgetRequests.length == 0)
        {
            onFinish();
            return;
        }

        for (let i = 0; i < widgetRequests.length; i++)
        {
            let classIdent = widgetRequests[i].ClassIdent;
            let widgetIdent = widgetRequests[i].WidgetIdent;
            let path = widgetRequests[i].ContentPath;
            let instId = widgetRequests[i].InstId;

            //console.info("[WidgetManager] request class:" + classIdent + " widget:" + widgetIdent + " path:" + path);
            if (!classIdent)
            {
                console.warn("[WidgetManager] bad classIdent in RequestLoadWidgets");
                continue;
            }

            if (!widgetIdent)
            {
                console.warn("[WidgetManager] bad widgetIdent in RequestLoadWidgets");
                continue;
            }

            if (!path)
            {
                console.warn("[WidgetManager] bad path in RequestLoadWidgets");
                continue;
            }

            if (this.WidgetMap.get(widgetIdent) != undefined)
            {
                //console.warn("[WidgetManager] Requested Widget already exists " + widgetIdent);
                continue;
            }

            if (this.LoadClassMap.has(classIdent) || this.ArchetypeDivMap.has(classIdent))
            {
                //console.warn("[WidgetManager] Requested Class already loaded class: " + classIdent);
                additionalLoads.push(widgetRequests[i])
                continue;
            }

            let classDiv = document.createElement('div');
            classDiv.id = 'widg-' + classIdent;

            this.LoadClassMap.set(classIdent, classDiv);
            widgetPromises.push(this.WidgetLoader.LoadWidget(path, classIdent, classDiv, widgetIdent, instId));
        }

        Promise.allSettled(widgetPromises).then(results => 
        {
            results.forEach((result, num) =>
            {
                if (result.status == "fulfilled")
                {
                    let out = this.LoadClassMap.get(result.value.ClassIdent);
                    if (out !== undefined)
                    {
                        this.ArchetypeDivMap.set(result.value.ClassIdent, out.children[0]);
                    }
                    else
                    {
                        console.error("[WidgetManager] Cannot find LoadClassMap item " + result.value.ClassIdent);
                    }

                    this.AttachInstance(result.value);
                    this.LoadClassMap.delete(result.value.ClassIdent);
                }
                else if (result.status == "rejected")
                {
                    console.error("[WidgetManager] Failed Load " + result.reason.ClassIdent);
                    engine.trigger("Event_WidgetClassLoadFailed", result.reason.ClassIdent);
                    this.LoadClassMap.delete(result.reason.ClassIdent);
                }
            });
         
            additionalLoads.forEach((request, num) =>
            {
                this.AttachInstance(request);
            });

            this.RetryFailedAttachments();
            onFinish();
        });
    }

    AttachInstance(req){

        var archetypeDiv = this.ArchetypeDivMap.get(req.ClassIdent);
        if (!archetypeDiv)
        {
            console.error("[WidgetManager] ERROR in AttachInstance: Could not find archetypeDiv for " + req.ClassIdent + " in ArchetypeDivMap. If this is a plugin file, it is likely that DirectoriesToAlwaysStageAsUFS has not been set up for the plugin's uiresources folder.");
		    return;
        }
        
        var instId = req.InstId;
        var ClassIdent = req.ClassIdent;
        var WidgetIdent = req.WidgetIdent;

        var DataModelId = "data_" + WidgetIdent + "_" + instId;
        var DataModel = window[DataModelId];
        var WidgetInstId = WidgetIdent + "_" + instId;


        var WidgetDiv = archetypeDiv.cloneNode(true);

        if (archetypeDiv.constructor !== WidgetDiv.constructor)
        {
            console.warn("[WidgetManager] WARNING - WidgetDiv cloned from archetypeDiv of " + WidgetIdent + " is not the same type. This is usually a sign that the cloneNode call failed to have the cloned node use the associated custom element. We will attempt to set this widget up again with RetryFailedAttachments()");
            this.FailedAttachments.push(req);
            return;
        }

        WidgetDiv.classList.add("widget");
        FixupDataBindValues(WidgetDiv, DataModelId, WidgetIdent);
        let layerNode;
        if (DataModel) 
        {
            layerNode = document.getElementById(DataModel.layername);
        }

        if (!layerNode)
        {
            let layerDiv = document.createElement("DIV");
            let layerIndex = DataModel ? DataModel.layerindex : 0;
            layerDiv.id = DataModel ? DataModel.layername : "";

            const layerClassList = DataModel ? ["layer", DataModel.layertype] : ["layer"];
            layerDiv.classList.add(...layerClassList);

            layerDiv.dataset.layerIndex = layerIndex;
            let added = false;
            for (let i = 0; i < document.body.children.length; i++)
            {
                let childLayerIndex = document.body.children[i].dataset.layerIndex;
                if (layerIndex < childLayerIndex)
                {
                    document.body.insertBefore(layerDiv, document.body.children[i]);
                    added = true;
                    break;
                }
            }
            if (!added)
            {
                document.body.appendChild(layerDiv);
            }
            layerNode = layerDiv;
            WidgetMgr.RefreshHighestLayer();
        }

        WidgetDiv.dataset.WidgetIdent = WidgetIdent;
        WidgetDiv.dataset.ClassIdent = ClassIdent;
        WidgetDiv.dataset.DataModelId = DataModelId;
        WidgetDiv.dataset.WidgetInstId = WidgetInstId;
        WidgetDiv.dataset.InstId = instId;
        layerNode.appendChild(WidgetDiv);
    }

    RetryFailedAttachments()
    {
        if (this.FailedAttachments.length > 0)
        {
            console.warn("[WidgetManager] Starting RetryFailedAttachments due to this.FailedAttachments having entries");

            let requests = this.FailedAttachments;
            this.FailedAttachments = [];
            requests.forEach((request, num) =>
            {
                console.warn("[WidgetManager] RetryFailedAttachments - Retrying AttachInstance for: " + request.ClassIdent);
                this.AttachInstance(request);
            });
        
            if (this.FailedAttachments.length > 0)
            {
                console.warn("[WidgetManager] RetryFailedAttachments - Not all attachment retries succeeded, will attempt to call RetryFailedAttachments again.");
                setTimeout(() => this.RetryFailedAttachments(), 1);
            }
        }
    }

    UpdateHighestLayer(layerIndex, layerBehavior)
    {
        if(this.HighestLayerIndex == layerIndex && this.HighestLayerBehavior == layerBehavior)
        {
            return;
        }

        this.HighestLayerIndex = layerIndex;
        this.HighestLayerBehavior = layerBehavior;
        this.RefreshHighestLayer();
    }

    RefreshHighestLayer()
    {
        for (let i = 0; i < document.body.children.length; i++)
        {
            let childLayer = document.body.children[i];
            if (childLayer.dataset.layerIndex < this.HighestLayerIndex && this.HighestLayerBehavior == "Hide")
            {
                childLayer.classList.toggle("inactive", true);
            }
            else
            {
                childLayer.classList.toggle("inactive", false);
            }
        }
    }

    GetWidget(ident)
    {
        return this.WidgetMap.get(ident);
    }

    SetWidget(ident, widget){
        this.WidgetMap.set(ident, widget);
    }
}
