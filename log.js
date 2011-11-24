

var global_request_id = 0;

exports.create = function () {

  var id = global_request_id++;

  var format_args = (function () {
    var inspect = require('util').inspect;
    return function (args) {
      return Array.prototype.slice.call(args).map(inspect).join(' ')
    };
  })();
  var log_raw = (function () {

    function lpad(string, char, length) {
      string = string.toString();
      while (string.length < length) {
        string = char + string;
      };
      return string;
    };
    function lpadz(string, length) {
      return lpad(string, '0', length);
    };

    function timestamp() {
      var now = new Date();
      var Y = now.getUTCFullYear();
      var m = now.getUTCMonth() + 1;
      var d = now.getUTCDate();
      var H = now.getUTCHours();
      var M = now.getUTCMinutes();
      var S = now.getUTCSeconds();
      var ms = now.getUTCMilliseconds();
      return (Y
        + '-' + lpadz(m, 2)
        + '-' + lpadz(d, 2)
        + ' ' + lpadz(H, 2)
        + ':' + lpadz(M, 2)
        + ':' + lpadz(S, 2)
        + '.' + lpadz(ms, 3)
      );
      //return sprintf("%d%02d%02d:%02d%02d:%02d%03d", Y, m, d, H, M, S, ms);
    };
    return function (message, color) {
      //var ts = +new Date;
      var ts = timestamp();
      //var prefix = [id, ts].join(' ') + ' ';
      //var prefix = [id, req.socket.remoteAddress, ts].join(' ');
      var prefix = [id, ts].join(' ');
      console.log(
          '[35m' + prefix + '[m'
          + message
            //.replace(/\n/g, '\n' + prefix)
            .replace(/^|\n/g, '\n' + '[35m' + id + '[m ' + (color||''))
          + '[m'
      );
    };
  })();

  return {
    format: function () {
      return log_raw(format_args(arguments));
    },
    raw: log_raw
  };
};
