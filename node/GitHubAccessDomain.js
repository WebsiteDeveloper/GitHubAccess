/*jslint sloppy: true, vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 100 */
/*global require, exports, Buffer */
var os      = require("os"),
    fs      = require("fs"),
    path    = require("path"),
    $       = require("jquery"),
    Octokit = require("octokit");

var gh,
    repo;
/**
 * @private
 * Handler function for the simple.getMemory command.
 * @param {boolean} total If true, return total memory; if false, return free memory only.
 * @return {number} The amount of memory.
 */
function cmdGetMemory(total) {
    "use strict";
    
    if (total) {
        return os.totalmem();
    } else {
        return os.freemem();
    }
}

function writeTree(branch, tree, directory) {
    var i = 0;
    
    function writer(contents) {
        console.log(path.join(directory, this.path));
        
        fs.open(path.join(directory, this.path), "w", "0666", function (err, fd) {
            if (!err) {
                var buffer = new Buffer(contents, 'base64');
                
                fs.write(fd, buffer, 0, buffer.length, null, function () {
                    console.log(arguments);
                });
            } else {
                console.log(err);
            }
        });
    }
    console.log(tree.length);
    for (i = 0; i < tree.length; i++) {
        console.log(i);
        if (tree[i].type === "blob") {
            branch.contents(tree[i].path).then($.proxy(writer, tree[i]), function () {
                console.log(arguments);
            });
        } else {
            fs.mkdirSync(path.join(directory, tree[i].path));
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
        callback(null, "Done");
        writeTree(branch, tree, targetDir);
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
        "getMemory",    // command name
        cmdGetMemory,   // command handler function
        false,          // this command is synchronous in Node
        "Returns the total or free memory on the user's system in bytes",
        [{name: "total", // parameters
            type: "string",
            description: "True to return total memory, false to return free memory"}],
        [{name: "memory", // return values
            type: "number",
            description: "amount of memory in bytes"}]
    );
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