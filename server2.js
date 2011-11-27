#! /usr/bin/env node

var port = 8000;

var root_path = (function _init_root_path () {
  var fs = require('fs');
  var path = require('path');
  return path.dirname(fs.realpathSync(__filename));
})();

// TODO this has to be "per user / account"
// TODO this has to be user modifiable
var path = require('path');

// all keys are `echo -n '{name}' | sha1sum | awk '{print$1}'`
// TODO spec.json, desc
var primitive_program_table = {
  "/48f6c938093e69dfbcb4318cb951dcfccf38bb77": {
    "name": "unpack zip",
    "command": path.join(root_path, 'components', 'unpack-zip', 'index')
  },
  "/7f3be10a123829d7cdd1b7a8e76b0dcf20a7ea45": {
    "name": "espresso build",
    "command": path.join(root_path, 'components', 'espresso-build', 'index')
  },
  "/2051e356315369af9de36fab804f6e83175b3828": {
    "name": "pack zip",
    "command": path.join(root_path, 'components', 'pack-zip', 'index')
  },
  "/9fa4a451844a412af7dc7655863c3a245744aad3": {
    "name": "package PhoneGap/Android",
    "command": path.join(root_path, 'components', 'package-apk', 'index')
  },
  "/2af293fe70e5be472f10b4165467ba05e5831380": {
    "name": "sendsrc",
    "command": path.join(root_path, 'components', 'sendsrc', 'index')
  },
  "/test": {
    "name": "primitive test program",
    "command": path.join(root_path, 'server.sh')
  }
};
var program_table = {
  "/dec438b22939a4c1d74bf070aa93e9745b913d82": {
    "name": "espresso build Android package",
    "program": [
      // TODO? "upload"
      "/48f6c938093e69dfbcb4318cb951dcfccf38bb77", // unpack zip
      "/7f3be10a123829d7cdd1b7a8e76b0dcf20a7ea45", // espresso build
      "/9fa4a451844a412af7dc7655863c3a245744aad3", // package PhoneGap/Android
      "/2af293fe70e5be472f10b4165467ba05e5831380", // sendsrc
      // TODO? "download"
    ]
  },
  "test": {
    "name": "test program",
    "program": [
      "/dec438b22939a4c1d74bf070aa93e9745b913d82",
      "/test finish"
    ]
  },
  "/test finish": {
    "name": "test finish program",
    "program": [
      "/invalid-program"
    ]
  }
  
};

// TODO
//  prologue (create temporary directory, upload files, setup environment,
//            chroot, etc.)
//  agenda
//  epilogue (send response, cleanup; inverse of prologue)

var handle_externally = (function _init_handle_externally () {

  var spawn = require('child_process').spawn;
  var path = require('path');

  return function _impl_handle_externally (req, res, options, callback) {

    var log = options.log;

    if (req.method === 'POST') {

      var env = JSON.parse(JSON.stringify(options.env)); // copy

      // the external handler may run a long time... don't time out.
      res.socket.setTimeout(0 * 60 * 1000);

      var agenda = [ req.url ];

      (function _execute_loop () {
        log.format('agenda', agenda)
        if (agenda.length > 0) {
          // pop head
          var id = agenda[0];
          agenda = agenda.slice(1);

          if (id in primitive_program_table) {
            var program = primitive_program_table[id];

            log.format('execute primitive program', program.name);

            var child = (function _init_child () {
              var command = program.command;
              // TODO merge some optionally predefined program.envp
              var argv = program.argv || [];
              var spawn_options = {
                cwd: options.cwd || root_path,
                env: env
              };

              log.format('spawn', { command: command, options: spawn_options });

              return spawn(command, argv, spawn_options);
            })();

            // TODO minimal buffering
            var data = [];

            child.stdout.on('data', function _cb_buffer_res_chunk (chunk) {
              data.push(chunk);
            });
            
            child.stderr.on('data', function _cb_write_child_stderr (chunk) {
              log.raw(chunk.toString(), '[31m');
            });
            
            child.on('exit', function _cb_child_exited (code) {
              log.format('child', 'exit', code);
              if (code === 0) {
                if (agenda.length === 0) {
                  // TODO do we have a use case to not generate the whole HTTP
                  // response?
                  data.forEach(function _cb_write_res_chunks (chunk) {
                    res.socket.write(chunk);
                  });
                  res.socket.end();
                  callback(); // TODO ok, no error
                } else {
                  // TODO write logfiles?
                  data.forEach(function _cb_write_intermediate_chunks (chunk) {
                    log.raw(chunk.toString(), '[33m');
                  });
                  // continue
                  process.nextTick(_execute_loop);
                };
              } else {
                res.writeHead(500, {
                  'Content-Length': 0
                });
                res.end();
                callback(); // TODO error
              };
            });

          } else if (id in program_table) {
            var sub = program_table[id];
            log.format('schedule program', sub.name,
                '=\n' + require('util').inspect(sub.program));
            // reschedule
            agenda = sub.program.concat(agenda);
            process.nextTick(_execute_loop);
          } else {
            // TODO 404 when it's the first?
            log.raw('program not found: ' + JSON.stringify(id), '[31;1m');
            res.writeHead(500, {
              'Content-Length': 0
            });
            res.end();
            callback();
          };
        } else {
          log.raw('agenda is empty', '[31;1m');
          res.writeHead(500, {
            'Content-Length': 0
          });
          res.end();
          callback(); // TODO error
        };
      })();
    } else {
      log.raw('Method not allowed', '[31;1m');
      res.writeHead(405, {
        'Content-Length': 0
      });
      res.end();
      callback(); // TODO error
    };
  };
})();


var mktempdir = (function _init_mktempdir () {
  var uuid = require('node-uuid');
  var fs = require('fs');
  var path = require('path');
  return function _mktempdir (callback) {
    // TODO portable path
    var dirname = path.join('/tmp', uuid());
    var mode = '0700'
    fs.mkdir(dirname, mode, function (err) {
      // TODO cycle
      callback(err, dirname);
    });
  };
})();

var rmfR = (function _init_rmfR () {
  var fs = require('fs');
  var path = require('path');
  return function _rmfR (name, callback) {
    fs.stat(name, function(err, stat) {
      if (err) {
        console.error('stat Error', err);
      };
      if (stat.isFile()) {
        fs.unlink(name, function (err) {
          console.log('unlink', name, err);
          callback(null);
        });
      } else {
        fs.readdir(name, function (err, files) {
          if (err) {
            console.error('readdir Error', err);
            callback(null);
          } else {
            (function _rec () {
              if (files.length > 0) {
                _rmfR(path.join(name, files.pop()), _rec);
              } else {
                fs.rmdir(name, function (err) {
                  console.log('rmdir', name, err);
                  callback(null);
                });
              };
            })();
          };
        });
      };
    });
  };
})();

var listener = (function _init_listener () {
  
  var IncomingForm = require('formidable').IncomingForm;
  var Logger = require('./log');

  return function _impl_listener (req, res) {
    var log = Logger.create();

    log.raw([req.method, req.url, 'HTTP/' + req.httpVersion].join(' '));
    log.format(req.headers);
    var re = new RegExp('^multipart/form-data(?:;|$)');
    if (re.test(req.headers['content-type'])) {
      var form = new IncomingForm();

      form.parse(req, function(err, fields, files) {

        (function _scope_pretty_print_form () {
          var pretty = {};
          Object.keys(fields).forEach(function _cb_cpy_fields (key) {
            pretty[key] = fields[key];
          });
          Object.keys(files).forEach(function _cb_cpy_partial_files (key) {
            pretty[key] = {};
            [ 'name', 'size', 'type', 'path'
            ].forEach(function _cb_cpy_some_file_props (property) {
              pretty[key][property] = files[key][property];
            });
          });
          log.format(pretty);
        })();

        // TODO whitelist fields and files?
        var env = {};
        Object.keys(fields).forEach(function _cb_export_fields (key) {
          env['TEXT_' + key] = fields[key];
        });
        Object.keys(files).forEach(function _cb_export_files (key) {
          env['FILE_' + key] = files[key].path;
          env['FILE_' + key + '_SIZE'] = files[key].size;
          env['FILE_' + key + '_TYPE'] = files[key].type;
        });

        mktempdir(function (err, tempdir_path) {
          if (err) {
            log.raw('mktempdir err:' + err, '[31;1m');
            res.writeHead(500, {
              'Content-Length': 0
            });
            res.end();
          } else {
            log.format('tempdir_path', tempdir_path);

            var options = {
              log: log,
              env: env,
              cwd: tempdir_path
            };
            handle_externally(req, res, options, function _cb_form_cleanup () {
              var fs = require('fs');
              Object.keys(files).forEach(function _cb_unlink_files (key) {
                var file = files[key];
                fs.unlink(file.path, function _cb_file_unlinked (exn) {
                  log.format('unlink', file.path, exn);
                });
              });
              rmfR(tempdir_path, function (err) {
                log.format('rm -fR', tempdir_path, err);
              });
            });
          };
        });
      });

    } else {
      var options = {
        log: log,
        env: {}
      };
      handle_externally(req, res, options, function _cb_nop () {});
    };
  };
})();

(function _scope_setup_https_server () {
  var https = require('https');
  var fs = require('fs');
  var path = require('path');

  var keys_path = path.join(root_path, 'test', 'fixtures', 'keys');

  var key_path = path.join(keys_path, 'agent2-key.pem');
  var cert_path = path.join(keys_path, 'agent2-cert.pem');

  console.log('key:', key_path);
  console.log('cert:', cert_path);

  var options = {
    key: fs.readFileSync(key_path),
    cert: fs.readFileSync(cert_path)
  };

  https.createServer(options, listener).listen(port, function _cb_motd () {
    console.log('Serving HTTPS on 0.0.0.0 port', port);
  });
})();

(function _scope_setup_suicide_facility () {
  process.on('SIGTERM', function _cb_sigterm () {
    console.log('Got SIGTERM ==> shutting down...');
    process.exit(0);
  });
  var fs = require('fs');
  var Inotify = require('inotify').Inotify;
  var inotify = new Inotify();
  inotify.addWatch({
    path: fs.realpathSync(__filename), // TODO all the files
    watch_for: Inotify.IN_ATTRIB
             | Inotify.IN_DELETE_SELF
             | Inotify.IN_MODIFY
             | Inotify.IN_MOVE_SELF
             ,
    callback: function _cb_hara_kiri (event) {
      process.kill(process.pid, 'SIGTERM');
    }
  });
})();
