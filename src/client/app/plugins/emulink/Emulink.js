/**
 *
 * @author Paolo Masci
 * @date 25/05/14 6:39:02 PM
 */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50*/
/*global define, Promise, d3*/
define(function (require, exports, module) {
    "use strict";
    var ProjectManager		= require("project/ProjectManager"),
        WSManager           = require("websockets/pvs/WSManager"),
        PluginManager       = require("plugins/PluginManager"),
        ModelEditor         = require("plugins/modelEditor/ModelEditor"),
        PVSioWebClient      = require("PVSioWebClient"),
        EmuchartsEditorModes= require("plugins/emulink/EmuchartsEditorModes"),
        displayAddState        = require("plugins/emulink/forms/displayAddState"),
        displayRenameState     = require("plugins/emulink/forms/displayRenameState"),
        displayChangeStateColor= require("plugins/emulink/forms/displayChangeStateColor"),
        displayAddTransition   = require("plugins/emulink/forms/displayAddTransition"),
        displayRename          = require("plugins/emulink/forms/displayRename"),
        displayDelete          = require("plugins/emulink/forms/displayDelete"),
//        displayAddExpression   = require("plugins/emulink/forms/displayAddExpression"),
        displayEditVariable     = require("plugins/emulink/forms/displayEditVariable"),
        displayEditConstant     = require("plugins/emulink/forms/displayEditConstant"),
        displayEditDatatype     = require("plugins/emulink/forms/displayEditDatatype"),
        displaySelectState      = require("plugins/emulink/forms/displaySelectState"),
        displaySelectTransition = require("plugins/emulink/forms/displaySelectTransition"),
        QuestionForm            = require("pvsioweb/forms/displayQuestion"),
        SaveAsView              = require("project/forms/SaveAsView"),

        EmuchartsSelector       = require("plugins/emulink/tools/EmuchartsSelector").getInstance(),
        EmuchartsCodeGenerators = require("plugins/emulink/models/EmuchartsCodeGenerators"),
        ConsistencyTemplateView = require("plugins/emulink/tools/propertytemplates/ConsistencyTemplateView"),
        FeedbackTemplateView    = require("plugins/emulink/tools/propertytemplates/FeedbackTemplateView"),
        ReversibilityTemplateView = require("plugins/emulink/tools/propertytemplates/ReversibilityTemplateView"),
//        EmuchartsTextEditor    = require("plugins/emulink/EmuchartsTextEditor"),

        contextMenus           = require("plugins/emulink/menus/ContextMenus").getInstance(),

        EmuchartsParser        = require("plugins/emulink/EmuchartsParser"),
        pvs_theory             = require("text!./tools/propertytemplates/pvs_theory.handlebars"),
        pvs_transition_system  = require("text!./tools/propertytemplates/pvs_transition_system.handlebars"),
        pvs_guard              = require("text!./tools/propertytemplates/pvs_guard.handlebars"),

        FileHandler            = require("filesystem/FileHandler"),
        fs                     = require("filesystem/FileSystem").getInstance(),
        PimTestGenerator       = require("plugins/emulink/models/pim/PIMTestGenerator"),
        PMTextGenerator        = require("plugins/emulink/models/pim/PMTextGenerator"),
        PIMImporter            = require("plugins/emulink/models/pim/PIMImporter"),
        PIMEmulink             = require("plugins/emulink/models/pim/PIMEmulink"),
        ContextTable           = require("plugins/emulink/tools/ContextTable"),
        MachineStatesTable     = require("plugins/emulink/tools/MachineStatesTable"),
        TransitionsTable       = require("plugins/emulink/tools/TransitionsTable"),
        ConstantsTable         = require("plugins/emulink/tools/ConstantsTable"),
        DatatypesTable         = require("plugins/emulink/tools/DatatypesTable"),
        EmuchartsManager       = require("plugins/emulink/EmuchartsManager"),
        ExportDiagram          = require("plugins/emulink/tools/ExportDiagram");

    var instance;
    var projectManager;
    var editor;
    var ws;
    var pvsioWebClient;
    var canvas;

    var emuchartsManager;
    var MODE;
    var emuchartsCodeGenerators;

    var pimImporter;
    var pimTestGenerator;
    var pimEmulink;
    var contextTable;
    var machineStatesTable;
    var transitionsTable;
    var constantsTable;
    var datatypesTable;
    var exportDiagram;

    var options = { autoinit: true };

    function initToolbars() {
        // make sure the svg is visible
        d3.select("#EmuchartLogo").classed("hidden", true);
        d3.select("#graphicalEditor").classed("hidden", false);
        // reset toolbar color
        if (document.getElementById("btn_toolbarBrowse")) {
            document.getElementById("btn_toolbarBrowse").style.background = "black";
        }
        if (document.getElementById("btn_toolbarAddState")) {
            document.getElementById("btn_toolbarAddState").style.background = "black";
        }
        if (document.getElementById("btn_toolbarAddTransition")){
            document.getElementById("btn_toolbarAddTransition").style.background = "black";
        }
        if (document.getElementById("btn_toolbarRename")) {
            document.getElementById("btn_toolbarRename").style.background = "black";
        }
        if (document.getElementById("btn_toolbarDelete")) {
            document.getElementById("btn_toolbarDelete").style.background = "black";
        }
    }

    function modeChange_callback(event) {
/*        var EmuchartsEditorMode = document.getElementById("EmuchartsEditorMode");
        if (EmuchartsEditorMode) {
            if (event.mode === MODE.BROWSE()) {
                EmuchartsEditorMode.style.background = "green";
            } else {
                EmuchartsEditorMode.style.background = "steelblue";
            }
            EmuchartsEditorMode.textContent = "Editor mode: " + MODE.mode2string(event.mode);
        }
        var infoBox = document.getElementById("infoBox");
        if (infoBox) {
            infoBox.value = MODE.modeTooltip(event.mode);
        }*/
    }

    function addState_handler(evt) {
        var stateID = emuchartsManager.getFreshStateName();
        var position = { x: evt.mouse[0], y: evt.mouse[1] };
        emuchartsManager.add_state(stateID, position);
        if (options.autoinit && emuchartsManager.getStates().length === 1) {
            var newTransitionName = emuchartsManager.getFreshInitialTransitionName();
            emuchartsManager.add_initial_transition(newTransitionName, stateID);
        }
    }

    function deleteTransition_handler(event) {
        var transitionID = event.edge.id;
        emuchartsManager.delete_transition(transitionID);
    }

    function deleteInitialTransition_handler(event) {
        var transitionID = event.edge.id;
        emuchartsManager.delete_initial_transition(transitionID);
    }

    function deleteState_handler(event) {
        var stateID = event.node.id;
        emuchartsManager.delete_state(stateID);
    }

    var maxLen = 48;

    // rename dialog window for states
    function renameState(theState) {
        if (emuchartsManager.getIsPIM()) {
            return pimEmulink.editState(theState);
        }
        displayRenameState.create({
            header: "Renaming state " + theState.name.substring(0, maxLen) + "...",
            textLabel: {
                newStateName: "State name",
                newStateColor: "State color",
                newStateEnter: "State entry actions",
                newStateExit:  "State exit actions"
            },
            placeholder: {
                newStateName: theState.name,
                newStateColor: theState.color,
                newStateEnter: theState.enter,
                newStateExit: theState.exit
            },
            buttons: ["Cancel", "Ok"]
        }).on("ok", function (e, view) {
            var newStateName = e.data.labels.get("newStateName");
            var newStateColor = e.data.labels.get("newStateColor");
            var newStateEnter = e.data.labels.get("newStateEnter");
            var newStateExit = e.data.labels.get("newStateExit");
            if (newStateName && newStateName.value !== "") {
                emuchartsManager.edit_state(
                    theState.id,
                    { name: newStateName,
                      color: newStateColor,
                      enter: newStateEnter,
                      exit: newStateExit }
                );
                view.remove();
                machineStatesTable.setMachineStates(emuchartsManager.getStates());
            }
        }).on("cancel", function (e, view) {
            // just remove window
            view.remove();
        });
    }
    // change state color dialog
    function changeStateColor(theState) {
        if (emuchartsManager.getIsPIM()) {
            return pimEmulink.editState(theState);
        }
        displayChangeStateColor.create({
            header: "Renaming state " + theState.name.substring(0, maxLen) + "...",
            textLabel: {
                newStateName: "State name",
                newStateColor: "State color",
                newStateEnter: "State entry actions",
                newStateExit:  "State exit actions"
            },
            placeholder: {
                newStateName: theState.name,
                newStateColor: theState.color,
                newStateEnter: theState.enter,
                newStateExit: theState.exit
            },
            buttons: ["Cancel", "Ok"]
        }).on("ok", function (e, view) {
            var newStateName = e.data.labels.get("newStateName");
            var newStateColor = e.data.labels.get("newStateColor");
            var newStateEnter = e.data.labels.get("newStateEnter");
            var newStateExit = e.data.labels.get("newStateExit");
            if (newStateColor && newStateColor.value !== "") {
                emuchartsManager.edit_state(
                    theState.id,
                    { name: newStateName,
                      color: newStateColor,
                      enter: newStateEnter,
                      exit: newStateExit }
                );
                view.remove();
                machineStatesTable.setMachineStates(emuchartsManager.getStates());
            }
        }).on("cancel", function (e, view) {
            // just remove window
            view.remove();
        });
    }

    function renameState_handler(event) {
        var theState = emuchartsManager.getState(event.node.id);
        renameState(theState);
    }
    function changeStateColor_handler(event) {
        var theState = emuchartsManager.getState(event.node.id);
        changeStateColor(theState);
    }

    // rename dialog window for transitions
    function editTransition(t) {
        if (emuchartsManager.getIsPIM()) {
            pimEmulink.editTransition(t);
            return;
        }
        displayRename.create({
            header: "Renaming transition " + t.name.substring(0, maxLen) + "...",
            required: false,
            currentLabel: t.name, // this dialog will show just one transition
            buttons: ["Cancel", "Rename"]
        }).on("rename", function (e, view) {
            var transitionLabel = e.data.labels.get("newLabel");
            if (!transitionLabel) { transitionLabel = ""; }
            emuchartsManager.rename_transition(t.id, transitionLabel);
            view.remove();
            transitionsTable.setTransitions(emuchartsManager.getTransitions());
        }).on("cancel", function (e, view) {
            // just remove rename window
            emuchartsManager.refresh_transition(t.id, { color: "black" });
            view.remove();
        });
    }

    function renameTransition_handler(event) {
        editTransition(event.edge);
    }

    function highlightTransition_handler(event) {
        transitionsTable.selectTransition(event.edge.id);
    }
    function selectTransition_handler(event) {
        transitionsTable.scrollTop(event.edge.id);
        transitionsTable.selectTransition(event.edge.id);
    }
    function deselectTransition_handler(event) {
        transitionsTable.deselectTransition(event.edge.id);
    }

    // rename dialog window for initial transitions
    function editInitialTransition(t) {
        displayRename.create({
            header: "Renaming initial transition " + t.name.substring(0, maxLen) + "...",
            required: false,
            currentLabel: t.name,
            buttons: ["Cancel", "Rename"]
        }).on("rename", function (e, view) {
            var transitionLabel = e.data.labels.get("newLabel");
            if (!transitionLabel) { transitionLabel = ""; }
            emuchartsManager.rename_initial_transition(t.id, transitionLabel);
            view.remove();
        }).on("cancel", function (e, view) {
            // just remove rename window
            view.remove();
        });
    }
    function renameInitialTransition_handler(event) {
        editInitialTransition(event.edge);
    }

    function addTransition_handler(event) {
        var newTransitionName = emuchartsManager.getFreshTransitionName();
        emuchartsManager.add_transition(newTransitionName,
                                        event.source.id,
                                        event.target.id);
    }

    function addInitialTransition_handler(event) {
        var newTransitionName = emuchartsManager.getFreshInitialTransitionName();
        emuchartsManager.add_initial_transition(newTransitionName, event.target.id);
    }

    function stateAdded_handler(event) {
        machineStatesTable.setMachineStates(emuchartsManager.getStates());
    }
    function stateRemoved_handler(event) {
        machineStatesTable.setMachineStates(emuchartsManager.getStates());
    }
    function stateRenamed_handler(event) { }//print_theory(); print_node(); }
    function stateColorChanged_handler(event) { }//print_theory(); print_node(); }
    function transitionAdded_handler(event) {
        transitionsTable.setTransitions(emuchartsManager.getTransitions());
    }
    function transitionRemoved_handler(event) {
        transitionsTable.setTransitions(emuchartsManager.getTransitions());
    }
    function transitionRenamed_handler(event) { }//print_theory(); print_node(); }
    function initialTransitionAdded_handler(event) { }//console.log("initial transition added"); }//print_theory(); print_node(); }
    function initialTransitionRemoved_handler(event) { }//console.log("initial transition removed"); }//print_theory(); print_node(); }
    function initialTransitionRenamed_handler(event) { }//console.log("initial transition renamed"); }//print_theory(); print_node(); }
    function constantAdded_handler(event) {
        constantsTable.setConstants(emuchartsManager.getConstants());
    }
    function constantRemoved_handler(event) {
        constantsTable.setConstants(emuchartsManager.getConstants());
    }
    function datatypeAdded_handler(event) {
        datatypesTable.setDatatypes(emuchartsManager.getDatatypes());
    }
    function datatypeRemoved_handler(event) {
        datatypesTable.setDatatypes(emuchartsManager.getDatatypes());
    }
    function variableAdded_handler(event) {
        contextTable.setContextVariables(emuchartsManager.getVariables());
    }
    function variableRemoved_handler(event) {
        contextTable.setContextVariables(emuchartsManager.getVariables());
    }

    function updateContextTables() {
        contextTable.setContextVariables(emuchartsManager.getVariables());
        machineStatesTable.setMachineStates(emuchartsManager.getStates());
        transitionsTable.setTransitions(emuchartsManager.getTransitions());
        constantsTable.setConstants(emuchartsManager.getConstants());
        datatypesTable.setDatatypes(emuchartsManager.getDatatypes());
    }

    /**
     * Constructor
     * @memberof Emulink
     */
    function Emulink() {
        pvsioWebClient = PVSioWebClient.getInstance();
        emuchartsCodeGenerators = EmuchartsCodeGenerators.getInstance();
        MODE = new EmuchartsEditorModes();
        emuchartsManager = EmuchartsManager.getInstance();
        emuchartsManager.addListener("emuCharts_editorModeChanged", modeChange_callback);
        emuchartsManager.addListener("emuCharts_addState", addState_handler);
//        emuchartsManager.addListener("emuCharts_d3ZoomTranslate", d3ZoomTranslate_handler);
        emuchartsManager.addListener("emuCharts_deleteTransition", deleteTransition_handler);
        emuchartsManager.addListener("emuCharts_deleteInitialTransition", deleteInitialTransition_handler);
        emuchartsManager.addListener("emuCharts_deleteState", deleteState_handler);
        emuchartsManager.addListener("emuCharts_renameState", renameState_handler);
        emuchartsManager.addListener("emuCharts_changeStateColor", changeStateColor_handler);
        emuchartsManager.addListener("emuCharts_renameTransition", renameTransition_handler);
        emuchartsManager.addListener("emuCharts_highlightTransition", highlightTransition_handler);
        emuchartsManager.addListener("emuCharts_selectTransition", selectTransition_handler);
        emuchartsManager.addListener("emuCharts_deselectTransition", deselectTransition_handler);
        emuchartsManager.addListener("emuCharts_renameInitialTransition", renameInitialTransition_handler);
        emuchartsManager.addListener("emuCharts_addTransition", addTransition_handler);
        emuchartsManager.addListener("emuCharts_addInitialTransition", addInitialTransition_handler);

        emuchartsManager.addListener("emuCharts_stateAdded", stateAdded_handler);
        emuchartsManager.addListener("emuCharts_stateRemoved", stateRemoved_handler);
        emuchartsManager.addListener("emuCharts_constantAdded", constantAdded_handler);
        emuchartsManager.addListener("emuCharts_constantRemoved", constantRemoved_handler);
        emuchartsManager.addListener("emuCharts_datatypeAdded", datatypeAdded_handler);
        emuchartsManager.addListener("emuCharts_datatypeRemoved", datatypeRemoved_handler);
        emuchartsManager.addListener("emuCharts_variableAdded", variableAdded_handler);
        emuchartsManager.addListener("emuCharts_variableRemoved", variableRemoved_handler);
        emuchartsManager.addListener("emuCharts_transitionAdded", transitionAdded_handler);
        emuchartsManager.addListener("emuCharts_transitionRenamed", transitionRenamed_handler);
        emuchartsManager.addListener("emuCharts_transitionRemoved", transitionRemoved_handler);
        emuchartsManager.addListener("emuCharts_initialTransitionAdded", initialTransitionAdded_handler);
        emuchartsManager.addListener("emuCharts_initialTransitionRenamed", initialTransitionRenamed_handler);
        emuchartsManager.addListener("emuCharts_initialTransitionRemoved", initialTransitionRemoved_handler);
        emuchartsManager.addListener("emuCharts_stateRenamed", stateRenamed_handler);
        emuchartsManager.addListener("emuCharts_stateColorChanged", stateColorChanged_handler);
        emuchartsManager.addListener("emuCharts_newEmuchartsLoaded", function (event) {
            updateContextTables();
        });

        EmuchartsSelector.addListener("EmuchartsSelector_select", function (event) {
            if (event && event.emuchart) {
                emuchartsManager.loadEmucharts(event.emuchart.id);
                EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
                // update tables
                updateContextTables();
            }
        });

        // PIM objects.
        pimImporter = new PIMImporter();
        pimEmulink = new PIMEmulink(emuchartsManager);
        pimTestGenerator = new PimTestGenerator("pim_Test_Gen");

        exportDiagram = new ExportDiagram();
        return this;
    }

    Emulink.prototype.getName = function () {
        return "EmuCharts Editor";
    };

    Emulink.prototype.getId = function () {
        return this.getName().replace(/\s/g, "");
    };

    function editVariable (theVariable) {
        var variableScopes = emuchartsManager.getVariableScopes();
        var scopeOptions = [];
        variableScopes.forEach(function (option) {
            if (option === theVariable.scope) {
                scopeOptions.push({ value: option, selected: true});
            } else {
                scopeOptions.push({ value: option, selected: false});
            }
        });
        displayEditVariable.create({
            header: "Editing variable " + theVariable.name,
            textLabel: {
                newVariableName: "Variable name",
                newVariableType: "Variable type",
                newVariableValue: "Initial value",
                newVariableScope: "Variable scope"
            },
            placeholder: {
                newVariableName: theVariable.name,
                newVariableType: theVariable.type,
                newVariableValue: theVariable.value,
                newVariableScope: theVariable.scope
            },
            scopeOptions: scopeOptions,
            buttons: ["Cancel", "Ok"]
        }).on("ok", function (e, view) {
            var newVariableName = e.data.labels.get("newVariableName");
            var newVariableType = e.data.labels.get("newVariableType");
            var newVariableValue = e.data.labels.get("newVariableValue");
            var newVariableScope = variableScopes[e.data.options.get("newVariableScope")];
            if (newVariableName && newVariableName.value !== "" &&
                    newVariableType && newVariableType.value !== "" &&
                    newVariableValue && newVariableValue.value !== "") {
                emuchartsManager.rename_variable(
                    theVariable.id,
                    {   name: newVariableName,
                        type: newVariableType,
                        value: newVariableValue,
                        scope: newVariableScope   }
                );
                view.remove();
                contextTable.setContextVariables(emuchartsManager.getVariables());
            }
        }).on("cancel", function (e, view) {
            // just remove window
            view.remove();
        });
    }
    function editConstant (theConstant) {
        displayEditConstant.create({
            header: "Editing constant " + theConstant.name,
            textLabel: {
                newConstantName: "Constant name",
                newConstantType: "Constant type",
                newConstantValue: "Constant value"
            },
            placeholder: {
                newConstantName: theConstant.name,
                newConstantType: theConstant.type,
                newConstantValue: theConstant.value
            },
            buttons: ["Cancel", "Ok"]
        }).on("ok", function (e, view) {
            var newConstantName = e.data.labels.get("newConstantName");
            var newConstantType = e.data.labels.get("newConstantType");
            var newConstantValue = e.data.labels.get("newConstantValue");
            if (newConstantName && newConstantName.value !== ""
                    && newConstantType && newConstantType.value !== "") {
                emuchartsManager.rename_constant(
                    theConstant.id,
                    {   name: newConstantName,
                        type: newConstantType,
                        value: newConstantValue   }
                );
                view.remove();
                constantsTable.setConstants(emuchartsManager.getConstants());
            }
        }).on("cancel", function (e, view) {
            // just remove window
            view.remove();
        });
    }

    function editDatatype (theDatatype) {
        displayEditDatatype.create({
            header: "Editing datatype " + theDatatype.name,
            textLabel: {
                newDatatypeName: "Datatype name",
                newDatatypeConstructor1: "Datatype constants",
                newDatatypeValue: "Initial value"
            },
            placeholder: {
                newDatatypeName: theDatatype.name,
                newDatatypeConstructor1: theDatatype.constructors.join(", "),
                newDatatypeValue: theDatatype.value
            },
            buttons: ["Cancel", "Ok"]
        }).on("ok", function (e, view) {
            var newDatatypeName = e.data.labels.get("newDatatypeName");
            var newDatatypeConstructor1 = e.data.labels.get("newDatatypeConstructor1");
            var newDatatypeValue = e.data.labels.get("newDatatypeValue");
            if (newDatatypeName && newDatatypeName.value !== ""
                    && newDatatypeConstructor1 && newDatatypeConstructor1.value !== "") {
                emuchartsManager.rename_datatype(
                    theDatatype.id,
                    {   name: newDatatypeName,
                        constructors: newDatatypeConstructor1.split(",").map(function (c) { return c.trim(); }),
                        value: newDatatypeValue   }
                );
                view.remove();
                datatypesTable.setDatatypes(emuchartsManager.getDatatypes());
            }
        }).on("cancel", function (e, view) {
            // just remove window
            view.remove();
        });
    }

    Emulink.prototype.browseMode = function () {
        return this.changeMode(MODE.BROWSE());
    };

    Emulink.prototype.changeMode = function (mode) {
        initToolbars();
        emuchartsManager.set_editor_mode(mode);
        switch (mode) {
            case MODE.BROWSE(): {
                if (d3.select("#btn_toolbarBrowse").node()) {
                    d3.select("#btn_toolbarBrowse").node().style.background = "green";
                }
                break;
            }
            case MODE.DELETE(): {
                if (d3.select("#btn_toolbarDelete").node()) {
                    d3.select("#btn_toolbarDelete").node().style.background = "steelblue";
                }
                break;
            }
            case MODE.RENAME(): {
                if (d3.select("#btn_toolbarRename").node()) {
                    d3.select("#btn_toolbarRename").node().style.background = "steelblue";
                }
                break;
            }
            case MODE.ADD_TRANSITION(): {
                if (d3.select("#btn_toolbarAddTransition").node()) {
                    d3.select("#btn_toolbarAddTransition").node().style.background = "steelblue";
                }
                break;
            }
            case MODE.ADD_STATE(): {
                if (d3.select("#btn_toolbarAddState").node()) {
                    d3.select("#btn_toolbarAddState").node().style.background = "steelblue";
                }
                break;
            }
        }
        return this;
    };

    Emulink.prototype.createHtmlElements = function () {
        var _this = this;
        var content = require("text!plugins/emulink/forms/maincontent.handlebars");
        canvas = pvsioWebClient.createCollapsiblePanel({
            headerText: _this.getName(),
            showContent: true,
            owner: _this.getId()
        });
        canvas = canvas.html(content);
        if (document.getElementById("StateAttributes")) {
            contextTable = new ContextTable();
            contextTable.addListener("ContextTable_deleteVariable", function(evt) {
                emuchartsManager.delete_variable(evt.variable.id);
            });
            contextTable.addListener("ContextTable_editVariable", function(evt) {
                var theVariable = emuchartsManager.getVariable(evt.variable.id);
                editVariable(theVariable);
            });
        }
        if (document.getElementById("MachineStates")) {
            machineStatesTable = new MachineStatesTable();
            machineStatesTable.addListener("MachineStatesTable_deleteState", function(event) {
                emuchartsManager.delete_state(event.state.id);
            });
            machineStatesTable.addListener("MachineStatesTable_renameState", function(event) {
                var theState = emuchartsManager.getState(event.state.id);
                renameState(theState);
            });
            machineStatesTable.addListener("MachineStatesTable_changeStateColor", function(event) {
                var theState = emuchartsManager.getState(event.state.id);
                changeStateColor(theState);
            });
        }
        if (document.getElementById("TransitionsTable")) {
            transitionsTable = new TransitionsTable();
            transitionsTable.addListener("TransitionsTable_deleteTransition", function(event) {
                emuchartsManager.delete_transition(event.transition.id);
            });
            transitionsTable.addListener("TransitionsTable_renameTransition", function(event) {
                var theTransition = emuchartsManager.getTransition(event.transition.id);
                if (theTransition) {
                    editTransition(theTransition);
                }
            });
            transitionsTable.addListener("TransitionsTable_selectTransition", function(event) {
                var theTransition = emuchartsManager.getTransition(event.transition.id);
                if (theTransition) {
                    emuchartsManager.select_transition(theTransition.id);
                }
            });
            transitionsTable.addListener("TransitionsTable_deselectAllTransition", function(event) {
                emuchartsManager.deselect_all_transition();
            });
        }
        if (document.getElementById("ConstantsTable")) {
            constantsTable = new ConstantsTable();
            constantsTable.addListener("ConstantsTable_deleteConstant", function(event) {
                emuchartsManager.delete_constant(event.constant.id);
            });
            constantsTable.addListener("ConstantsTable_editConstant", function(event) {
                var theConstant = emuchartsManager.getConstant(event.constant.id);
                editConstant(theConstant);
            });
        }
        if (document.getElementById("DatatypesTable")) {
            datatypesTable = new DatatypesTable();
            datatypesTable.addListener("DatatypesTable_deleteDatatype", function(event) {
                emuchartsManager.delete_datatype(event.datatype.id);
            });
            datatypesTable.addListener("DatatypesTable_editDatatype", function(evt) {
                var theDatatype = emuchartsManager.getDatatype(evt.datatype.id);
                editDatatype(theDatatype);
            });
        }

        // function importChart(callback) {
        //     var opt = {
        //         header: "Import Chart...",
        //         extensions: ".muz,.pim,.xml"
        //     };
        //     // MUZ
        //     FileHandler.openLocalFileAsText(function (err, res) {
        //         if (res) {
        //             if (res.name.lastIndexOf(".muz") === res.name.length - 4) {
        //                 emuchartsManager.importPIMChart(res);
        //             }
        //             else {
        //                 pimImporter.importPIM(res, emuchartsManager);
        //             }
        //             if (callback && typeof callback === "function") {
        //                 callback(err, res);
        //             }
        //         }
        //     }, opt);
        // }

        function restartEditor() {
            // set initial editor mode
            _this.changeMode(MODE.BROWSE());
            // render emuchart
            emuchartsManager.render();
            // set Variables Table
            contextTable.setContextVariables(emuchartsManager.getVariables());
            // set Machine States Table
            machineStatesTable.setMachineStates(emuchartsManager.getStates());
            // set Transitions Table
            transitionsTable.setTransitions(emuchartsManager.getTransitions());
            // set Constants
            constantsTable.setConstants(emuchartsManager.getConstants());
            // set Datatypes
            datatypesTable.setDatatypes(emuchartsManager.getDatatypes());
        }

        d3.select("#btnLoadEmuchart").on("click", function () {
            emuchartsManager.openChart().then(function (res) {
                emuchartsManager.saveChart();
                EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
                restartEditor();
            }).catch(function (err) {
                console.log(err);
                EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
                restartEditor();
            });
        });

        // toolbar
        d3.select("#btn_toolbarAddState").on("click", function () {
            _this.changeMode(MODE.ADD_STATE());
        });
        d3.select("#btn_toolbarAddTransition").on("click", function () {
            _this.changeMode(MODE.ADD_TRANSITION());
        });
        d3.select("#btn_toolbarRename").on("click", function () {
            _this.changeMode(MODE.RENAME());
        });
        d3.select("#btn_toolbarDelete").on("click", function () {
            _this.changeMode(MODE.DELETE());
        });
        d3.select("#btn_toolbarBrowse").on("click", function () {
            _this.changeMode(MODE.BROWSE());
        });
        d3.select("#btn_toolbarZoomIn").on("click", function () {
            emuchartsManager.zoom_in();
        });
        d3.select("#btn_toolbarZoomOut").on("click", function () {
            emuchartsManager.zoom_out();
        });
        d3.select("#btn_toolbarZoomReset").on("click", function () {
            emuchartsManager.zoom_reset();
        });
        // bootstrap tooltip
        $('[data-toggle="tooltip"]').tooltip();


        //-- Emuchart menu -----------------------------------------------------------
        contextMenus.createHtmlElements();
        contextMenus.addListener("ContextMenus.editVariable", function (evt) {
            if (evt && evt.variable) {
                var theVariable = emuchartsManager.getVariable(evt.variable.id);
                editVariable(theVariable);
            }
        });
        contextMenus.addListener("ContextMenus.editConstant", function (evt) {
            if (evt && evt.constant) {
                var theConstant = emuchartsManager.getConstant(evt.constant.id);
                editConstant(theConstant);
            }
        });
        contextMenus.addListener("ContextMenus.setDatatypes", function (evt) {
            if (evt && evt.datatype) {
                var theDatatype = emuchartsManager.getDatatype(evt.datatype.id);
                editDatatype(theDatatype);
            }
        });

        d3.select("#btn_menuNewChart").on("click", function () {
            document.getElementById("menuEmuchart").children[1].style.display = "none";
            var name = emuchartsManager.uniqueEmuchartsID();
            SaveAsView.create({
                heading: "New Emucharts...",
                placeholder: "Please enter Emucharts name...",
                label: "Emucharts name",
                name: name
            }).on("cancel", function (e, formView) {
                formView.remove();
            }).on("ok", function (e, formView) {
                emuchartsManager.newChart(e.data.name);
                EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
                restartEditor();
                formView.remove();
            });

        });
        d3.select("#menuEmuchart").on("mouseover", function () {
            document.getElementById("menuEmuchart").children[1].style.display = "block";
        });
        d3.select("#btn_menuCloseChart").on("click", function () {
            document.getElementById("menuEmuchart").children[1].style.display = "none";
            if (!emuchartsManager.empty_chart()) {
                // we need to delete the current chart because we handle one chart at the moment
                QuestionForm.create({
                    header: "Warning: the current chart has unsaved changes.",
                    question: "The current chart has unsaved changes that will be lost. Confirm Close?",
                    buttons: ["Cancel", "Confirm close"]
                }).on("ok", function (e, view) {
                    emuchartsManager.delete_chart();
                    d3.select("#btn_toolbarBrowse").node().click();
                    view.remove();
                }).on("cancel", function (e, view) {
                    view.remove();
                });
            }
        });
        d3.select("#btn_menuOpenChart").on("click", function () {
            document.getElementById("menuEmuchart").children[1].style.display = "none";
            emuchartsManager.openChart().then(function (res) {
                emuchartsManager.saveChart();
                EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
                restartEditor();
            }).catch(function (err) {
                console.log(err);
                EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
                restartEditor();
            });
        });

        emuchartsManager.addListener("EmuchartsManager.saveChart", function (evt) {
            EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
            restartEditor();
        });

        d3.select("#btn_menuSaveChart").on("click", function () {
            document.getElementById("menuEmuchart").children[1].style.display = "none";
            emuchartsManager.saveChart();
        });
        d3.select("#btn_menuSaveAllCharts").on("click", function () {
            document.getElementById("menuEmuchart").children[1].style.display = "none";
            emuchartsManager.saveAllCharts();
        });
        d3.select("#btn_menuSaveChartAs").on("click", function () {
            document.getElementById("menuEmuchart").children[1].style.display = "none";
            var emuDesc = emuchartsManager.getEmuchartsDescriptors().filter(function (desc) {
                return desc.is_selected === true;
            });
            var name = (emuDesc.length === 1) ? emuDesc[0].emuchart_name : "emucharts_" + projectManager.project().name();
            SaveAsView.create({
                heading: "Save As...",
                placeholder: "Please enter Emucharts name...",
                label: "Emucharts name",
                name: name
            }).on("cancel", function (e, formView) {
                formView.remove();
            }).on("ok", function (e, formView) {
                emuchartsManager.saveChartAs(e.data.name);
                formView.remove();
            });
        });
        d3.select("#btn_menuExportAsImage").on("click", function () {
            exportDiagram.toVectorialImage(emuchartsManager);
        });
        d3.select("#btn_menuCloseCurrentChart").on("click", function () {
            emuchartsManager.closeChart();
            EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
            restartEditor();
        });
        d3.select("#btn_menuDeleteCurrentChart").on("click", function () {
            emuchartsManager.deleteChartDialog().then(function (res) {
                if (res) {
                    // the file has been deleted, we need to update the Emucharts Editor front-end
                    EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
                    restartEditor();
                }
            });
        });

        //-- States menu -----------------------------------------------------------
        d3.select("#menuStates").on("mouseover", function () {
            document.getElementById("menuStates").children[1].style.display = "block";
        });

        d3.select("#btn_menuNewState").on("click", function () {
            document.getElementById("menuStates").children[1].style.display = "none";
            var label = emuchartsManager.getFreshStateName();
            displayAddState.create({
                header: "Please enter a label for the new machine state",
                textLabel: label,
                buttons: ["Cancel", "Create"]
            }).on("create", function (e, view) {
                var nodeLabel = e.data.labels.get("newLabel");
                emuchartsManager.add_state(nodeLabel);
                view.remove();
            }).on("cancel", function (e, view) {
                // just remove window
                view.remove();
            });
        });
        d3.select("#btn_menuRenameState").on("click", function () {
            document.getElementById("menuStates").children[1].style.display = "none";
            var states = emuchartsManager.getStates();
            var labels = [];
            states.forEach(function (state) {
                labels.push(state.name + "  (id: " + state.id + ")");
            });
            displaySelectState.create({
                header: "Editing states...",
                message: "Please select a state",
                transitions: labels,
                buttons: ["Cancel", "Select"]
            }).on("select", function (e, view) {
                if (states.length > 0) {
                    var v = e.data.options.get("selectedState");
                    var theState = states[v];
                    view.remove();
                    renameState(theState);
                }
            }).on("cancel", function (e, view) {
                // just remove window
                view.remove();
                return;
            });
        });
        d3.select("#btn_menuDeleteState").on("click", function () {
            document.getElementById("menuStates").children[1].style.display = "none";
            var states = emuchartsManager.getStates();
            var labels = [];
            states.forEach(function (state) {
                labels.push(state.name + "  (id: " + state.id + ")");
            });
            displayDelete.create({
                header: "Please select state to be deleted...",
                textLabel: "State to be deleted",
                currentLabels: labels,
                buttons: ["Cancel", "Delete"]
            }).on("delete", function (e, view) {
                var s = e.data.options.get("currentLabel");
                var stateID = states[s].id;
                emuchartsManager.delete_state(stateID);
                view.remove();
            }).on("cancel", function (e, view) {
                // just remove rename window
                view.remove();
            });
        });
        d3.select("#btn_menuLayOutStates").on("click", function () {
            var editor = emuchartsManager.getSelectedEditor();
            if (editor) {
                var trans = editor.getTransformation();
                // editor.layOutChart_nath();
                editor.layOutChart();
                emuchartsManager.render({ trans: trans });
            }
        });

        //-- Transitions menu -----------------------------------------------------------
        d3.select("#menuTransitions").on("mouseover", function () {
            document.getElementById("menuTransitions").children[1].style.display = "block";
        });
        d3.select("#btn_menuNewTransition").on("click", function () {
            document.getElementById("menuTransitions").children[1].style.display = "none";
//            var newTransitionName = emuchartsManager.getFreshTransitionName();
            var states = emuchartsManager.getStates();
            var labels = [];
            states.forEach(function (state) {
                labels.push(state.name + "  (id: " + state.id + ")");
            });
            displayAddTransition.create({
                header: "Please enter label for new transition",
                textLabel: "New transition",
                sourceNodes: labels,
                targetNodes: labels,
                buttons: ["Cancel", "Create"]
            }).on("create", function (e, view) {
                var transitionLabel = e.data.labels.get("newLabel");
                if (transitionLabel && transitionLabel.value !== "") {
                    var sourceNode = e.data.options.get("sourceNode");
                    var sourceNodeID = states[sourceNode].id;
                    var targetNode = e.data.options.get("targetNode");
                    var targetNodeID = states[targetNode].id;
                    emuchartsManager.add_transition(transitionLabel, sourceNodeID, targetNodeID);
                    view.remove();
                }
            }).on("cancel", function (e, view) {
                // just remove window
                view.remove();
            });
        });
        d3.select("#btn_menuRenameTransition").on("click", function () {
            document.getElementById("menuTransitions").children[1].style.display = "none";
            var transitions = emuchartsManager.getTransitions();
            var nTransitions = transitions.length;
            var initialTransitions = emuchartsManager.getInitialTransitions();
            initialTransitions.forEach(function (it) {
                transitions.push(it);
            });
            var labels = [];
            transitions.forEach(function (transition) {
                if (transition.source) {
                    labels.push(transition.name + "  ("
                                + transition.source.name + "->"
                                + transition.target.name + ")");
                } else {
                    labels.push(transition.name + "  ("
                                + "INIT" + "->"
                                + transition.target.name + ")");
                }
            });
            displaySelectTransition.create({
                header: "Editing transitions...",
                message: "Please select a transition",
                transitions: labels,
                buttons: ["Cancel", "Select"]
            }).on("select", function (e, view) {
                if (transitions.length > 0) {
                    var v = e.data.options.get("selectedTransition");
                    var theTransition = transitions[v];
                    view.remove();
                    if (v < nTransitions) {
                        editTransition(theTransition);
                    } else {
                        editInitialTransition(theTransition);
                    }
                }
            }).on("cancel", function (e, view) {
                // just remove window
                view.remove();
                return;
            });
        });
        d3.select("#btn_menuDeleteTransition").on("click", function () {
            document.getElementById("menuTransitions").children[1].style.display = "none";
            var transitions = emuchartsManager.getTransitions();
            var initialTransitions = emuchartsManager.getInitialTransitions();
            initialTransitions.forEach(function (it) {
                transitions.push(it);
            });
            var labels = [];
            transitions.forEach(function (transition) {
                if (transition.source) {
                    labels.push(transition.name + "  ("
                                + transition.source.name + "->"
                                + transition.target.name + ")");
                } else {
                    labels.push(transition.name + "  ("
                                + "INIT" + "->"
                                + transition.target.name + ")");
                }
            });
            displayDelete.create({
                header: "Please select transition to be deleted...",
                textLabel: "Transition to be deleted",
                currentLabels: labels,
                buttons: ["Cancel", "Delete"]
            }).on("delete", function (e, view) {
                var t = e.data.options.get("currentLabel");
                var transitionID = transitions[t].id;
                emuchartsManager.delete_transition(transitionID);
                emuchartsManager.delete_initial_transition(transitionID);
                view.remove();
            }).on("cancel", function (e, view) {
                // just remove rename window
                view.remove();
            });
        });



        //-- Code generators menu -----------------------------------------------------------
        d3.select("#menuCodeGenenerators").on("mouseover", function () {
            document.getElementById("menuCodeGenenerators").children[1].style.display = "block";
        });

        function printer_template(printer_name, file_extension) {
            var emucharts = {
                name: ("emucharts_" + projectManager.project().name().replace(/-/g, "_")),
                author: {
                    name: "xxxx",
                    affiliation: "xxxx",
                    contact: "xxx"
                },
                importings: [],
                constants: emuchartsManager.getConstants(),
                datatypes: emuchartsManager.getDatatypes(),
                variables: emuchartsManager.getVariables(),
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: emuchartsManager.getInitialTransitions()
            };
            var model = printer_name.print(emucharts);
            if (model.err) {
                console.log(model.err);
                return;
            }
            if (model.res) {
                var name = emucharts.name + file_extension;
                var content = model.res;
                return projectManager.project().addFile(name, content, { overWrite: true });
            } else {
                console.log("Warning, " + file_extension.replace(".","") + " model is undefined.");
            }
        }

        d3.select("#btn_menuPVSPrinter").on("click", function () {
            printer_template(emuchartsCodeGenerators.emuchartsPVSPrinter, ".pvs");
        });
        d3.select("#btn_menuAlloyPrinter").on("click", function () {
            printer_template(emuchartsCodeGenerators.emuchartsAlloyPrinter, ".alloy");
        });
        d3.select("#btn_menuNuXMVPrinter").on("click", function () {
            printer_template(emuchartsCodeGenerators.emuchartsNuXMVPrinter, ".smv");
            // var emucharts = {
            //     name: ("emucharts_" + projectManager.project().name().replace(/-/g, "_") + "_SMV"),
            //     author: {
            //         name: "<author name>",
            //         affiliation: "<affiliation>",
            //         contact: "<contact>"
            //     },
            //     importings: [],
            //     constants: emuchartsManager.getConstants(),
            //     variables: emuchartsManager.getVariables(),
            //     states: emuchartsManager.getStates(),
            //     transitions: emuchartsManager.getTransitions(),
            //     initial_transitions: emuchartsManager.getInitialTransitions()
            // };
            // var model = emuchartsCodeGenerators.emuchartsNuXMVPrinter.print(emucharts);
            // if (model.err) {
            //     console.log(model.err);
            //     return;
            // }
            // if (model.res) {
            //     var name = emucharts.name + ".smv";
            //     var content = model.res;
            //     return projectManager.project().addFile(name, content, { overWrite: true });
            // } else {
            //     console.log("Warning, NuXMV model is undefined.");
            // }
        });
        d3.select("#btn_menuPIMPrinter").on("click", function () {
            var emucharts = {
                name: ("emucharts_" + projectManager.project().name() + "_PIM"),
                author: {
                    name: "<author name>",
                    affiliation: "<affiliation>",
                    contact: "<contact>"
                },
                importings: [],
                constants: emuchartsManager.getConstants(),
                variables: emuchartsManager.getVariables(),
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: emuchartsManager.getInitialTransitions()
            };
            var model = emuchartsCodeGenerators.emuchartsPIMPrinter.print(emucharts);
            console.log(model);
            if (model.err) {
                console.log(model.err);
                return;
            }
            if (model.res) {
                var name = emucharts.name + ".tex";
                var content = model.res;
                return projectManager.project().addFile(name, content, { overWrite: true });
            } else {
                console.log("Warning, PIM model is undefined.");
            }
        });
        d3.select("#btn_menuCppPrinter").on("click", function () {
            var emucharts = {
                name: ("emucharts_" + projectManager.project().name()),
                author: {
                    name: "<author name>",
                    affiliation: "<affiliation>",
                    contact: "<contact>"
                },
                importings: [],
                constants: emuchartsManager.getConstants(),
                variables: emuchartsManager.getVariables(),
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: emuchartsManager.getInitialTransitions()
            };
            var model = emuchartsCodeGenerators.emuchartsPIMPrinter.print(emucharts);
            console.log(model);
            if (model.err) {
                console.log(model.err);
                return;
            }
            if (model.res) {
                var name = emucharts.name + ".cpp";
                var content = model.res;
                return projectManager.project().addFile(name, content, { overWrite: true });
            } else {
                console.log("Warning, C++ code is undefined.");
            }
        });
        d3.select("#btn_menuMALPrinter").on("click", function () {
            var emucharts = {
                name: ("emucharts_" + projectManager.project().name() + "_MAL"),
                author: {
                    name: "<author name>",
                    affiliation: "<affiliation>",
                    contact: "<contact>"
                },
                importings: [],
                constants: emuchartsManager.getConstants(),
                variables: emuchartsManager.getVariables(),
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: emuchartsManager.getInitialTransitions()
            };
            var model = emuchartsCodeGenerators.emuchartsMALPrinter.print(emucharts);
            console.log(model);
            if (model.err) {
                console.log(model.err);
                return;
            }
            if (model.res) {
                var name = emucharts.name + ".i";
                var content = model.res;
                return projectManager.project().addFile(name, content, { overWrite: true });
            } else {
                console.log("Warning, MAL model is undefined.");
            }
        });
        d3.select("#btn_menuVDMPrinter").on("click", function () {
            var emucharts = {
                name: ("emucharts_" + projectManager.project().name() + "_VDM"),
                author: {
                    name: "<author name>",
                    affiliation: "<affiliation>",
                    contact: "<contact>"
                },
                importings: [],
                constants: emuchartsManager.getConstants(),
                variables: emuchartsManager.getVariables(),
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: emuchartsManager.getInitialTransitions()
            };
            var model = emuchartsCodeGenerators.emuchartsVDMPrinter.print(emucharts);
            console.log(model);
            if (model.err) {
                console.log(model.err);
                return;
            }
            if (model.res) {
                var name = emucharts.name + ".vdmsl";
                var content = model.res;
                return projectManager.project().addFile(name, content, { overWrite: true });
            } else {
                console.log("Warning, VDM model is undefined.");
            }
        });

        d3.select("#btn_menuJavaScriptPrinter").on("click", function () {
            var emucharts = {
                name: ("emucharts_" + projectManager.project().name() + "_JS"),
                author: {
                    name: "<author name>",
                    affiliation: "<affiliation>",
                    contact: "<contact>"
                },
                importings: [],
                constants: emuchartsManager.getConstants(),
                variables: emuchartsManager.getVariables(),
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: emuchartsManager.getInitialTransitions()
            };
            var model = emuchartsCodeGenerators.emuchartsJSPrinter.print(emucharts);
            console.log(model);
            if (model.err) {
                console.log(model.err);
                return;
            }
            if (model.res) {
                var name = emucharts.name + ".js";
                var content = model.res;
                return projectManager.project().addFile(name, content, { overWrite: true });
            } else {
                console.log("Warning, JavaScript code is undefined.");
            }
        });

        d3.select("#btn_menuAdaPrinter").on("click", function () {
            var emucharts = {
                name: ("emucharts_" + projectManager.project().name() + "_ADA"),
                author: {
                    name: "<author name>",
                    affiliation: "<affiliation>",
                    contact: "<contact>"
                },
                importings: [],
                constants: emuchartsManager.getConstants(),
                variables: emuchartsManager.getVariables(),
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: emuchartsManager.getInitialTransitions()
            };
            var model = emuchartsCodeGenerators.emuchartsAdaPrinter.print(emucharts);
            console.log(model);
            if (model.err) {
                console.log(model.err);
                return;
            }
            if (model.spec && model.body) {
                var overWrite = {overWrite: true};
                projectManager.project().addFile(emucharts.name + ".adb", model.body, overWrite);
                projectManager.project().addFile(emucharts.name + ".ads", model.spec, overWrite);
            } else {
                console.log("Warning, Ada code is undefined.");
            }
        });
        d3.select("#btn_menuBlessPrinter").on("click", function () {
            var emucharts = {
                name: ("emucharts_" + projectManager.project().name() + "_Bless"),
                author: {
                    name: "<author name>",
                    affiliation: "<affiliation>",
                    contact: "<contact>"
                },
                importings: [],
                constants: emuchartsManager.getConstants(),
                variables: {
                    input: emuchartsManager.getInputVariables(),
                    output: emuchartsManager.getOutputVariables(),
                    local: emuchartsManager.getLocalVariables()
                },
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: emuchartsManager.getInitialTransitions()
            };
            var model = emuchartsCodeGenerators.emuchartsBlessPrinter.print(emucharts);
            console.log(model);
            if (model.err) {
                console.log(model.err);
                return;
            }
            if (model.thread) {
                var overWrite = {overWrite: true};
                projectManager.project().addFile(emucharts.name + ".aadl", model.thread, overWrite);
            } else {
                console.log("Warning, Bless model is undefined.");
            }
        });
        d3.select("#btn_menuMisraCPrinter").on("click", function () {
            var emucharts = {
                name: ("emucharts_" + projectManager.project().name() + "_MisraC"),
                author: {
                    name: "<author name>",
                    affiliation: "<affiliation>",
                    contact: "<contact>"
                },
                importings: [],
                constants: emuchartsManager.getConstants(),
                variables: {
                    input: emuchartsManager.getInputVariables(),
                    output: emuchartsManager.getOutputVariables(),
                    local: emuchartsManager.getLocalVariables()
                },
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: emuchartsManager.getInitialTransitions()
            };
            emuchartsCodeGenerators.emuchartsMisraCPrinter.print(emucharts, { interactive: true }).then(function (model) {
                // console.log(model);
                if (model.err) {
                    console.log(model.err);
                    return;
                }
                if (model.thread && model.header) {
                    var overWrite = {overWrite: true};
                    projectManager.project().addFile("Makefile", model.makefile, overWrite);
                    projectManager.project().addFile("main.c", model.main, overWrite);
                    projectManager.project().addFile(emucharts.name + ".c", model.thread, overWrite);
                    projectManager.project().addFile(emucharts.name + ".h", model.header, overWrite);
                    projectManager.project().addFile("Android_" + emucharts.name + ".c", model.Android_thread, overWrite);
                    projectManager.project().addFile("Android_" + emucharts.name + ".h", model.Android_header, overWrite);
                    projectManager.project().addFile("Doxyfile", model.doxygen, overWrite);
                } else {
                    console.log("Warning, MisraC code is undefined.");
                }
            }).catch(function (err) {
                console.log(err);
            });
        });

        //-- Verification menu ---------------------------------------------------
        d3.select("#btn_menuConsistencyOfActions").on("click", function () {
            // document.getElementById("menuVerification").children[1].style.display = "none";
            var stateVariables = emuchartsManager.getVariables().map(function (variable) {
                return variable.name;
            }).concat([ "current_state", "previous_state" ]);
            var transitionLabels = emuchartsManager.getTransitions();
            var transitions = d3.map();
            var parser = new EmuchartsParser();
            transitionLabels.forEach(function (label) {
                var ans = parser.parseTransition(label.name);
                if (ans.res) {
                    transitions.set(ans.res.val.identifier.val);
                }
            });
            transitions = transitions.keys();
            ConsistencyTemplateView.create({
                header: "Consistency of user actions",
                stateVariables: stateVariables,
                transitions: transitions,
                buttons: ["Dismiss", "Create PVS Theory"]
            }).on("create pvs theory", function (e, view) {
                // do something useful here.... like create a pvs file with the instantiated property
                var emucharts_theory_name = "emucharts_" + projectManager.project().name().replace(/-/g, "_");
                var pvs_property = e.data.get("pvs_property");
                var pvs_theorem = e.data.get("pvs_theorem");
                var prooflite_strategy = e.data.get("prooflite_strategy");
                var modelEditor = ModelEditor.getInstance();
                (PluginManager.getInstance().isLoaded(modelEditor)
                    ? Promise.resolve()
                    : PluginManager.getInstance().enablePlugin(modelEditor))
                .then(function () {
                    var theTheory = Handlebars.compile(pvs_theory, { noEscape: true })({
                        theory_name: "consistency",
                        importing: emucharts_theory_name,
                        transition_system: Handlebars.compile(pvs_transition_system, { noEscape: true })({
                            functionName: "action",
                            transitions: transitions
                        }),
                        pvs_property: pvs_property,
                        pvs_guard: Handlebars.compile(pvs_guard, { noEscape: true })({
                            guard_name: "guard",
                            state: "State"
                        }),
                        pvs_theorem: pvs_theorem,
                        prooflite_strategy: prooflite_strategy
                    });
                    projectManager.project().addFile("consistency.pvs", theTheory, { overWrite: true });
                    projectManager.selectFile("consistency.pvs");
                });
            }).on("dismiss", function (e, view) {
                // just remove window
                view.remove();
            });
        });

        d3.select("#btn_menuReversibilityOfActions").on("click", function () {
            // document.getElementById("menuVerification").children[1].style.display = "none";
            var stateVariables = emuchartsManager.getVariables().map(function (variable) {
                return variable.name;
            }).concat([ "current_state", "previous_state" ]);
            var transitionLabels = emuchartsManager.getTransitions();
            var transitions = d3.map();
            var parser = new EmuchartsParser();
            transitionLabels.forEach(function (label) {
                var ans = parser.parseTransition(label.name);
                if (ans.res) {
                    transitions.set(ans.res.val.identifier.val);
                }
            });
            transitions = transitions.keys();
            ReversibilityTemplateView.create({
                header: "Reversibility of user actions",
                stateVariables: stateVariables,
                transitions: transitions,
                buttons: ["Dismiss", "Create PVS Theory"]
            }).on("create pvs theory", function (e, view) {
                // do something useful here.... like create a pvs file with the instantiated property
                var emucharts_theory_name = "emucharts_" + projectManager.project().name().replace(/-/g, "_");
                var pvs_property = e.data.get("pvs_property");
                var pvs_theorem = e.data.get("pvs_theorem");
                var prooflite_strategy = e.data.get("prooflite_strategy");
                var modelEditor = ModelEditor.getInstance();
                (PluginManager.getInstance().isLoaded(modelEditor)
                    ? Promise.resolve()
                    : PluginManager.getInstance().enablePlugin(modelEditor))
                .then(function () {
                    var theTheory = Handlebars.compile(pvs_theory, { noEscape: true })({
                        theory_name: "reversibility",
                        importing: emucharts_theory_name,
                        transition_system: Handlebars.compile(pvs_transition_system, { noEscape: true })({
                            functionName: "action",
                            transitions: transitions
                        }),
                        pvs_property: pvs_property,
                        pvs_guard: Handlebars.compile(pvs_guard, { noEscape: true })({
                            guard_name: "guard",
                            state: "State"
                        }),
                        pvs_theorem: pvs_theorem,
                        prooflite_strategy: prooflite_strategy
                    });
                    projectManager.project().addFile("reversibility.pvs", theTheory, { overWrite: true });
                    projectManager.selectFile("reversibility.pvs");
                });
            }).on("dismiss", function (e, view) {
                // just remove window
                view.remove();
            });
        });

        d3.select("#btn_menuVisibilityOfModes").on("click", function () {
            // document.getElementById("menuVerification").children[1].style.display = "none";
            var stateVariables = emuchartsManager.getVariables().map(function (variable) {
                return variable.name;
            }).concat([ "current_state", "previous_state" ]);
            var transitionLabels = emuchartsManager.getTransitions();
            var transitions = d3.map();
            var parser = new EmuchartsParser();
            transitionLabels.forEach(function (label) {
                var ans = parser.parseTransition(label.name);
                if (ans.res) {
                    transitions.set(ans.res.val.identifier.val);
                }
            });
            transitions = transitions.keys();
            FeedbackTemplateView.create({
                header: "Visibility of modes",
                stateVariables: stateVariables,
                transitions: transitions,
                buttons: ["Dismiss", "Create PVS Theory"]
            }).on("create pvs theory", function (e, view) {
                // do something useful here.... like create a pvs file with the instantiated property
                var emucharts_theory_name = "emucharts_" + projectManager.project().name().replace(/-/g, "_");
                var pvs_property = e.data.get("pvs_property");
                var pvs_theorem = e.data.get("pvs_theorem");
                var prooflite_strategy = e.data.get("prooflite_strategy");
                var modelEditor = ModelEditor.getInstance();
                (PluginManager.getInstance().isLoaded(modelEditor)
                    ? Promise.resolve()
                    : PluginManager.getInstance().enablePlugin(modelEditor))
                .then(function () {
                    var theTheory = Handlebars.compile(pvs_theory, { noEscape: true })({
                        theory_name: "visibility",
                        importing: emucharts_theory_name,
                        transition_system: Handlebars.compile(pvs_transition_system, { noEscape: true })({
                            functionName: "action",
                            transitions: transitions
                        }),
                        pvs_property: pvs_property,
                        pvs_guard: Handlebars.compile(pvs_guard, { noEscape: true })({
                            guard_name: "guard",
                            state: "State"
                        }),
                        pvs_theorem: pvs_theorem,
                        prooflite_strategy: prooflite_strategy
                    });
                    projectManager.project().addFile("visibility.pvs", theTheory, { overWrite: true });
                    projectManager.selectFile("visibility.pvs");
                });
            }).on("dismiss", function (e, view) {
                // just remove window
                view.remove();
            });
        });
        //-- Zoom menu -----------------------------------------------------------
        d3.select("#menuZoom").on("mouseover", function () {
            document.getElementById("menuZoom").children[1].style.display = "block";
        });
        d3.select("#btn_menuZoomIn").on("click", function () {
            emuchartsManager.zoom_in();
            document.getElementById("menuZoom").children[1].style.display = "none";
        });
        d3.select("#btn_menuZoomOut").on("click", function () {
            emuchartsManager.zoom_out();
            document.getElementById("menuZoom").children[1].style.display = "none";
        });
        d3.select("#btn_menuZoomReset").on("click", function () {
            emuchartsManager.zoom_reset();
            document.getElementById("menuZoom").children[1].style.display = "none";
        });

        //--node filter handler
        d3.select("input#filter").on("keyup", function () {
            var editor = emuchartsManager.getSelectedEditor();
            if (editor) {
                editor._nodeFilter = d3.select("input#filter").property("value");
                emuchartsManager.render();
            }
        });

        //-- Emuchart Selector  -----------------------------------------------------------
        EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
        // d3.select("#btn_emucharts_1").on("click", function () {
        //     emuchartsManager.loadEmucharts("EMUCHART__0");
        // });

        //-- tables
        // TODO: Just passing by, but this should really be generalised to a function
        d3.select("#btnStates").on("click", function () {
            d3.select("#btnStates").classed("active", true);
            d3.select("#btnTransitions").classed("active", false);
            d3.select("#btnVariables").classed("active", false);
            d3.select("#btnConstants").classed("active", false);
            d3.select("#btnDatatypes").classed("active", false);
            d3.select("#MachineStates").style("display", "block");
            d3.select("#TransitionsTable").style("display", "none");
            d3.select("#StateAttributes").style("display", "none");
            d3.select("#ConstantsTable").style("display", "none");
            d3.select("#DatatypesTable").style("display", "none");
        });
        d3.select("#btnTransitions").on("click", function () {
            d3.select("#btnStates").classed("active", false);
            d3.select("#btnTransitions").classed("active", true);
            d3.select("#btnVariables").classed("active", false);
            d3.select("#btnConstants").classed("active", false);
            d3.select("#btnDatatypes").classed("active", false);
            d3.select("#MachineStates").style("display", "none");
            d3.select("#TransitionsTable").style("display", "block").classed("active");
            d3.select("#StateAttributes").style("display", "none");
            d3.select("#ConstantsTable").style("display", "none");
            d3.select("#DatatypesTable").style("display", "none");
        });
        d3.select("#btnVariables").on("click", function () {
            d3.select("#btnStates").classed("active", false);
            d3.select("#btnTransitions").classed("active", false);
            d3.select("#btnVariables").classed("active", true);
            d3.select("#btnConstants").classed("active", false);
            d3.select("#btnDatatypes").classed("active", false);
            d3.select("#MachineStates").style("display", "none");
            d3.select("#TransitionsTable").style("display", "none");
            d3.select("#StateAttributes").style("display", "block").classed("active");
            d3.select("#ConstantsTable").style("display", "none");
            d3.select("#DatatypesTable").style("display", "none");
        });
        d3.select("#btnConstants").on("click", function () {
            d3.select("#btnStates").classed("active", false);
            d3.select("#btnTransitions").classed("active", false);
            d3.select("#btnVariables").classed("active", false);
            d3.select("#btnConstants").classed("active", true);
            d3.select("#btnDatatypes").classed("active", false);
            d3.select("#MachineStates").style("display", "none");
            d3.select("#TransitionsTable").style("display", "none");
            d3.select("#StateAttributes").style("display", "none");
            d3.select("#ConstantsTable").style("display", "block").classed("active");
            d3.select("#DatatypesTable").style("display", "none");
        });
        d3.select("#btnDatatypes").on("click", function () {
            d3.select("#btnStates").classed("active", false);
            d3.select("#btnTransitions").classed("active", false);
            d3.select("#btnVariables").classed("active", false);
            d3.select("#btnConstants").classed("active", false);
            d3.select("#btnDatatypes").classed("active", true);
            d3.select("#MachineStates").style("display", "none");
            d3.select("#TransitionsTable").style("display", "none");
            d3.select("#StateAttributes").style("display", "none");
            d3.select("#ConstantsTable").style("display", "none");
            d3.select("#DatatypesTable").style("display", "block").classed("active");
        });
        d3.select("#btnViewHideTable").on("click", function () {
            d3.select("#EmuchartsFloatTable").style("top", "814px");
            d3.select("#btnViewHideTable").style("display", "none");
            d3.select("#btnViewRevealTable").style("display", "block");
        });
        d3.select("#btnViewRevealTable").on("click", function () {
            d3.select("#EmuchartsFloatTable").style("top", "614px");
            d3.select("#btnViewHideTable").style("display", "block");
            d3.select("#btnViewRevealTable").style("display", "none");
        });

        //-- PIM -----------------------------------------------------------------
        d3.select("#btn_toPIM").on("click", function () {
            if (emuchartsManager.getIsPIM()) {
                console.log("Warning, current emuchart is already a PIM.");
                return;
            }
            if (emuchartsManager.toPIM(true)) {
                console.log("Success, converted emuchart to a PIM.");
            }
            else {
                console.log("Warning, unable to convert emuchart to a PIM.");
            }
        });
        d3.select("#btn_fromPIM").on("click", function () {
            if (!emuchartsManager.getIsPIM()) {
                console.log("Warning, current emuchart is not a PIM.");
                return;
            }
            if (emuchartsManager.toPIM(false)) {
                console.log("Success, converted emuchart from a PIM.");
            }
            else {
                console.log("Warning, unable to convert emuchart from a PIM.");
            }
        });
        d3.select("#btn_menuTestGenerator").on("click", function () {
            if (!emuchartsManager.getIsPIM()) {
                console.log("Warning, current emuchart is not a PIM.");
                return;
            }
            var initTrans = emuchartsManager.getInitialTransitions();
            var emuchart = {
                name: ("emucharts_" + projectManager.project().name()),
                author: {
                    name: "<author name>",
                    affiliation: "<affiliation>",
                    contact: "<contact>"
                },
                //constants: emuchartsManager.getConstants(),
                //variables: emuchartsManager.getVariables(),
                states: emuchartsManager.getStates(),
                transitions: emuchartsManager.getTransitions(),
                initial_transitions: initTrans,
                pm: {
                    name: projectManager.project().name(),
                    widgets: [],
                    components: emuchartsManager.getStates(),
                    pmr: []
                },
                start_state: initTrans ? initTrans[0].target.name : "",
                final_states: [],
                isPIM: emuchartsManager.getIsPIM()
            };

            var tests = pimTestGenerator.print(emuchart.name, { pims: [ emuchart ], pms: [] });
            if (tests.err) {
                console.log(tests.err);
                return;
            }
            if (tests.res) {
                var name = tests.file_name;
                var content = tests.res;
                return projectManager.project().addFile(name, content, { overWrite: true });
            } else {
                console.log("Warning, TestGenerator model is undefined.");
            }
        });
        d3.select("#btn_menuTestGeneratorFromFile").on("click", function () {
            var models;
            // Generate tests from importing a file
            FileHandler.openLocalFileAsText(function (err, res) {
                if (res) {
                    // Try parse as PIM
                    models = pimImporter.importPIM(res);
                    if (models.err) {
                        console.log(models.err);
                        return;
                    }
                    // Remove file extension
                    var name = res.name.substr(0, res.name.lastIndexOf('.'));
                    var tests = pimTestGenerator.print(name, models.models);
                    if (tests.err) {
                        console.log(tests.err);
                        return;
                    }

                    if (tests.res) {
                        var testsName = tests.file_name;
                        var content = tests.res;
                        return projectManager.project().addFile(testsName, content, { overWrite: true });

                    } else {
                        console.log("Warning, TestGenerator model is undefined.");
                    }

                } else {
                    console.log("Error while opening file (" + err + ")");
                }

            }, { header: "Open PIM file..." });
        });
        d3.select("#btn_menuPMTextGenerator").on("click", function () {
            if (!emuchartsManager.getIsPIM()) {
                console.log("Warning, current emuchart is not a PIM.");
                return;
            }
            var emuchart = {
                pm: {
                    name: projectManager.project().name(),
                    widgets: [],
                    components: emuchartsManager.getStates(),
                    pmr: []
                }
            };

            var text = PMTextGenerator.print(("emucharts_" + projectManager.project().name()), emuchart);
            if (text.err) {
                console.log(text.err);
                return;
            }
            if (text.res) {
                var name = text.file_name;
                var content = text.res;
                return projectManager.project().addFile(name, content, { overWrite: true });
            }
        });
	};

    Emulink.prototype.getEmuchartsManager = function () {
        return emuchartsManager;
    };

    Emulink.prototype.getDependencies = function () {
        return [];
    };

    function unloadExternalListeners() {
        projectManager.removeListener("ProjectChanged", onProjectChanged);
    }

    function onProjectChanged(event) {
        // try to open all emucharts files of the project
        function finalize() {
            // render emuchart
            emuchartsManager.render();
            // set initial editor mode
            var _this = require("plugins/emulink/Emulink").getInstance();
            _this.browseMode();
            //set Variables Table
            contextTable.setContextVariables(emuchartsManager.getVariables());
            // set Machine States Table
            machineStatesTable.setMachineStates(emuchartsManager.getStates());
            // set Transitions Table
            transitionsTable.setTransitions(emuchartsManager.getTransitions());
            // set Constants Table
            constantsTable.setConstants(emuchartsManager.getConstants());
            // set Datatypes Table
            datatypesTable.setDatatypes(emuchartsManager.getDatatypes());
        }
        function readFile(file, opt) {
            fs.readFile(file.path).then(function (res) {
                res.content = JSON.parse(res.content);
                emuchartsManager.importEmucharts(res, opt);
                EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
                finalize();
            }).catch(function (err) {
                // log any error
                console.log(err);
                // open an empty chart and give it the same name of the corrupted emuchart
                emuchartsManager.newChart(file.name);
                EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
            });
        }
        var path = event.current.name();
        emuchartsManager.closeAllCharts();
        return new Promise(function (resolve, reject) {
            WSManager.getWebSocket().send({type: "readDirectory", path: path}, function (err, res) {
                if (err) {
                    reject(err);
                } else {
                    var emuchartsFiles = res.files.filter(function (file) {
                        return file.name.endsWith(".emdl");
                    }).sort(function (a,b) {
                        return a.name < b.name;
                    });
                    if (emuchartsFiles && emuchartsFiles.length > 0) {
                        var promises = [];
                        var isFirst = true;
                        emuchartsFiles.forEach(function (file) {
                            promises.push(new Promise(function (resolve, reject) {
                                // Defer loading of files to avoid unresponsive user interfaces
                                // This is useful when the project has multiple files, as it may take some time to load them
                                if (isFirst) {
                                    isFirst = false;
                                    readFile(file);
                                } else {
                                    setTimeout(function () {
                                        readFile(file, { select: false });
                                    }, 1000);
                                }
                            }));
                        });
                        Promise.all(promises).then(function (res) {
                            resolve(emuchartsFiles);
                        }).catch(function (err) { reject(err); });
                    } else {
                        // if the emuchart files are not in the project, then just create an empty emuchart
                        emuchartsManager.closeAllCharts();
                        emuchartsManager.newChart();
                        EmuchartsSelector.render(emuchartsManager.getEmuchartsDescriptors());
                        finalize();
                    }
                    resolve(emuchartsFiles);
                }
            });
        });
    }

    Emulink.prototype.initialise = function () {
        // enables the plugin -- this includes also enabling any dependencies defined in getDependencies method
        // create local references to PVS editor, websocket client, and project manager
        editor = ModelEditor.getInstance().getEditor();
        ws = pvsioWebClient.getWebSocket();
        projectManager = ProjectManager.getInstance();
        // listen to ProjectChanged events so that we can update the editor when a new project is opened
        projectManager.addListener("ProjectChanged", onProjectChanged);
        // create user interface elements
        this.createHtmlElements();
        return new Promise(function (resolve, reject) {
            onProjectChanged({ current: projectManager.project() }).then(function () {
                resolve(true);
            }).catch(function (err) {
                console.log(err);
                reject(err);
            });
        });
    };

    Emulink.prototype.unload = function () {
        PVSioWebClient.getInstance().removeCollapsiblePanel(canvas);
        canvas = null;
        unloadExternalListeners();
    };

    module.exports = {
        getInstance: function () {
            if (!instance) {
                instance = new Emulink();
            }
            return instance;
        },

        hasInstance: function () {
            return !!instance;
        }
    };
});
