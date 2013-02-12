// Github.js 0.7.0
// (c) 2012 Michael Aufreiter, Development Seed
// Github.js is freely distributable under the MIT license.
// For all details and documentation:
// http://substance.io/michael/github

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, XMLHttpRequest*/

define(function (require, exports, module) {
    "use strict";

    require("base64");
    require("underscore-min");
    
    var API_URL = 'https://api.github.com',
        options;
    
    function Github(_options) {
        options = _options;
        return this;
    }
      
    Github.prototype._request = function (method, path, data, raw) {
        var deferred = new $.Deferred();
        
        var url = API_URL + path;
        url = url + ((/\?/).test(url) ? "&" : "?") + (new Date()).getTime();

        var xhr = new XMLHttpRequest();
        if (!raw) {xhr.dataType = "json"; }

        xhr.open(method, url);
        xhr.onreadystatechange = function () {
            if (this.readyState == 4) {
                if (this.status >= 200 && this.status < 300 || this.status === 304) {
                    deferred.resolve(raw ? this.responseText : this.responseText ? JSON.parse(this.responseText) : true);
                } else {
                    deferred.reject({request: this, error: this.status});
                }
            }
        };
        xhr.setRequestHeader('Accept', 'application/vnd.github.raw+json');
        xhr.setRequestHeader('Content-Type', 'application/json');
    
        if (
            (options.auth == 'oauth' && options.token) ||
            (options.auth == 'basic' && options.username && options.password)
        ) {
            xhr.setRequestHeader('Authorization',options.auth == 'oauth'
                ? 'token ' + options.token
                : 'Basic ' + Base64.encode(options.username + ':' + options.password)
            );
        }
        data ? xhr.send(JSON.stringify(data)) : xhr.send();
        
        return deferref.promise();
    }

    // User API
    // =======
    Github.prototype.User = function() {
        this.repos = function() {
            return Github.prototype._request("GET", "/user/repos?type=all&per_page=1000&sort=updated", null);
      };

      // List user organizations
      // -------

      this.orgs = function() {
        return Github.prototype._request("GET", "/user/orgs", null);
      };

      // List authenticated user's gists
      // -------

      this.gists = function() {
        return Github.prototype._request("GET", "/gists", null);
      };

      // Show user information
      // -------

      this.show = function(username) {
        var command = username ? "/users/"+username : "/user";

        return Github.prototype._request("GET", command, null);
      };

      // List user repositories
      // -------

      this.userRepos = function(username) {
        return Github.prototype._request("GET", "/users/"+username+"/repos?type=all&per_page=1000&sort=updated", null);
      };

      // List a user's gists
      // -------

      this.userGists = function(username) {
        return Github.prototype._request("GET", "/users/"+username+"/gists", null);
      };

      // List organization repositories
      // -------

      this.orgRepos = function(orgname) {
        return Github.prototype._request("GET", "/orgs/"+orgname+"/repos?type=all&per_page=1000&sort=updated&direction=desc", null);
      };

      // Follow user
      // -------

      this.follow = function(username) {
        return Github.prototype._request("PUT", "/user/following/"+username, null);
      };

      // Unfollow user
      // -------

      this.unfollow = function(username) {
        return Github.prototype._request("DELETE", "/user/following/"+username, null);
      };
    
      return this;
    };


    // Repository API
    // =======

    Github.prototype.Repository = function(options) {
      var repo = options.name;
      var user = options.user;
      
      var that = this;
      var repoPath = "/repos/" + user + "/" + repo;

      var currentTree = {
        "branch": null,
        "sha": null
      };

      // Uses the cache if branch has not been changed
      // -------
      function updateTree(branch) {
        if (branch === currentTree.branch && currentTree.sha) {
            return (new $.Deferred()).resolve(currentTree.sha));
        } else {
            return that.getRef("heads/"+branch).always(function (sha) {
                currentTree.branch = branch;
                currentTree.sha = sha;
            });
        }
      }

      // Get a particular reference
      // -------
      this.getRef = function(ref) {
        var deferred = new $.Deferred();
          
        Github.prototype._request("GET", repoPath + "/git/refs/" + ref, null).done(function (res) {
            deferred.resolve(res.object.sha);
        }).fail(function (err) {
            deferred.reject(err);
        });
          
        return deferred.promise();
      };

      // Create a new reference
      // --------
      //
      // {
      //   "ref": "refs/heads/my-new-branch-name",
      //   "sha": "827efc6d56897b048c772eb4087f854f46256132"
      // }
      this.createRef = function(options) {
        return Github.prototype._request("POST", repoPath + "/git/refs", options);
      };

      // Delete a reference
      // --------
      // 
      // repo.deleteRef('heads/gh-pages')
      // repo.deleteRef('tags/v1.0')
      this.deleteRef = function(ref) {
        return Github.prototype._request("DELETE", repoPath + "/git/refs/"+ref, options);
      };

      // List all branches of a repository
      // -------
      this.listBranches = function() {
        var deferred = new $.Deferred();  
          
        Github.prototype._request("GET", repoPath + "/git/refs/heads", null).done( function (heads) {
            deferred.resolve(_.map(heads, function(head) { return _.last(head.ref.split('/')); }));
        }).fail(function (err) {
            deferred.reject(err);
        });
          
        return deferred.promise();
      };

      // Retrieve the contents of a blob
      // -------
      this.getBlob = function(sha, cb) {
        return Github.prototype._request("GET", repoPath + "/git/blobs/" + sha, null, 'raw');
      };

      // For a given file path, get the corresponding sha (blob for files, tree for dirs)
      // -------
      this.getSha = function(branch, path, cb) {
        // Just use head if path is empty
        if (path === "") {
            return that.getRef("heads/"+branch, cb);
        } else {
            var deferred = new $.Deferred();
            
            this.getTree(branch+"?recursive=true", function(err, tree) {
                var file = _.select(tree, function(file) { return file.path === path; })[0];
                cb(null, file ? file.sha : null);
            });
        }
      };

      // Retrieve the tree a commit points to
      // -------
      this.getTree = function(tree) {
        var deferred = new $.Deferred();
          
        Github.prototype._request("GET", repoPath + "/git/trees/"+tree, null).done(function (res) {
            deferred.resolve(res.tree);
        }).fail(function (err) {
            deferred.reject(err);
        });
        
        return deferred.promise();
      };

      // Post a new blob object, getting a blob SHA back
      // -------
      this.postBlob = function(content) {
        var deferred = new $.Deferred();
          
        if (typeof(content) === "string") {
          content = {
            "content": content,
            "encoding": "utf-8"
          };
        } 
          
        Github.prototype._request("POST", repoPath + "/git/blobs", content).done(function (res) {
            deferred.resolve(res.sha);
        }).fail(function (err) {
            deferred.reject(err);    
        });
          
        return deferred.promise();
      };

      // Update an existing tree adding a new blob object getting a tree SHA back
      // -------
      this.updateTree = function(baseTree, path, blob) {
        var deferred = new $.Deferred();
          
        var data = {
          "base_tree": baseTree,
          "tree": [
            {
              "path": path,
              "mode": "100644",
              "type": "blob",
              "sha": blob
            }
          ]
        };
        Github.prototype._request("POST", repoPath + "/git/trees", data).done(function (res) {
            deferred.resolve(res.sha);
        }).fail(function (err) {
            deferred.reject(err);    
        });
          
        return deferred.promise();
      };

      // Post a new tree object having a file path pointer replaced
      // with a new blob SHA getting a tree SHA back
      // -------

      this.postTree = function(tree, cb) {
        var deferred = new $.Deferred();
          
        Github.prototype._request("POST", repoPath + "/git/trees", { "tree": tree }).done(function (res) {
            deferred.resolve(res.sha);
        }).fail(function (err) {
            deferred.reject(err);    
        });
          
        return deferred.promise();
      };

      // Create a new commit object with the current commit SHA as the parent
      // and the new tree SHA, getting a commit SHA back
      // -------

      this.commit = function(parent, tree, message) {
        var deferred = new $.Deferred();
          
        var data = {
          "message": message,
          "author": {
            "name": options.username
          },
          "parents": [
            parent
          ],
          "tree": tree
        };

        Github.prototype._request("POST", repoPath + "/git/commits", data).done(function (res) {
            currentTree.sha = res.sha; // update latest commit
            deferred.resolve(res.sha);
        }).fail(function (err)) {
            deferred.reject(err);
        });
          
        return deferred.promise();
      };

      // Update the reference of your head to point to the new commit SHA
      // -------

      this.updateHead = function(head, commit) {
        return Github.prototype._request("PATCH", repoPath + "/git/refs/heads/" + head, { "sha": commit });
      };

      // Show repository information
      // -------

      this.show = function() {
        return Github.prototype._request("GET", repoPath, null);
      };

      // Get contents
      // --------

      this.contents = function(branch, path) {
        return Github.prototype._request("GET", repoPath + "/contents?ref=" + branch, { path: path });
      };

      // Fork repository
      // -------

      this.fork = function() {
        return Github.prototype._request("POST", repoPath + "/forks", null);
      };

      // Create pull request
      // --------

      this.createPullRequest = function(options) {
        return Github.prototype._request("POST", repoPath + "/pulls", options);
      };

      // Read file at given path
      // -------
      this.read = function(branch, path) {
        var deferred = new $.Deferred();
          
        that.getSha(branch, path).done( function(sha) {
            if(!sha) {
                deferred.reject("File Not Found");
            } else {
                that.getBlob(sha).done(function(content) {
                    deferred.resolve(content, sha);
                }).fail(function (err) {
                    deferred.reject(err);
                });
            }
        }).fail(err)
            deferred.reject(err); 
        });
    
        return deferred.promise();
      };

      // Remove a file from the tree
      // -------

      this.remove = function(branch, path) {
        var deferred = new $.Deferred();
    
        updateTree(branch).done(function (latestCommit) {
            that.getTree(latestCommit+"?recursive=true".done(function (tree) {
                // Update Tree
                var newTree = _.reject(tree, function(ref) { return ref.path === path; });
                _.each(newTree, function(ref) {
                    if (ref.type === "tree") delete ref.sha;
                });

                that.postTree(newTree).done(function (rootTree)  {
                    that.commit(latestCommit, rootTree, 'Deleted '+path).done(function (commit) {
                        that.updateHead(branch, commit).done(function (res) {
                            deferred.resolve(res);
                        }).fail(function (err) {
                            deferred.reject(err);
                        });
                    }).fail(function(err) {
                        deferred.reject(err);
                    });
                }).fail(function (err) {
                    deferred.reject(err);
                });
            }).fail(function (err) {
                deferred.reject(err);
            });
        }).fail(function (err) {
            deferred.reject(err);
        });
            
        return deferred.promise();
      };

      // Move a file to a new location
      // -------

      this.move = function(branch, path, newPath) {
        var deferred = new $.Deferred();
            
        updateTree(branch).done(function (latestCommit) {
            that.getTree(latestCommit+"?recursive=true").done(function (tree) {
                // Update Tree
                _.each(tree, function(ref) {
                    if (ref.path === path) ref.path = newPath;
                    if (ref.type === "tree") delete ref.sha;
                });

                that.postTree(tree).done(function (rootTree) {
                    that.commit(latestCommit, rootTree, 'Deleted '+path).done(function (commit) {
                        that.updateHead(branch, commit).done(function (res) {
                            deferred.resolve(res);
                        }).fail(function (err) {
                            deferred.reject(err);
                        });
                    });
                }).fail(function(err) {
                    deferred.reject(err);
                });
            }).fail(function (err) {
                deferred.reject(err);
            });
        }).fail(function(err) {
            deferred.reject(err);
        });
        
        return deferred.promise();
      };

      // Write file contents to a given branch and path
      // -------

      this.write = function(branch, path, content, message) {
        var deferred = new $.Deferred();
          
        updateTree(branch).done(function (latestCommit) {
          that.postBlob(content).done(function (blob) {
            that.updateTree(latestCommit, path, blob).done(function (tree) {
              that.commit(latestCommit, tree, message).done(function (commit) {
                return that.updateHead(branch, commit);
              }).fail(function (err) {
                 deferred.reject(err);
              });
            }).fail(function (err) {
               deferred.reject(err);
            });
          }).fail(function (err) {
             deferred.reject(err);
          });
        }).fail(function (err) {
           deferred.reject(err);
        });
          
        return deferred.promise();
      };
    };

    // Gists API
    // =======
    Github.prototype.Gist = function(options) {
      var id = options.id;
      var gistPath = "/gists/"+id;

      // Read the gist
      // --------

      this.read = function() {
        return Github.prototype._request("GET", gistPath, null);
      };

      // Create the gist
      // --------
      // {
      //  "description": "the description for this gist",
      //    "public": true,
      //    "files": {
      //      "file1.txt": {
      //        "content": "String file contents"
      //      }
      //    }
      // }
      
      this.create = function(options){
        return Github.prototype._request("POST","/gists", options);
      };

      // Delete the gist
      // --------

      this.delete = function() {
        return Github.prototype._request("DELETE", gistPath, null);
      };

      // Fork a gist
      // --------

      this.fork = function() {
        return Github.prototype._request("POST", gistPath+"/fork", null);
      };

      // Update a gist with the new stuff
      // --------

      this.update = function(options) {
        return Github.prototype._request("PATCH", gistPath, options);
      };
    };

    // Top Level API
    // -------
    Github.prototype.getRepo = function(user, repo) {
      return new Github.Repository({user: user, name: repo});
    };

    Github.prototype.getUser = function() {
      return new Github.User();
    };

    Github.prototype.getGist = function(id) {
      return new Github.Gist({id: id});
    };
    
    Github.prototype = Object.create(Github.prototype);
    Github.prototype.constructor = Github;
      
    exports.Github = Github;
  });