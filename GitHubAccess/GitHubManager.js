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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 100 */
/*global define, $, brackets, Mustache*/

define(function (require, exports, module) {
    "use strict";
    
    require("jquery-ui-1.10.1.custom.min");
    
    var PREFERENCES_KEY = "com.brackets.bsiringer.GitHubAccess";
    
    var Dialogs             = brackets.getModule("widgets/Dialogs"),
        NativeFileSystem    = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        ProjectManager      = brackets.getModule("project/ProjectManager"),
        Strings             = brackets.getModule("strings"),
        StringUtils         = brackets.getModule("utils/StringUtils"),
        _                   = require("github")._,
        Github              = require("github").Github,
        panelHTML           = require("text!templates/panel.html"),
        loginDialogHTML     = require("text!templates/login-dialog.html"),
        forkDialogHTML      = require("text!templates/fork-repo-dialog.html"),
        currentRepo,
        userData = {username: "", password: ""},
        prefStorage;
    
    var _lastRepo,
        _repoInfo,
        github,
        currentBranchSha,
        branches,
        currentRootPath,
        forked = false,
        dialogElements = {
            $progressbar: null,
            $progressbarLabel: null
        },
        elementCount;
    
    function GitHubManager() {
    }
    
    GitHubManager.prototype.writeTree = function (tree, FileSystem) {
        if (tree.length < 1) {
            return;
        }
        var value,
            element = tree[0],
            length = tree.length;
        
        if (element.type !== "tree") {
            FileSystem.root.getFile(element.path, {create: true}, function (entry) {
                entry.createWriter(function (fileWriter) {
                    _lastRepo.getBlob(element.sha).done(function (msg) {
                        fileWriter.write(msg);
                        value = dialogElements.$progressbar.progressbar("value");
                        dialogElements.$progressbar.progressbar("value", value + 1);
                    }).fail(function (error) {
                        value = dialogElements.$progressbar.progressbar("value");
                        dialogElements.$progressbar.progressbar("value", value + 1);
                        console.log(error);
                    });
                });
            }, function (error) {
                console.log(error);
            });
        } else {
            FileSystem.root.getDirectory(element.path, {create: true}, function (entry) {
                value = dialogElements.$progressbar.progressbar("value");
                dialogElements.$progressbar.progressbar("value", value + 1);
            }, function (error) {
                console.log(error);
                value = dialogElements.$progressbar.progressbar("value");
                dialogElements.$progressbar.progressbar("value", value + 1);
            });
        }
        
        tree.shift();
        this.writeTree(tree, FileSystem);
    };
    
    GitHubManager.prototype.cloneRepo = function (rootPath) {
        var deferred = new $.Deferred(),
            self     = this;
        
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
                                dialogElements.$progressbarLabel.text((((dialogElements.$progressbar.progressbar("value") / elementCount) * 100) + " ").substring(0, 5) + "%");
                            },
                            complete: function () {
                                dialogElements.$progressbar.progressbar("destroy");
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
                                    .css("top", (dialogElements.$progressbar.innerHeight() / 2) - 5)
                                    .css("left", (dialogElements.$progressbar.innerWidth() / 2) - 30);
                            },
                            destroy: function () {
                                dialogElements.$progressbarLabel.text("")
                                    .css("top", 0)
                                    .css("left", 0);
                            }
                        });
                    self.writeTree(tree, FileSystem);
                });
            });
        }).fail(function (error) {
            console.log(error);
        });
        
        return deferred.promise();
    };
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
    
    function forkIfExternal(url) {
        var regex     = new RegExp(StringUtils.regexEscape(userData.username)),
            deferred  = new $.Deferred();
        
        if (url.search(regex) !== -1) {
        
        } else {
            deferred.resolve();
        }
        
        return deferred.promise();
    }
    
    function setRepo(url) {
        var name = (url.lastIndexOf(".") === (url.length - 4)) ? url.substring(url.lastIndexOf("/"), url.lastIndexOf(".")) : url.substr(url.lastIndexOf("/") + 1);
        _lastRepo = new github.Repository({user: userData.username, name: name});
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
                    branches = _.sortBy(branchesArray, function (branchObj) {
                        var erg = 0,
                            string = branchObj.name.toLowerCase();
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
                        GitHubManager.prototype.cloneRepo().done(function (rootPath) {
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
    
    GitHubManager.prototype._handleInitDialogEvents = function _handleInitDialogEvents() {
        var deferred = $.Deferred();
        
        $("#GitHubExtensionSubmit").on("click", function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            var user = $.trim($("#GitHubExtension-user").val()),
                pass = $.trim($("#GitHubExtension-pass").val());
            
            if (user !== "" && pass !== "") {
                userData.username = user;
                userData.password = pass;
                Dialogs.cancelModalDialogIfOpen("github-login-dialog");
                var credencials = { username: user, password: pass };
                prefStorage.setValue("credentials", credencials);
                
                github = new Github({
                    username: user,
                    password: pass,
                    auth: "basic"
                });
                
                showForkDialog();
            } else {
                console.log("No Values entered, press enter to close");
            }
        });
        
        return deferred.promise();
    };
    
    GitHubManager.prototype.init = function () {
        forked = false;
        if (!prefStorage.getValue("credentials")) {
            Dialogs.showModalDialogUsingTemplate(Mustache.render(loginDialogHTML, Strings), "", "");
            this._handleInitDialogEvents();
        } else {
            var credencials = prefStorage.getValue("credentials");
            userData.username = credencials.username;
            userData.password = credencials.password;
            
            github = new Github({
                username: userData.username,
                password: userData.password,
                auth: "basic"
            });
            
            showForkDialog();
        }
    };
    
    prefStorage = PreferencesManager.getPreferenceStorage(PREFERENCES_KEY);
    
    /*Exporting GitHubManager*/
    exports.GitHubManager = GitHubManager;
});