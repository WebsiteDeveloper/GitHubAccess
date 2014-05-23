/*jslint sloppy: true, vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 100 */
/*global require, exports, Buffer */
var os      = require("os"),
    fs      = require("fs"),
    path    = require("path"),
    _       = require("lodash"),
    Octokit = require("octokit");

var gh,
    repo,
    base64Matcher = new RegExp("^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$");

function writeTree(b, branch, tree, directory, callback) {
    var i = 0,
        helper = {
            "j": 0,
            "length": tree.length,
            "callback": function () {
                this.j++;
            },
            "writer": function (contents) {
                fs.open(path.join(directory, this.path), "w", "0666", function (err, fd) {
                    if (!err) {
                        var encoding = (base64Matcher.test(contents)) ? "base64" : "utf-8";
                        
                        var buffer = new Buffer(contents, 'binary');
                        
                        fs.write(fd, buffer, 0, buffer.length, null, function () {
                            (_.bind(helper.callback, helper))();
                            fs.close(fd);
                        });
                    } else {
                        console.log("Error");
                    }
                });
            }
        };
    
    for (i = 0; i < tree.length; i++) {
        if (tree[i].type === "blob") {
            branch.read(tree[i].path, true)
                .then(_.bind(helper.writer, tree[i]));
        } else {
            fs.mkdirSync(path.join(directory, tree[i].path));
            helper.callback();
        }
    }
}

function cmdCloneRepo(token, repoName, branch, targetDir, callback) {
    "use strict";
    
    gh = Octokit.new({
        "token": token
    });
    
    repo = gh.getRepo(repoName.split("/")[0], repoName.split("/")[1]);
    
    repo.git.getTree(branch, {
        recursive: true
    }).then(function (tree) {
        writeTree(repo.getBranch(branch), branch, tree, targetDir);
    }, function (err) {
        callback(arguments);
    });
}

/**
 * Initializes the test domain with several test commands.
 * @param {DomainManager} domainManager The DomainManager for the server
 */
function init(domainManager) {
    "use strict";
    
    if (!domainManager.hasDomain("github-access")) {
        domainManager.registerDomain("github-access", {major: 0, minor: 1});
    }
    
    domainManager.registerCommand(
        "github-access",       // domain name
        "cloneRepo",    // command name
        cmdCloneRepo,   // command handler function
        true,          // this command is synchronous in Node
        "Returns the total or free memory on the user's system in bytes",
        [{name: "token", // parameters
            type: "string",
            description: "True to return total memory, false to return free memory"}],
        [{name: "branch", // return values
            type: "string",
            description: "amount of memory in bytes"}]
    );
}

exports.init = init;