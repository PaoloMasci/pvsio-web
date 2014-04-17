/** enter emulink code here **/
/**
 * 
 * @author Patrick Oladimeji
 * @date 11/21/13 21:24:31 PM
 */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, d3, require, $, brackets, window, document */
define(function (require, exports, module) {
	"use strict";
	var stateMachine			= require("plugins/emulink/stateMachine"),
        handlerFile             = require("util/fileHandler"),
        pvsWriter               = require("plugins/emulink/stateToPvsSpecificationWriter"),
        parserSpecification     = require("plugins/emulink/parserSpecification"),
		PrototypeBuilder		= require("pvsioweb/PrototypeBuilder"),
		Logger					= require("util/Logger"),
        Simulator               = require("plugins/emulink/simulator"),
       // PDFHandler              = require("plugins/emulink/PDFHandler"),
        EmulinkFile             = require("plugins/emulink/fileHandler/fileHandler");

    var emulinkHasBeenUsed = false; //Default: Current Project is not Emulink Project
    var ws;
	var currentProject;
	var projectManager;
	var editor;
	
	function init_menu() {
		var infoBox = document.getElementById("infoBar");
		if(infoBox) {
			infoBox.style.background = "seagreen";
			infoBox.style.color = "white";
			infoBox.style.cursor = "default";
		}
	}

	function createHtmlElements(pvsioWebClient) {
		var content = require("text!plugins/emulink/forms/maincontent.handlebars");
        var canvas = pvsioWebClient.createCollapsiblePanel("Statechart Editor");
        canvas = canvas.html(content);
		// start emulink
        if( ! emulinkHasBeenUsed ) {   
            showEmulinkStatus();
            stateMachine.init(editor, ws, currentProject, projectManager, true);
            currentProject.name("default_pvsProject");
            emulinkHasBeenUsed = true;
        }
        stateMachine.addNewDiagram();
		init_menu();
	}

	function showEmulinkStatus() {
//        document.getElementById("emulinkInfo").value = "Emulink Status: Active ";
//        document.getElementById("emulinkInfo").style.color = "#53760D";
    }


	function highlightSelectedFunction(m) {
		// reset colors	of all functions in the menu
		document.getElementById("button_state").style.background = "";
		document.getElementById("button_transition").style.background = "";
		document.getElementById("button_self_transition").style.background = "";
		document.getElementById("button_add_field").style.background = "";
		// highlight selected function in the menu
		if( m == stateMachine.MODE.ADD_NODE && document.getElementById("button_state") ) {
			document.getElementById("button_state").style.background = "steelblue";
		}
		if( m == stateMachine.MODE.ADD_TRANSITION && document.getElementById("button_transition") ) {
			document.getElementById("button_transition").style.background = "steelblue";
		}
		if( m == stateMachine.MODE.ADD_SELF_TRANSITION && document.getElementById("button_self_transition") ) {
			document.getElementById("button_self_transition").style.background = "steelblue";
		}
		if( m == stateMachine.MODE.ADD_FIELD && document.getElementById("button_add_field") ) {
			document.getElementById("button_add_field").style.background = "steelblue";
		}
	}

	function modeChange_callback(event) {
		var infoBar = document.getElementById("infoBar");
		if(infoBar) { 
			infoBar.textContent = "Editor mode: " + stateMachine.mode2string(event.mode); 
		}
		var infoBox = document.getElementById("infoBox");
		if(infoBox) {
			infoBox.value = (event.message && event.message != "")? 
							event.message : stateMachine.modeTooltip(event.mode);	
		}
		// highlight selected function in the menu
		highlightSelectedFunction(event.mode);

		// debug line
		console.log(event.mode);
	}

	function Emulink(pvsioWebClient) {
		//register prototype builder as a plugin since this plugin depends on it
		var pb = pvsioWebClient.registerPlugin(PrototypeBuilder);
		projectManager = pb.getProjectManager();
		editor = pb.getEditor();
        ws = pvsioWebClient.getWebSocket();
        currentProject = projectManager.project();
        var selectedFileChanged;	
        
		stateMachine.addListener("editormodechanged", modeChange_callback);
		//create the user interface elements
		createHtmlElements(pvsioWebClient);

        projectManager.addListener("SelectedFileChanged", function (event) {
                selectedFileChanged = event.selectedItemString;
        });
		// d3.select("#toPDF").on("click", function() { PDFHandler.toPDF(currentProject, stateMachine, ws); });
        projectManager.addListener("SelectedFileChanged", function (event) {
                selectedFileChanged = event.selectedItemString;
        });
        d3.select("#state_machine").on("click", function () { 
			stateMachine.init(editor, ws, currentProject, projectManager); 
		});
        d3.select("#button_state").on("click", function () { 
			stateMachine.add_node_mode(); 
		});
        d3.select("#button_transition").on("click", function () { 
			stateMachine.add_transition_mode(); 
		});
        d3.select("#button_self_transition").on("click", function () { 
			stateMachine.add_self_transition_mode(); 
		});
		d3.select("#button_add_field").on("click", function () {
			stateMachine.add_field_mode_start();
			var newField = prompt("Please enter type and name of the new state variable (for example, int value)", 
									"fieldtype fieldname");
			if(!newField || newField.split(' ').length != 2) {
				if(newField) { alert("Wrong format: new state variable has not been added"); }
				return stateMachine.add_field_mode_end(null, null);
			}
			var field_name = newField.split(' ')[0];
			var field_type = newField.split(' ')[1];
			var msg = "State variable " + field_name 
					+ " of type " + field_type + " successfully added."
			stateMachine.add_field_mode_end(field_name, field_type, msg);
		});


        // creates a new PVS file and displays it in file browser
        d3.select("#new_file").on("click", function ( ) {	
            projectManager.newFile();
        });
    
        d3.select("#save_file").on("click", function () {
            
        });

    
        /// When user clicks on open_file button #open_file, a form is showed 
        d3.select("#open_file").on("click", function () {
	       projectManager.openFiles(function () {
               //insert anything here if you need something to happen after files are added
           });
        });
	
        /// User wants to rename a file 
        d3.select("#rename_file").on("click", function () {
            projectManager.renameFile(projectManager.getSelectedFile());
        });
   

        /// User wants to close a file (it will be not shown in file list box on the right ) 
        d3.select("#close_file").on("click", function () {
	       projectManager.closeFile(projectManager.getSelectedFile());	
        });

        /// User wants to see all files of the project 
        d3.select("#show_all_files").on("click", function () {
	       projectManager.showAllFiles();
        });

        /// User wants to delete a file from the project  
        d3.select("#delete_file").on("click", function () {
	       projectManager.deleteFile(projectManager.getSelectedFile(), function () {
                //do something when file is deleted 
           });
        });
    
        /// User wants to perform an undo operation on the Editor    
        d3.select("#undoEditor").on("click", function () {
            pvsWriter.undo();
        });
        
        /// User want to perform a redo operation on the Editor 
        d3.select("#redoEditor").on("click", function () {
            pvsWriter.redo();     
        });
    
        d3.select("#editor").on("click", function () {        
            pvsWriter.click();
        });
    
        d3.select("#hideTags").on("click", function() {
            pvsWriter.hideTags();
        });
    
        d3.select("#showTags").on("click", function() {
            pvsWriter.showTags();
        });

        d3.select("#specificationToDiagram").on("click", function() {     
            // User has just copied into the editor without opening any project
            if( currentProject.pvsFiles().length == 0) {
                currentProject.name("default_pvsProject");
                EmulinkFile.new_file(currentProject, editor,
									 ws, "TheoryEmulink.pvs", editor.getValue(), projectManager );
            }
            parserSpecification.init(editor, stateMachine, currentProject, 
										ws, projectManager, selectedFileChanged);
            showEmulinkStatus();
            emulinkHasBeenUsed = true;
        });
        
        
        d3.select("#startSimulation").on("click", function() {            
            var simulationIsActive = Simulator.init(ws); 
            if( simulationIsActive ) { d3.select(this).html("Disable Animation"); }
            else { d3.select(this).html("Enable Animation"); }
            //Simulator.setInitState("INITSTATE");
        });
	
        /* d3.select("#infoBoxModifiable").on("change", function () {
	
	    stateMachine.changeTextArea();
	 
        });*/
/*        document.getElementById("emulinkInfo").value = "Emulink status: NOT active";
        document.getElementById("startEmulink").disabled = false;
        /// User wants to start emulink 
        d3.select("#startEmulink").on("click", function () {
			//d3.select(this).html("Diagram created").classed("btn-danger", false).classed("btn-success", true).attr("disabled", true);
            if( ! emulinkHasBeenUsed )
            {   
                showEmulinkStatus();
	            stateMachine.init(editor, ws, currentProject, projectManager, true);
                currentProject.name("default_pvsProject");
                emulinkHasBeenUsed = true;
            }
            stateMachine.addNewDiagram();          
        });    
	   */
        //Adding Listener triggered when user saves a project
		projectManager.addListener("ProjectSaved", function (event) { 
            
            //Check If in the current project Emulink has been used
            if( emulinkHasBeenUsed )
            {    
                 var project = event.project;
                 var gd = stateMachine.getGraphDefinition();
		         var data  = {"fileName": project.path() + "/graphDefinition.json", fileContent: gd};
		         ws.writeFile(data, function (err, res) {
                 if (!err) {
                        console.log("Graph Saved");
                 }
                     else console.log("ERRORE SAVING JSON GRAPH", err);
                 });  
            }
        
        });
        
        projectManager.addListener("ProjectChanged", function (event) {              
             var emulinkSvg = d3.select("#ContainerStateMachine").selectAll("svg");
             //Checking if svg has been already created, if dirty we will clear it 
             if( emulinkSvg[0].length ){ emulinkSvg.remove(); stateMachine.clearSvg(); }             
             emulinkHasBeenUsed = false;
             var project = event.current; 
             currentProject = project;
             var fileToShow = project.mainPVSFile() || project.pvsFiles()[0];
             fileToShow = fileToShow.name();
             var f = project.path() + "/" + "graphDefinition.json";
             ws.getFile(f, function (err, res) {
					if (!err) {
                        var graphDefinitionObject = JSON.parse(res.fileContent);
                        stateMachine.restoreGraph(graphDefinitionObject, editor, ws, project, projectManager, fileToShow);
                        emulinkHasBeenUsed = true;
                        showEmulinkStatus();
					} else {
						///TODO show error loading file
						console.log(JSON.stringify(err));
                      }
             });
        
        });
        
		return this;
	}
	
	module.exports = Emulink;
});
