## GitHubAccess

A [Brackets](https://github.com/adobe/brackets) extension that allows you to clone any Github repo to your local Filesystem.

### How To Use
Press Ctrl-Alt-G (Mac: Cmd-Alt-G) to open the login Dialog.

### Credits
This extension uses the following open source components:

* [octokit.js](https://github.com/philschatz/octokit.js) - An Unofficial client for the Github API using CommonJS Promises. Intended for the browser or as a NodeJS package
* [Lo-Dash](http://lodash.com/) - A utility library delivering consistency, customization, performance, & extras.
* [typeahead.js](https://github.com/twitter/typeahead.js) - a fast and fully-featured autocomplete library [http://twitter.github.com/typeahead.js/](http://twitter.github.com/typeahead.js/)

####Version

#####0.3
* Add Binary files Handling
* move Data handling to a Node process
* include lodash in Node process
* compress css
* Add twitter typeahead for repository autocomplete

#####0.2
* Update to work with brackets Sprint 38 and onwards
* Use octokit.js
* Change to Oauth token authentication
* Drop deprecated FileSystem Api
