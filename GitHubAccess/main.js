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
    
    var PREFERENCES_KEY = "com.brackets.bsiringer.GitHubAccess";
    
    var AppInit             = brackets.getModule("utils/AppInit"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        Dialogs             = brackets.getModule("widgets/Dialogs"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        Resizer             = brackets.getModule("utils/Resizer"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        NativeFileSystem    = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        Strings             = brackets.getModule("strings"),
        StringUtils         = brackets.getModule("utils/StringUtils"),
        StatusBar           = brackets.getModule("widgets/StatusBar"),
        _                   = require("github")._,
        Github              = require("github").Github;
    
    var panelHTML           = require("text!panel.html"),
        loginDialogHTML     = require("text!login-dialog.html"),
        forkDialogHTML      = require("text!fork-repo-dialog.html");

    var _user,
        _pass;
    
    var _prefStorage;
    
    var _lastRepo,
        _repoInfo,
        github,
        panelVisible,
        currentBranchSha,
        branches,
        currentRootPath,
        forked = false;
    
    console.log('GitHub');
    
    /*function togglePanel() {
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
    }*/
    
    /*function _handleBranchSelection() {
        _lastSha = $(this).find(":selected").val();
        currentBranch = $(this).find(":selected").text();
        renderTree($("#project-files-container"));
    }*/
    
    /*function initGitHubConn() {
        _lastRepo.show().done(function (repo) {
            _repoInfo = repo;
            console.log(repo);
            renderTree($("#project-files-container"));
            
            var text = $("#githubaccess-panel .title").text();
            $("#githubaccess-panel .title").html(text + "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" + _repoInfo.full_name);
            
        }).fail(function (err) {
            console.log(err);
        });
        
        $(ProjectManager).on("beforeProjectClose", function () {
            $panel.hide();
        });
    }*/
    
    function handleBranchChange(event) {
        currentBranchSha = $("#github-repo-branches").val();
    }
    
    function writeTree(tree, FileSystem) {
        if (tree.length < 1) {
            return;
        }
        
        var element = tree[0];
        var length = tree.length;
        
        if (element.type !== "tree") {
            console.log(element.path);
            FileSystem.root.getFile(element.path, {create: true}, function (entry) {
                entry.createWriter(function (fileWriter) {
                    console.log(entry.fullPath);
                    _lastRepo.getBlob(element.sha).done(function (msg) {
                        console.log(msg);
                        fileWriter.write(msg);
                        if (length === 1) {
                            ProjectManager.openProject(currentRootPath);
                            StatusBar.hideBusyIndicator();
                        }
                    }).fail(function (error) {
                        if (length === 1) {
                            ProjectManager.openProject(currentRootPath);
                            StatusBar.hideBusyIndicator();
                        }
                    });
                });
            }, function (error) {
                console.log(error);
            });
        } else {
            console.log(element.path);
            FileSystem.root.getDirectory(element.path, {create: true}, function (entry) {
                console.log(entry);
                if (length === 1) {
                    ProjectManager.openProject(currentRootPath);
                    StatusBar.hideBusyIndicator();
                }
            }, function (error) {
                console.log(error);
                if (length === 1) {
                    ProjectManager.openProject(currentRootPath);
                    StatusBar.hideBusyIndicator();
                }
            });
        }
        
        tree.shift();
        writeTree(tree, FileSystem);
    }
    
    function cloneRepo() {
        StatusBar.showBusyIndicator(true);
        var deferred = new $.Deferred();
        
        NativeFileSystem.showOpenDialog(false, true, "Select Folder to clone the Repository to", "", null,
            function (files) {
                // If length == 0, user canceled the dialog; length should never be > 1
                if (files.length > 0) {
                    deferred.resolve(files[0]);
                } else {
                    deferred.reject("Canceled");
                }
            },
            function (error) {
                Dialogs.showModalDialog(
                    Dialogs.DIALOG_ID_ERROR,
                    Strings.ERROR_LOADING_PROJECT,
                    StringUtils.format(Strings.OPEN_DIALOG_ERROR, error.name)
                );
                deferred.reject(error);
            }
            );
        
        deferred.promise().done(function (rootPath) {
            var sha;
            NativeFileSystem.requestNativeFileSystem(rootPath, function (FileSystem) {
                console.log(FileSystem);
                _lastRepo.getTree(currentBranchSha + "?recursive=true").done(function (tree) {
                
                    console.log(tree);
                    writeTree(tree, FileSystem);
                });
            });
        }).fail(function (error) {
            console.log(error);
        });
        
        return deferred.promise();
    }
    
    function setRepo(url) {
        var regex = new RegExp(StringUtils.regexEscape(_user));
        var name = (url.lastIndexOf(".") === (url.length - 4)) ? url.substring(url.lastIndexOf("/"), url.lastIndexOf(".")) : url.substr(url.lastIndexOf("/") + 1);
        _lastRepo = new github.Repository({user: _user, name: name});
    }
    
    function showForkDialog() {
        Dialogs.showModalDialogUsingTemplate(Mustache.render(forkDialogHTML, Strings), "", "");
        
        $('#GitHubExtensionSubmit').hide();
        $("#GitHubExtension-fork-repo").on("click", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            var url;
            
            if ($.trim($('#GitHubExtension-repourl').val())) {
                url = $.trim($('#GitHubExtension-repourl').val());
                
                setRepo(url);
                _lastRepo.listBranches().done(function (branchesArray) {
                    branches = branchesArray;
                    var selected, i;
                    branches = _.sortBy(branchesArray, function (string) {
                        var erg = 0;
                        for (i = 0; i < string.length; i++) {
                            erg += string.toLowerCase().charCodeAt(i);
                        }
                        return erg;
                    });
                
                    $("#GitHubExtensionForkBody").append("<select id=\"github-repo-branches\"></select>");
                    
                    for (i = 0; i < branches.length; i++) {
                        if ($.trim(branches[i].name) === "master") {
                            selected = "' selected='true";
                            branches[i].object.sha = "master";
                        } else {
                            selected = "'";
                        }
                        $("#github-repo-branches").append("<option value='" + branches[i].object.sha + selected + ">" + branches[i].name + "</option>")
                                .on("change", handleBranchChange);
                    }
                    currentBranchSha = $("#github-repo-branches").val();
                    $("#GitHubExtensionSubmit").show();
                    $("#GitHubExtensionForkSubmit").on("click", function (event) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        Dialogs.cancelModalDialogIfOpen("github-fork-dialog");
                        cloneRepo().done(function (rootPath) {
                            currentRootPath = rootPath;
                        }).fail(function () {
                            console.log("Error while cloning the repo");
                        });
                    });
                });
            } else {
                console.log("No Values entered, press enter to close");
            }
        });
        
        
    }
    
    function _handleInitDialogEvents() {
        var deferred = $.Deferred();
        
        $('#GitHubExtensionSubmit').on("click", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            
            if ($.trim($('#GitHubExtension-user').val()) !== "" && $.trim($('#GitHubExtension-pass').val()) !== "") {
                _user = $.trim($('#GitHubExtension-user').val());
                _pass = $.trim($('#GitHubExtension-pass').val());
                Dialogs.cancelModalDialogIfOpen('github-login-dialog');
                var credencials = { user: _user, password: _pass };
                _prefStorage.setValue("credentials", credencials);
                
                github = new Github({
                    username: _user,
                    password: _pass,
                    auth: "basic"
                });
                
                showForkDialog();
            } else {
                console.err("No Values entered, press enter to close");
            }
        });
        
        return deferred.promise();
    }
    
    function GitHubAccess() {
        forked = false;
        if (!_prefStorage.getValue("credentials")) {
            Dialogs.showModalDialogUsingTemplate(Mustache.render(loginDialogHTML, Strings), "", "");
            _handleInitDialogEvents();
        } else {
            var credencials = _prefStorage.getValue("credentials");
            _user = credencials.user;
            _pass = credencials.password;
            
            github = new Github({
                username: _user,
                password: _pass,
                auth: "basic"
            });
            
            showForkDialog();
        }
    }
    
    AppInit.htmlReady(function () {
        var commandId = "GitHubAccess.init";
        
        CommandManager.register("Initialize GitHubAccess", commandId, GitHubAccess);
        KeyBindingManager.addBinding(commandId, "Ctrl-Alt-G");
        _prefStorage = PreferencesManager.getPreferenceStorage(PREFERENCES_KEY);
    });
});