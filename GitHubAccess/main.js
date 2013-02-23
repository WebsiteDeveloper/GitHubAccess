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
    
    require("jquery-ui-1.10.1.custom.min");
    
    var PREFERENCES_KEY = "com.brackets.bsiringer.GitHubAccess";
    
    var AppInit             = brackets.getModule("utils/AppInit"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
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
        currentBranchSha,
        branches,
        currentRootPath,
        forked = false,
        $progressbar,
        dialogElements,
        elementCount;
    
    console.log("GitHub");
    
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
    
    function handleBranchChange(event) {
        currentBranchSha = $("#github-repo-branches").val();
    }
    
    function writeTree(tree, FileSystem) {
        if (tree.length < 1) {
            return;
        }
        var value,
            element = tree[0],
            length = tree.length;
        
        if (element.type !== "tree") {
            console.log(element.path);
            FileSystem.root.getFile(element.path, {create: true}, function (entry) {
                entry.createWriter(function (fileWriter) {
                    console.log(entry.fullPath);
                    _lastRepo.getBlob(element.sha).done(function (msg) {
                        fileWriter.write(msg);
                        value = $progressbar.progressbar("value");
                        $progressbar.progressbar("value", value + 1);
                    }).fail(function (error) {
                        value = $progressbar.progressbar("value");
                        $progressbar.progressbar("value", value + 1);
                    });
                });
            }, function (error) {
                console.log(error);
            });
        } else {
            console.log(element.path);
            FileSystem.root.getDirectory(element.path, {create: true}, function (entry) {
                value = $progressbar.progressbar("value");
                $progressbar.progressbar("value", value + 1);
            }, function (error) {
                console.log(error);
                value = $progressbar.progressbar("value");
                $progressbar.progressbar("value", value + 1);
            });
        }
        
        tree.shift();
        writeTree(tree, FileSystem);
    }
    
    function cloneRepo() {
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
                    elementCount = tree.length;
                    dialogElements.$progressbar = $("#github-extension-progressbar");
                    dialogElements.$progressbarLabel = $("#github-extension-progressbar-label");
                    dialogElements.$progressbar.css("float", "left")
                        .css("margin", "10px")
                        .progressbar({
                            value: 0,
                            max: tree.length,
                            change: function () {
                                dialogElements.$progressbarLabel.text(((($progressbar.progressbar("value") / elementCount) * 100) + " ").substring(0, 5) + "%");
                            },
                            complete: function () {
                                $progressbar.progressbar("destroy");
                                dialogElements.$progressbarLabel.hide();
                                ProjectManager.openProject(currentRootPath);
                                $(".dialog-button").show();
                                $("#GitHubExtensionForkSubmit").show();
                                Dialogs.cancelModalDialogIfOpen("github-fork-dialog");
                            },
                            create: function () {
                                $(".dialog-button").hide();
                                $("#GitHubExtensionForkSubmit").hide();
                                dialogElements.$progressbarLabel.text("")
                                    .css("top", ($progressbar.innerHeight() / 2) - 5)
                                    .css("left", ($progressbar.innerWidth() / 2) - 30);
                            },
                            destroy: function () {
                                dialogElements.$progressbarLabel.text("")
                                    .css("top", 0)
                                    .css("left", 0);
                            }
                        });
                    writeTree(tree, FileSystem);
                });
            });
        }).fail(function (error) {
            console.log(error);
        });
        
        return deferred.promise();
    }
    
    function forkIfExternal(url) {
        var regex     = new RegExp(StringUtils.regexEscape(_user)),
            deferred  = new $.Deferred();
        
        if (url.search(regex) !== -1) {
        }else {
            deferred.resolve();
        }
        
        return deferred.promise();
    }
    
    function setRepo(url) {
        var name = (url.lastIndexOf(".") === (url.length - 4)) ? url.substring(url.lastIndexOf("/"), url.lastIndexOf(".")) : url.substr(url.lastIndexOf("/") + 1);
        _lastRepo = new github.Repository({user: _user, name: name});
    }
    
    function showForkDialog() {
        Dialogs.showModalDialogUsingTemplate(Mustache.render(forkDialogHTML, Strings), "", "");
        
        $('#GitHubExtensionSubmit').hide();
        $("#GitHubExtension-fork-repo").on("click", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            var url,
                tempUrl = $.trim($('#GitHubExtension-repourl').val());
            
            if (tempUrl !== "") {
                url = tempUrl;
                
                setRepo(url);
                _lastRepo.listBranches().done(function (branchesArray) {
                    branches = branchesArray;
                    var selected, i;
                    branches = _.sortBy(branchesArray, function (string) {
                        var erg = 0;
                        string = string.toLowerCase();
                        for (i = 0; i < string.length; i++) {
                            erg += string.charCodeAt(i);
                        }
                        return erg;
                    });
                
                    $("#GitHubExtensionForkBody").append("<select id=\"github-repo-branches\"></select>");
                    
                    for (i = 0; i < branches.length; i++) {
                        if ($.trim(branches[i].name) === "master") {
                            selected = "\" selected=\"true";
                            branches[i].object.sha = "master";
                        } else {
                            selected = "\"";
                        }
                        $("#github-repo-branches").append("<option value=\"" + branches[i].object.sha + selected + ">" + branches[i].name + "</option>")
                                .on("change", handleBranchChange);
                    }
                    currentBranchSha = $("#github-repo-branches").val();
                    $("#GitHubExtensionSubmit").show();
                    $("#GitHubExtensionForkSubmit").on("click", function (event) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        cloneRepo().done(function (rootPath) {
                            currentRootPath = rootPath;
                        }).fail(function () {
                            console.log("Error while cloning the repo");
                        });
                    });
                }).fail(function (error) {
                    console.error(error);
                });
            } else {
                console.log("No Values entered, press enter to close");
            }
        });
        
        
    }
    
    function _handleInitDialogEvents() {
        var deferred = $.Deferred();
        
        $("#GitHubExtensionSubmit").on("click", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            var user = $.trim($("#GitHubExtension-user").val()),
                pass = $.trim($("#GitHubExtension-pass").val());
            
            if (user !== "" && pass !== "") {
                _user = user;
                _pass = pass;
                Dialogs.cancelModalDialogIfOpen("github-login-dialog");
                var credencials = { user: _user, password: _pass };
                _prefStorage.setValue("credentials", credencials);
                
                github = new Github({
                    username: _user,
                    password: _pass,
                    auth: "basic"
                });
                
                showForkDialog();
            } else {
                console.log("No Values entered, press enter to close");
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
        ExtensionUtils.loadStyleSheet(module, "css/jquery-ui-1.10.1.custom.min.css");
        
        var commandId = "GitHubAccess.init";
        
        CommandManager.register("Initialize GitHubAccess", commandId, GitHubAccess);
        KeyBindingManager.addBinding(commandId, "Ctrl-Alt-G");
        _prefStorage = PreferencesManager.getPreferenceStorage(PREFERENCES_KEY);
    });
});