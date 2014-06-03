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

/*jslint sloppy: true, vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 100 */
/*global define, $, brackets, Mustache, Bloodhound*/

define(function (require, exports, module) {
    var Dialogs             = brackets.getModule("widgets/Dialogs"),
        FileSystem          = brackets.getModule("filesystem/FileSystem"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        NodeDomain          = brackets.getModule("utils/NodeDomain"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        _                   = brackets.getModule("thirdparty/lodash"),
        Octokit             = require("octokit"),
        cloneDialog         = require("text!templates/clone-dialog.html"),
        loginDialog         = require("text!templates/login-dialog.html"),
        cloneDialogData     = require("text!json/clone-dialog.json"),
        loginDialogData     = require("text!json/login-dialog.json"),
        prefs               = PreferencesManager.getExtensionPrefs("bsirlinger.github-access");

    var domain = new NodeDomain("github-access", ExtensionUtils.getModulePath(module, "node/GitHubAccessDomain")),
        globalToken;

    
    function GitHubManager() {
    }
    
    GitHubManager.prototype.cloneRepo = function (repoName, repo, branch, targetDir) {
        domain.exec("cloneRepo", globalToken, repoName, branch, targetDir)
            .done(function (result) {
                console.log(result);
            }).fail(function (err) {
                console.error(err);
            });
    };
    
    GitHubManager.prototype.addSelectMenueForArray = function ($element, array) {
        var htmlString = "",
            length = array.length,
            i;
        
        for (i = 0; i < length; i++) {
            htmlString += "<option value='" + array[i] + "'>" + array[i] + "</option>";
        }
        
        $element.html(htmlString);
    };
    
    GitHubManager.prototype.buildBranchArray = function (rawBranches) {
        var branches = [];

        branches = _.flatten(rawBranches);
        
        return _.difference(_.unique(branches.sort(), true), ["refs", "heads"]);
    };
    
    GitHubManager.prototype.openCloneDialog = function (gh, self) {
        var templateVars,
            dlg,
            repo,
            $dlg,
            bloodhound = new Bloodhound({
                local: prefs.get("rememberedRepos"),
                datumTokenizer: function (d) {
                    return Bloodhound.tokenizers.whitespace(d);
                },
                queryTokenizer: Bloodhound.tokenizers.whitespace
            }),
            promise = bloodhound.initialize();
        
        templateVars = JSON.parse(cloneDialogData);
        
        dlg = Dialogs.showModalDialogUsingTemplate(Mustache.render(cloneDialog, templateVars), false);
        
        $dlg = dlg.getElement();
        
        promise.done(function () {
            $dlg.find("input.repo").typeahead(null, {
                name: "repo-hints",
                source: function (query, cb) {
                    bloodhound.get(query, function (r) {
                        cb(r);
                    });
                },
                displayKey: function (o) {
                    return o;
                },
                highlight: true
            });
        });
        
        $dlg.find("button.get-branches").on("click", function (event) {
            var value = $dlg.find(".repo.tt-input").val().trim();
            
            if (value !== "") {
                repo = gh.getRepo(value.split("/")[0], value.split("/")[1]);
                
                repo.getBranches().then($.proxy(function (branches) {
                    var temp = prefs.get("rememberedRepos");
                    if (!_.contains(temp, value)) {
                        temp.push(value);
                    }
                    
                    prefs.set("rememberedRepos", temp);
                    prefs.save();
                    branches = this.buildBranchArray(branches);
                    
                    var $step  = $dlg.find("div.step1"),
                        $input;
                    
                    this.addSelectMenueForArray($step.find("select.branch-selection"), branches);
                    $step.css("display", "block");
                    $step.find("select.branch-selection").chosen();
                    
                    $input = $step.find("input.target-path");
                    
                    $step.find("button.select-folder").on("click", function () {
                        FileSystem.showOpenDialog(false, true, "Choose target path", null, [], function (error, dir) {
                            if (!error && dir) {
                                $input.val(dir);
                                $input.change();
                            }
                        });
                    });
                    
                    $input.on("keydown change", function () {
                        if ($(this).val().trim() !== "") {
                            $dlg.find(".githubaccess-clone").removeAttr("disabled");
                        } else {
                            $dlg.find(".githubaccess-clone").attr("disabled");
                        }
                    });
                    
                }, self), function (answer) {
                    var message;
                    
                    try {
                        message = JSON.parse(answer.error).message;
                    } catch (err) {
                        message = "An internal Error occured.";
                    }
                    
                    $dlg.find(".errors").html("<div class='error'>Error: " + message + "</div>");
                });
            }
        });
        
        $dlg.on("buttonClick", function (event, id) {
            if (id === "cancel") {
                Dialogs.cancelModalDialogIfOpen("github-access", "cancel");
            } else if (id === "clone") {
                var value = $dlg.find(".repo.tt-input").val().trim();
                
                self.cloneRepo(value, repo, $dlg.find(".branch-selection").val(), $dlg.find("div.step1").find("input.target-path").val());
                
                Dialogs.cancelModalDialogIfOpen("github-access", "clone");
            }
        });
    };
    
    GitHubManager.prototype.checkLoginData = function ($element) {
        var valid = ($element.find("input.oauth-token").val().trim().length === 40);
        
        return valid;
    };
    
    GitHubManager.prototype.init = function () {
        var gh,
            self = new GitHubManager(),
            repo,
            templateVars,
            dlg,
            $dlg,
            temp;
        
        temp = prefs.get("token");
        
        if (temp.length === 40) {
            gh = new Octokit({
                token: temp
            });
            
            globalToken = temp;
            self.openCloneDialog(gh, self);
            return;
        }
        
        templateVars = JSON.parse(loginDialogData);
        
        dlg = Dialogs.showModalDialogUsingTemplate(Mustache.render(loginDialog, templateVars), false);
        
        $dlg = dlg.getElement();
        
        $dlg.on("buttonClick", function (event, id) {
            if (id === "cancel") {
                Dialogs.cancelModalDialogIfOpen("github-access-login", "cancel");
            } else if (id === "login") {
                var valid = self.checkLoginData($dlg);
                
                if (valid) {
                    var token = $dlg.find("input.oauth-token").val();
                    globalToken = token;
                    gh = new Octokit({
                        token: token
                    });
                    
                    if ($dlg.find("input:checked").size() === 1) {
                        prefs.set("token", token);
                        prefs.save();
                    }
                    
                    Dialogs.cancelModalDialogIfOpen("github-access-login", "login");
                    self.openCloneDialog(gh, self);
                }
            }
        });
    };
    
    prefs.definePreference("token", "string", "");
    prefs.definePreference("rememberedRepos", "array", []);
    
    /*Exporting GitHubManager*/
    exports.GitHubManager = GitHubManager;
});