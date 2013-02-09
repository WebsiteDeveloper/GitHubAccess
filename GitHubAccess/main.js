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
    
    
    var AppInit = brackets.getModule("utils/AppInit"),
        CommandManager = brackets.getModule("command/CommandManager"),
        KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        Github = require("github").Github;

    var user,
        pass;
    
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
        
        var github = new Github({
            username: user,
            password: pass,
            auth: "basic"
        });
        console.log("Init");
        console.log(github);
        
        var repository = new github.Repository({user: user, name: "brackets"});
        repository.show(function (err, repo) {console.log(err); console.log(repo); });
        repository.getTree("master?recursive=true", function (err, tree) {
            console.log(tree);
            var json = getJSONTree(tree, {"path": ""});
            console.log(json);
            ProjectManager._renderTree(json);
        });
    }
    
    function getJSONTree(treeArray, firstparent) {
        var tree = {
            "data": []
        };
        var i, j;
        var slice, index;
        var parent = firstparent;
        
        for(i = 0; i < treeArray.length; i++) {
            if(!isChild(parent, treeArray[i])) {
                index = i;
                break;
            } else if(isImmidiateChild(parent, treeArray[i]) && treeArray[i].type !== "tree") {
                tree.data.push({
                    "data": {
                        "title": treeArray[i].path,
                    },
                    "metadata": {fullpath: treeArray[i].path}
                });
            } else if(isImmidiateChild(parent, treeArray[i]) && treeArray[i].type === "tree") {
                var index;
                for(j = i; j < treeArray.length; j++) {
                    if(!isChild(treeArray[i], treeArray[j])) {
                        index = j;
                        break;
                    }
                }
                
                tree.data.push({
                    "data": {
                        "title": treeArray[i].path,
                        "icon": "folder"
                    },
                    "metadata": {fullpath: treeArray[i].path},
                    "children": getJSONSubTree(treeArray.slice(i,j), treeArray[i])
                });
            }
        }
        
        return tree;
    }
    
    function getJSONSubTree(treeArray, firstparent) {
        console.log("SubTreeArray:");
        console.log(treeArray);
        console.log("Parent:");
        console.log(firstparent);
        
        var tree = [];
        var i, j;
        var index;
        var parent = firstparent;
        
        for(i = 0; i < treeArray.length; i++) {
            if(!isChild(parent, treeArray[i])) {
                index = i;
                break;
            } else if(isImmidiateChild(parent, treeArray[i]) && treeArray[i].type !== "tree") {
                tree.push({
                    "data": {
                        "title": treeArray[i].path
                    },
                    "metadata": {fullpath: treeArray[i].path}
                });
            } else if(isImmidiateChild(parent, treeArray[i]) && treeArray[i].type === "tree") {
                var index;
                for(j = i; j < treeArray.length; j++) {
                    if(!isChild(treeArray[i], treeArray[j])) {
                        index = j;
                        break;
                    }
                }
                
                tree.push({
                    "data": {
                        "title": treeArray[i].path,
                        "icon": "folder" 
                    },
                    "metadata": {fullpath: treeArray[i].path},
                    "children": getJSONSubTree(treeArray.slice(i,j), treeArray[i])
                });
            }
        }
        
        return tree;
    }
    
    
    function isChild(parent, child) {
        if (child.type === "tree") {
            /*console.log("Tree:");
            console.log(child.path.substr(0, parent.path.length));
            console.log(parent.path);*/
            return (child.path.substr(0, parent.path.length) === parent.path);
        } else {
//            console.log("File:");
//            console.log(child.path.substr(0, parent.path.length));
//            console.log(parent.path);
            return (child.path.substr(0, parent.path.length) === parent.path);
        }
    }
    
    function isImmidiateChild(parent, child) {
        var temp;
        
        if (child.type === "tree") {
            //console.log("Tree:");
            temp = child.path.substring(0, child.path.length);
            //console.log(temp);
            //console.log(parent.path);
            //console.log(temp.substring(0, temp.lastIndexOf("/")));
            return (temp.substring(0, temp.lastIndexOf("/")) === parent.path);
        } else {
            //console.log("File:");
            //console.log(child.path.substr(0, child.path.lastIndexOf("/")));
            //console.log(parent.path);
            return (child.path.substr(0, child.path.lastIndexOf("/")) === parent.path);
        }
    }
    
    AppInit.htmlReady(function () {
        var commandId = "GitHubExtension.init";
        
        CommandManager.register("Initialize GitHubExtension", commandId, GitHubAccess);
        KeyBindingManager.addBinding(commandId, "Ctrl-Shift-G");
    });
});