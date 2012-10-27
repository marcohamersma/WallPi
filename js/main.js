(function() {
  var canvas    = document.getElementById('canvas');
  var context   = canvas.getContext('2d');

  var API = (function() {
    var credentials = {
      key   : "KMCPV4Y7WGLVVSRNQ",
      cKey  : "9a72cdd35b60dd23fb5bf34091ac7af6"
    };

    return {
      fetch: function(endpoint, parameters, callback, json_params) {
        parameters = $.param(_.extend(parameters, {
          api_key : credentials.key,
          format  : 'json'
        }));

        json_params = _.extend(json_params || {} , {
          url: "http://developer.echonest.com/api/v4/" + endpoint + '?' + parameters
        });

        $.ajax(json_params).success(function(data) {
          callback(data);
        });
      }
    };
  })();

  var getTrackSummary = function(analysis_url, callback) {
    $.ajax({
      url: analysis_url.replace('https://echonest-analysis.s3.amazonaws.com/', '/analysis/'),
      dataType  : "json"
    }).success(function(data) {
      callback(data);
    });
  };

  var getAnalysisForSongSearch = function(songData, callback) {
    API.fetch('song/search', songData, function(data) {
      getTrackSummary(data.response.songs[0].audio_summary.analysis_url, callback);
    });
  };

  var drawFromAnalysis = function(analysis) {
    console.log(analysis);
    var center = [$(canvas).width()/2, $(canvas).height()/2];
    var toRadian = function(deg) { return deg * (Math.PI/180); };
    var values;
    var waveFormDiameter = $(canvas).height()/2;
    var pixelsPerNote = Math.floor(waveFormDiameter/12);
    var randomNotes = function() {
        var output = [];
        for (var i = 12; i >= 0; i--) {
          output.push(Math.random());
        }
        return output;
      };

    context.translate(center[0], center[1]);
    for (var i = 0; i < 720; i++) {
      debugger;
      values = randomNotes();

      var x = 0;
      var y = 0;

      // context.beginPath();
      context.moveTo(x,0);
      for (var noteIndex = 0; noteIndex < 12; noteIndex++) {
        var color = Math.round(255*values[noteIndex]);
        context.setFillColor('rgb(' + color + ',' + color + ',' + color + ')');
        context.moveTo(x, y);

        context.fillRect(x, y, 1, pixelsPerNote);
        y = noteIndex * pixelsPerNote;
      }

      context.rotate(toRadian(0.5));

    };

    // _.each(analysis.segments, function(segmentRange) {
    //   console.log(segmentRange);
    // });
  }

  // getAnalysisForSongSearch({
  //   artist : "bjork",
  //   title  : "hyperballad",
  //   bucket  : "audio_summary",
  //   results : 1
  // }, function(data) {
  //   drawFromAnalysis(data);
  // });

  $.get('/test.json').success(drawFromAnalysis);

})();
