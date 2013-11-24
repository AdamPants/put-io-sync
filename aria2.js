var _ = require('underscore');
var spawn = require('child_process').spawn;
var fs = require('fs');

module.exports = function Aria2(command, args) {
  var self = this;
  var downloadQueue = [];
  var gidIndex = 1;

  if (!args)
    args = [];

  this.gid = function() {
    var pad = '0000000000000000';
    return ((gidIndex++) + pad).substr(0, pad.length);
  }

  this.addUri = function addDownload(urls, localpath, options, associatedObject) {
    var gid = this.gid();
    if (!options) options = {};
    options.gid = gid;

    if (localpath) {
      var pathElements = localpath.split('/');
      options.out = pathElements.pop();
      options.dir = pathElements.join('/');
    }

    if (typeof urls === "string")
      urls = [ urls ];

    downloadQueue.push({
      urls: urls,
      localpath: localpath,
      options: options,
      associatedObject: associatedObject
    });

    return gid;
  }

  this.inputFileEntry = function inputFileEntry(download) {
    var result = download.urls.join(' ') + "\n";

    _.each(download.options, function(value, key) {
      result += "  " + key + "=" + value + "\n";
    });

    return result;
  };

  this.inputFile = function inputFile() {
    var result = ''
    _.each(downloadQueue, function(download) {
      result += self.inputFileEntry(download);
    });

    return result;
  };

  this.downloadForGID = function downloadForGID(shortGID) {
    return _.find(downloadQueue, function(download) {
      return download.options.gid.substr(0, shortGID.length) == shortGID;
    });
  }

  this.gidForShortGID = function gidForShortGID(shortGID) {
    return this.downloadForGID(shortGID).options.gid;
  }

  this.parseOut = function parseOut(out) {
    var result = {};
    out.replace(/(^|\n)([0-9]{6})\|([^\s\|]+)/mg, function(m1, m2, gid, status) {
      result[self.gidForShortGID(gid)] = (status == 'OK');
    });
    return result;
  };

  this.exec = function(callback) {
    var infilepath = '/tmp/urls';
    fs.writeFile(infilepath, this.inputFile(), function (err) {
      if (err) {
        return console.log(err);
      }
      var out = '';
      args.push('-i ' + infilepath);
      var ariaProcess = spawn(command, args);
      ariaProcess.stdout.on('data', function(data) {
        out += data.toString();
      });
      ariaProcess.on('close', function(code) {
        var downloadStatus = self.parseOut(out);
        var complete = [];
        var incomplete = [];
        _.each(downloadStatus, function(status, gid) {
          if (status) {
            complete.push(self.downloadForGID(gid));
          } else {
            incomplete.push(self.downloadForGID(gid));
          }
        });

        if (callback)
          callback(complete, incomplete);
      });
      ariaProcess.stdin.end();
    });
  }
}