/*global $, _ , getDominantColor*/
var wallPie = (function() {
  var API, getTrackSummary, getAnalysisForSongSearch, easeInQuad, slimAnalysis, processCoverArt, drawFromAnalysis, fetchAnalysisForTracks, fetchAlbum, reportError, testData,
      canvas      = document.getElementById('canvas'),
      $canvas     = $(canvas),
      context     = canvas.getContext('2d');

  API = (function() {
    var credentials = {
      key   : "KMCPV4Y7WGLVVSRNQ",
      cKey  : "9a72cdd35b60dd23fb5bf34091ac7af6"
    };

    return {
      fetch: function(endpoint, parameters, json_params) {
        parameters = $.param(_.extend(parameters, {
          api_key : credentials.key,
          format  : 'json'
        }));

        json_params = _.extend(json_params || {} , {
          url: "http://developer.echonest.com/api/v4/" + endpoint + '?' + parameters
        });

        return $.ajax(json_params);
      }
    };
  })();


  reportError = function(message, data) {
    window.console.warn(message, data);
  };

  getTrackSummary = function(analysis_url, callback) {
    $.ajax({
      url: '/proxy?url=' + encodeURIComponent(analysis_url),
      dataType  : "json"
    }).success(function(data) {
      callback(data);
    }).fail(function(error) {
      reportError('Error fetching analyis data for a track', error);
      callback(false);
    });
  };

  getAnalysisForSongSearch = function(songData, callback) {
    API.fetch('song/search', songData).success(function(data) {
      if (data.response.songs[0]) {
        getTrackSummary(data.response.songs[0].audio_summary.analysis_url, callback);
      } else {
        reportError('Segment data can\'t be found for ' + songData.title + '"');
        callback(false);
      }
    }).fail(function(error) {
      reportError('Looking up the song "' + songData.title + '" didn\'t go so well', error);
      callback(false);
    });
  };

  easeInQuad =function (t, b, c, d) {
    return c*(t/=d)*t + b;
  };

  slimAnalysis = function(data, slimFactor) {
    return _.filter(data, function() { return Math.random() < 1/slimFactor; });
  };

  processCoverArt = function(image_url, callback) {
    if (image_url.indexOf('/') !== 0) {
      image_url = '/proxy?url=' + image_url;
    }

    var el = $('<img>').attr({
      src       : image_url
    });
    el.appendTo('body');
    el.load(function() {
      el.attr({
        width : el.width(),
        height: el.height()
      });
      callback(getDominantColor(el));
      el.remove();
    });
  };

  drawFromAnalysis = function(analysis, artist, title, options) {
    console.info("Starting to draw wih " + analysis.length + " track's analysis data");
    options = _.extend({}, {
      // used to multiply/divide certain values:
      // - scaling the canvas down after rendering (for preview purposes)
      // - scaling up font and whitespace size as it appears in the preview
      // This doesn't work as expected yet due to some stupidity, will fix
      scaleFactor       : 8,
      // Reduces the amount of data with this factor
      slimFactor        : 2,
      // Space in px between the edge of the canvas/paper & circle
      whitespace        : 40,
      // space in px on the inside
      innerDiameter     : 0,
      color             : null,
      // Minimum opacity of every line in the circle
      minimumOpacity    : 0.3,
      // Wether we should use a "light" or "dark" background.
      colorScheme        : 'light',
      // Distance of the text from the circle
      textDistance       : 30,
      // Speaks for itself, I'm using Neutra locally.
      font               : 'Helvetica Neue'
    }, options);

    var segmentBorders    = _.map(analysis, function(a) {return a.length / options.slimFactor; }),
        segments          = slimAnalysis(_.flatten(analysis), options.slimFactor),
        degreesPerSegment = 360 / segments.length,
        whitespace        = options.scaleFactor * options.whitespace,
        innerDiameter     = options.scaleFactor * options.innerDiameter,
        innerRadius       = options.scaleFactor * (options.innerDiameter / 2),
        maxWidth          = $canvas.width() < $canvas.height() ? $canvas.width() : $canvas.height(),
        center            = [$canvas.width()/2, $canvas.height()/2],
        waveFormDiameter  = (maxWidth/2) - innerRadius - whitespace,
        textDistance      = (options.textDistance * options.scaleFactor) + innerRadius + waveFormDiameter,
        toRadian          = function(deg) { return deg * (Math.PI/180); },
        scaledSize        = [$canvas.width() / options.scaleFactor, $canvas.height() / options.scaleFactor],
        revOpacity        = function(color, opacity) { return color/255;},
        textColor         = options.colorScheme === "dark" ? '#ffffff' : '#464c3e';

    if (options.colorScheme === "dark") {
      context.setFillColor('#000000');
      context.fillRect(0,0, $canvas.width(), $canvas.height());
    }

    context.save();
    context.translate(center[0], center[1]);
    context.rotate(toRadian(180));
    context.scale(1/options.scaleFactor);

    _.each(segments, function(segmentRange) {
      var x = 0,
          y = 0,
          values = segmentRange.pitches.reverse(),
          pixelsPerNote = waveFormDiameter/(segmentRange.pitches.length - 1),
          i, opacity;
      y = innerRadius;
      for (i = 0; i < values.length + 1; i++) {
        // This should be relative from the distance from the center, not i
        // that way it will work nicely when there is an inner diameter set
        opacity = easeInQuad(i, options.minimumOpacity, values[i], values.length) * 1;
        if (i === 0 ) { opacity = 0.001;}
        opacity = opacity * values[i];
        context.setFillColor(
          revOpacity(options.color[0], opacity),
          revOpacity(options.color[1], opacity),
          revOpacity(options.color[2], opacity),
          opacity
        );
        context.moveTo(x, y);

        context.fillRect(x, y, options.scaleFactor/2, pixelsPerNote);
        y = (i * pixelsPerNote) + innerRadius;
      }

      context.rotate(toRadian(degreesPerSegment));
    });

    // Draw Borders
    _.each(segmentBorders, function(border) {
      context.rotate(toRadian(border * degreesPerSegment));

      context.setFillColor($canvas.css('background-color'));
      context.moveTo(0, 0);
      context.fillRect(0, innerRadius, options.scaleFactor, waveFormDiameter );
    });

    // Draw Text
    context.restore();
    context.translate(center[0], center[1]);

    context.setFillColor(textColor);
    context.textAlign = "center";

    if (analysis.length === 0) {

      context.font = 'normal 100 ' + 25*options.scaleFactor + "px " + options.font;
      context.fillText("Oops, no data", 0, 0);
    } else {
      context.font = 'normal 600 ' + 50*options.scaleFactor + "px " + options.font;
      context.textBaseline = 'alphabetic';
      context.fillText(artist.toUpperCase(), 0, -textDistance);

      context.font = 'normal 100 ' + 25*options.scaleFactor + "px " + options.font;
      context.textBaseline = 'top';
      context.fillText(title.toUpperCase(), 0, textDistance);
    }

    $canvas.css({
      width : scaledSize[0],
      height: scaledSize[1]
    });

    // Deleting
    $('body').append($('<img>').attr({
      src     : canvas.toDataURL(),
      width   : scaledSize[0],
      height  : scaledSize[1],
      'class' : 'canvas'
    }));

    $canvas.remove();
  };

  fetchAnalysisForTracks = function (artist, tracks, callback) {
    var analysis_urls = [],
        itemsAnalysed = 0,
        fetchAnalysis,
        i;

    fetchAnalysis = function(trackNo) {
       getAnalysisForSongSearch({
        artist: artist,
        title : tracks[trackNo],
        results: 1,
        bucket  : "audio_summary"
      }, function(data) {
        if (data) {
          analysis_urls.push(data.segments);
        }
        itemsAnalysed ++;

        if (tracks.length === itemsAnalysed) {
          callback(analysis_urls);

          if (analysis_urls.length !== tracks.length) {
            reportError(tracks.length + ' tracks expected, but could only fetch data for ' + analysis_urls.length);
          }
        }
      });
    };

    console.info('Starting to fetch each track\'s analysis url from the Echonest…');
    for (i = 0; i < tracks.length; i++) {
      fetchAnalysis(i);
    }
  };

  fetchAlbum = function(artist, albumTitle, trackTitles, coverart, options) {
    // TODO: Automatically fetch track titles and cover art
    processCoverArt(coverart, function(colors) {
      fetchAnalysisForTracks(artist, trackTitles, function(data) {
        options.color = colors;
        drawFromAnalysis(data, artist, albumTitle, {color: colors});
      });
    });
  };

  // Demo function for quickly rendering test data (offline)
  testData = function(options) {
    processCoverArt("/assets/images/Ok computer.png", function(colors) {
      options.color = colors;
      $.get('/assets/test.json').success(function(data) {
        drawFromAnalysis(data, "Radiohead", "OK Computer", options);
      });
    });
  };

  return {
    fetchAlbum: fetchAlbum,
    test: testData
  };
})();
