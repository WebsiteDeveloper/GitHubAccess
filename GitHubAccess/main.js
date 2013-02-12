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
/*global define, $, brackets, Mustache */


define(function (require, exports, module) {
    "use strict";
    
    brackets.getModule("thirdparty/jstree_pre1.0_fix_1/jquery.jstree");
    
    var AppInit             = brackets.getModule("utils/AppInit"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        Dialogs             = brackets.getModule("widgets/Dialogs"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        Resizer             = brackets.getModule("utils/Resizer"),
        _                   = require("github")._,
        Github              = require("github").Github;
    
    var panelHTML       = require("text!panel.html"),
        initDialogHTML  = require("text!init-dialog.html");

    var user,
        pass;
    
    var _projectInitialLoad = {
        previous        : [],   /* array of arrays containing full paths to open at each depth of the tree */
        id              : 0,    /* incrementing id */
        fullPathToIdMap : {}    /* mapping of fullPath to tree node id attr */
    },
        _lastRepo,
        _repoInfo,
        github,
        suppressToggleOpen,
        $panel,
        $contentArea,
        panelVisible,
        _projectTree;
    
    console.log('GitHub');
    
    function togglePanel() {
        if (panelVisible) {
            $panel.hide();
        } else {
            if (!$panel) {
                $panel = $(panelHTML);
                $contentArea = $panel.find("#github-status-inf");
                
                $panel.insertBefore("#status-bar");

                Resizer.makeResizable($panel, "vert", "top", 100, true);
                $panel.on("panelResizeUpdate", function (e, newSize) {
                    $contentArea.css("height", "100%");
                });
            }
            $panel.show();
        }
        EditorManager.resizeEditor();
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
        
        return jsonEntryList;
    }
    
    function _redraw(selectionChanged, reveal) {
        reveal = (reveal === undefined) ? true : reveal;
        

        // reposition the selection triangle
        $("#project-files-container").triggerHandler("scroll");
            
        // in-lieu of resize events, manually trigger contentChanged for every
        // FileViewController focus change. This event triggers scroll shadows
        // on the jstree to update. documentSelectionFocusChange fires when
        // a new file is added and removed (causing a new selection) from the working set
        _projectTree.triggerHandler("contentChanged");
    }
    
    function _treeDataProvider(treeNode, jsTreeCallback) {
        var dirEntry, isProjectRoot = false, treeData;

        if (treeNode === -1) {
            // Special case: root of tree
            isProjectRoot = true;
        } else {
            // All other nodes: the DirectoryEntry is saved as jQ data in the tree (by _convertEntriesToJSON())
            dirEntry = treeNode.data("entry");
        }
        
        if (!isProjectRoot) {
            _lastRepo.getTree(dirEntry.sha).done(function (tree) {
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
            }).fail(function (err) {
                console.log(err);
            });
        } else {
            _lastRepo.getTree("master").done(function (tree) {
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
            }).fail(function (err) {
                console.log(err);
            });
        }
    }
    
    function renderTree($projectTreeContainer) {
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
                    var entry = data.rslt.obj.data("entry");
                    if (entry.type !== "tree") {
                        var openResult = _lastRepo.getSha("master",entry.path);
                    
                        openResult.done(function (sha) {
                            // update when tree display state changes
                            var data = _lastRepo.getBlob(sha);
                            data.done(function (data) {
                                console.log(data);
                                _redraw(true);
                            }).fail(function (err) {
                                console.log(err);
                                _projectTree.jstree("deselect_all");
                            });
                            
                        }).fail(function (err) {
                            console.log(err);
                        });
                    } else {
                        FileViewController.setFileViewFocus(FileViewController.PROJECT_MANAGER);
                        // show selection marker on folders
                        _redraw(true);
                        
                        // toggle folder open/closed
                        // suppress if this selection was triggered by clicking the disclousre triangle
                        if (!suppressToggleOpen) {
                            _projectTree.jstree("toggle_node", data.rslt.obj);
                        }
                    }
                    
                    suppressToggleOpen = false;
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
            CommandManager.execute(Commands.FILE_CLOSE_ALL, { promptOnly: false });
            $("#project-title").text(_repoInfo.full_name);
        });

        _projectTree = tree;
        return result.promise();
    }
    
    function initGitHubConn() {
        var i;
        
        console.log(user);
        console.log(pass);
        
        github = new Github({
            username: user,
            password: pass,
            auth: "basic"
        });
        console.log("Init");
        console.log(github);
        
        togglePanel();
        
        _lastRepo = new github.Repository({user: user, name: "brackets"});
        _lastRepo.show().done(function (repo) {
            _repoInfo = repo;
            console.log(repo);
            renderTree($("#project-files-container")).done(function () {
                $("#project-files-container").show();
            });
            
            var text = $("#githubaccess-panel .title").text();
            $("#githubaccess-panel .title").html(text + "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" + _repoInfo.full_name);
            _lastRepo.listBranches().done(function (branches) {
                var selected;
                branches = _.sortBy(branches, function (string) {
                    var erg = 0;
                    for (i = 0; i < string.length; i++) {
                        erg += string.toLowerCase().charCodeAt(i);
                    }
                    return erg;
                });
                
                for (i = 0; i < branches.length; i++) {
                    selected = ($.trim(branches[i]) === "master") ? "' selected='true" : "";
                    $("#github-repo-branches").append("<option value='" + branches[i] + selected + "'>" + branches[i] + "</option>");
                }
            });
        }).fail(function (err) {
            console.log(err);
        });
        
        $(ProjectManager).on("beforeProjectClose", function () {
            $panel.hide();
        });
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
                console.log("No Values entered, press enter to close");
            }
        });
    }
    
    function GitHubAccess() {
        var tmplvars = brackets.getModule("strings");
        
        Dialogs.showModalDialogUsingTemplate(Mustache.render(initDialogHTML, tmplvars), "", "");
        _handleInitDialogEvents();
    }
    
    AppInit.htmlReady(function () {
        var commandId = "GitHubAccess.init";
        
        CommandManager.register("Initialize GitHubAccess", commandId, GitHubAccess);
        KeyBindingManager.addBinding(commandId, "Ctrl-Alt-G");
    });
});