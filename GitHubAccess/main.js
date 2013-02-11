/*
 * Copyright (c) 2013 Bernhard Sirlinger. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, brackets */


define(function (require, exports, module) {
    "use strict";
    
    brackets.getModule("thirdparty/jstree_pre1.0_fix_1/jquery.jstree");
    
    var AppInit = brackets.getModule("utils/AppInit"),
        CommandManager = brackets.getModule("command/CommandManager"),
        KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        Github = require("github").Github,
        DocumentManager = brackets.getModule("document/DocumentManager");

    var user,
        pass;
    
    var _projectInitialLoad = {
        previous        : [],   /* array of arrays containing full paths to open at each depth of the tree */
        id              : 0,    /* incrementing id */
        fullPathToIdMap : {}    /* mapping of fullPath to tree node id attr */
    },
    _lastRepo,
    github,
    suppressToggleOpen;
    
    console.log('GitHub');
    
    function GitHubAccess() {
        
        var tmplvars = brackets.getModule("strings");
        
        var template1 = '<div id="GitHubExtensionDialog" class="about-dialog modal" ><div class="modal-header"><h1 class="dialog-title">GitHub Extension</h1></div>';
        var template2 = '<div class="modal-body"><div class="about-text"><h3>Please type in your GitHub data:</h3>';
        var template3 = '<p><span>Username:&nbsp;</span><input id="GitHubExtension-user" type="text"></p>';
        var template4 = '<p><span>Password:&nbsp;&nbsp;</span><input id="GitHubExtension-pass" type="password"></p>';
        var template5 = '</div></div><div class="modal-footer"><a href="#" id="GitHubExtensionSubmit" class="dialog-button btn primary" data-button-id="ok">{{CLOSE}}</a></div></div>';
        var template = template1 + template2 + template3 + template4 + template5;
        
        Dialogs.showModalDialogUsingTemplate(Mustache.render(template, tmplvars), "", "");
        _handleInitDialogEvents();
    }
    
    function _handleInitDialogEvents() {
        $('#GitHubExtensionSubmit').on("click", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            
            if ($.trim($('#GitHubExtension-user').val()) !== "" && $.trim($('#GitHubExtension-pass').val()) !== "") {
                user = $.trim($('#GitHubExtension-user').val());
                pass = $.trim($('#GitHubExtension-pass').val());
                Dialogs.cancelModalDialogIfOpen('about-dialog');
                initGitHubConn();
            } else {
                console.log("Else");
            }
        });
    }
    
    function initGitHubConn() {
        console.log(user);
        console.log(pass);
        
        github = new Github({
            username: user,
            password: pass,
            auth: "basic"
        });
        console.log("Init");
        console.log(github);
        
        _lastRepo = new github.Repository({user: user, name: "brackets"});
        _lastRepo.show(function (err, repo) {console.log(err); console.log(repo); });
        renderTree($("#project-files-container")).done(function() {
            $("#project-files-container").show(); 
        });
    }
    
    function renderTree($projectTreeContainer, jsonData) {
        var result = new $.Deferred();
 
        $projectTreeContainer.scrollTop(0);
        
        $projectTreeContainer.hide();
        var tree = $projectTreeContainer
            .jstree({
                plugins : ["ui", "themes", "json_data", "crrm", "sort"],
                ui : { select_limit: 1, select_multiple_modifier: "", select_range_modifier: "" },
                json_data : { data: _treeDataProvider, correct_state: false },
                core : { animation: 0 },
                themes : { theme: "brackets", url: "styles/jsTreeTheme.css", dots: false, icons: false },
                strings : { loading : "Loading ...", new_node : "New node" },
                sort :  function (a, b) {
                            if (brackets.platform === "win") {
                                // Windows: prepend folder names with a '0' and file names with a '1' so folders are listed first
                                var a1 = ($(a).hasClass("jstree-leaf") ? "1" : "0") + this.get_text(a).toLowerCase(),
                                b1 = ($(b).hasClass("jstree-leaf") ? "1" : "0") + this.get_text(b).toLowerCase();
                                return (a1 > b1) ? 1 : -1;
                            } else {
                                return this.get_text(a).toLowerCase() > this.get_text(b).toLowerCase() ? 1 : -1;
                            }
                        }
            }).on(
                "before.jstree",
                function (event, data) {
                    if (data.func === "toggle_node") {
                        // jstree will automaticaly select parent node when the parent is closed
                        // and any descendant is selected. Prevent the select_node handler from
                        // immediately toggling open again in this case.
                        suppressToggleOpen = tree.jstree("is_open", data.args[0]);
                    }
                }
            ).on(
                "select_node.jstree",
                function (event, data) {
                }
            ).on(
                "reopen.jstree",
                function (event, data) {
                }
            ).on(
                "scroll.jstree",
                function (e) {
                }
            ).on(
                "loaded.jstree open_node.jstree close_node.jstree",
                function (event, data) {
                }
            ).on(
                "mousedown.jstree",
                function (event) {
                }
            );
        tree.on("init.jstree", function () {
            tree.off("dblclick.jstree")
                .on("dblclick.jstree", function (event) {
                });
            $projectTreeContainer.show();
            DocumentManager.closeAll()
            $("#project-title").text("GitHub");
        });

        return result.promise();
    }
    
    function _convertGitHubDataToJSON(data) {
        var jsonEntryList = [],
            entry,
            entryI;

        for (entryI = 0; entryI < data.length; entryI++) {
            entry = data[entryI];
            
            var jsonEntry = {
                data: entry.path,
                attr: { id: "node" + _projectInitialLoad.id++ },
                metadata: { entry: entry }
            };
            
            if (entry.type === "tree") {
                jsonEntry.children = [];
                jsonEntry.state = "closed";
            }
    
            // For more info on jsTree's JSON format see: http://www.jstree.com/documentation/json_data
            jsonEntryList.push(jsonEntry);
    
            // Map path to ID to initialize loaded and opened states
            _projectInitialLoad.fullPathToIdMap[entry.fullPath] = jsonEntry.attr.id;
        }
        console.log(jsonEntryList);
        return jsonEntryList;
    }
    
    function _treeDataProvider(treeNode, jsTreeCallback) {
        var dirEntry, isProjectRoot = false,treeData;

        if (treeNode === -1) {
            // Special case: root of tree
            isProjectRoot = true;
        } else {
            // All other nodes: the DirectoryEntry is saved as jQ data in the tree (by _convertEntriesToJSON())
            dirEntry = treeNode.data("entry");
        }
        
        if(!isProjectRoot) {
            _lastRepo.getTree(dirEntry.sha, function (err, tree) {
                console.log(tree);
                treeData = tree;
                
                var subtreeJSON = _convertGitHubDataToJSON(treeData),
                    wasNodeOpen = false,
                    emptyDirectory = (subtreeJSON.length === 0);
                
                if (emptyDirectory) {
                    if (!isProjectRoot) {
                        wasNodeOpen = treeNode.hasClass("jstree-open");
                    } else {
                        // project root is a special case, add a placeholder
                        subtreeJSON.push({});
                    }
                }
                
                jsTreeCallback(subtreeJSON);
                
                if (!isProjectRoot && emptyDirectory) {
                    // If the directory is empty, force it to appear as an open or closed node.
                    // This is a workaround for issue #149 where jstree would show this node as a leaf.
                    var classToAdd = (wasNodeOpen) ? "jstree-closed" : "jstree-open";
                    
                    treeNode.removeClass("jstree-leaf jstree-closed jstree-open")
                            .addClass(classToAdd);
                }
            });
        } else {
            _lastRepo.getTree("master", function (err, tree) {
                console.log(tree);
                treeData = tree;
                
                var subtreeJSON = _convertGitHubDataToJSON(treeData),
                    wasNodeOpen = false,
                    emptyDirectory = (subtreeJSON.length === 0);
                
                if (emptyDirectory) {
                    if (!isProjectRoot) {
                        wasNodeOpen = treeNode.hasClass("jstree-open");
                    } else {
                        // project root is a special case, add a placeholder
                        subtreeJSON.push({});
                    }
                }
                
                jsTreeCallback(subtreeJSON);
            });
        }
    }
    
    AppInit.htmlReady(function () {
        var commandId = "GitHubExtension.init";
        
        CommandManager.register("Initialize GitHubExtension", commandId, GitHubAccess);
        KeyBindingManager.addBinding(commandId, "Ctrl-Shift-G");
    });
});