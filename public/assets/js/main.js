/*global $, _ , createPalette*/
var wallPie = (function() {
  var API, getTrackSummary, getAnalysisForSongSearch, easeInQuad, slimAnalysis, processCoverArt, drawFromAnalysis, fetchAnalysisForTracks, fetchAlbum, reportError, testData, echoNest, lastfm, fetchAlbumInfo, reportStatus,
      canvas      = document.getElementById('canvas'),
      $canvas     = $(canvas),
      context     = canvas.getContext('2d');

  API = function(base_url, key) {
    this.key      = key;
    this.base_url = base_url;
  };

  API.prototype.fetch = function (endpoint, parameters, json_params) {
    parameters = $.param(_.extend(parameters, {
      api_key : this.key,
      format  : 'json'
    }));

    json_params = _.extend(json_params || {} , {
      url: this.base_url + endpoint + '?' + parameters
    });

    return $.ajax(json_params);
  };

  reportError = function(message, data) {
    window.console.warn(message, data);
  };

  reportStatus = function(message, data) {
    window.console.info(message, data);
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
    echoNest.fetch('song/search', songData).success(function(data) {
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
    var el, findRightColor;

    /**
     * Returns the first colour that passes a contrast threshold test
     * The score is a value between 0-1 (1 being max contrast), it is
     * calculated by taking each colour channel's difference with the
     * background  of each color with the background
     * @param  {Array} colors      list of colours in [r,g,b] format
     *                             for example one that comes from color-thief
     * @param  {Number} threshhold A contrast threshold
     * @return {Array}             Single color in [r,g,b] format
     */
    findRightColor = function(colors, threshhold) {
      // TODO: background color, this should be dependent on
      // options.colorScheme, but I need to do some scope shifting
      // before that works as expected.
      var bgModifier = 255*3,
          darkbg     = options.colorScheme === "black";

      threshhold = threshhold || 0.2;
      return _.filter(colors, function(color) {
        var maxContrast = 255*3,
            score = (bgModifier - (color[0]+color[1]+color[2]))/(maxContrast);

        if (darkbg) {
          score = 0 - score;
        }

        if (score > threshhold) {
          return color;
        }
      })[0] || colors[0];

    };
    if (image_url.indexOf('/') !== 0) {
      image_url = '/proxy?url=' + image_url;
    }

    el = $('<img>').attr({
      src       : image_url
    });

    el.appendTo('body');
    el.load(function() {
      el.attr({
        width : el.width(),
        height: el.height()
      });

      callback(findRightColor(createPalette(el, 7)));
      el.remove();
    });
  };

  drawFromAnalysis = function(analysis, artist, title, options) {
    reportStatus("Starting to draw wih " + analysis.length + " track's analysis data");
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
      // Wether we should use a "light" or "dark" background.
      colorScheme        : 'light',
      // Distance of the text from the circle
      textDistance       : 35,
      // Speaks for itself, I'm using Neutra locally.
      font               : 'Helvetica Neue',
      fontSizeTop        : 50,
      fontSizeBottom     : 25,
      trackSeparatorSize : 1
    }, options);

    var segmentBorders    = _.map(analysis, function(a) {return a.length / options.slimFactor; }),
        segments          = slimAnalysis(_.flatten(analysis), options.slimFactor),
        degreesPerSegment = 360 / segments.length,
        whitespace        = options.scaleFactor * options.whitespace,
        innerRadius       = options.scaleFactor * (options.innerDiameter / 2),
        maxWidth          = $canvas.width() < $canvas.height() ? $canvas.width() : $canvas.height(),
        center            = [$canvas.width()/2, $canvas.height()/2],
        waveFormDiameter  = (maxWidth/2) - innerRadius - whitespace,
        textDistance      = (options.textDistance * options.scaleFactor) + innerRadius + waveFormDiameter,
        toRadian          = function(deg) { return deg * (Math.PI/180); },
        scaledSize        = [$canvas.width() / options.scaleFactor, $canvas.height() / options.scaleFactor],
        revOpacity        = function(color, opacity) {
          if (options.colorScheme === "dark") {
            return (color/255) * opacity;
          } else {
            return (((255 - color) * (1-opacity)) + color)/255;
          }
        },
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
          i;
      y = innerRadius;
      for (i = 0; i < values.length; i++) {
        context.setFillColor(
          revOpacity(options.color[0], values[i]),
          revOpacity(options.color[1], values[i]),
          revOpacity(options.color[2], values[i]),
          1
        );
        context.moveTo(x, y);

        context.fillRect(x, y, options.scaleFactor/2, pixelsPerNote);
        y = (i * pixelsPerNote) + innerRadius;
      }
      context.rotate(toRadian(degreesPerSegment));
    });

    // Draw Borders
    _.each(segmentBorders, function(border) {
      var borderColor = options.colorScheme === "dark" ? '#000000' : $canvas.css('background-color');
      context.rotate(toRadian(border * degreesPerSegment));

      context.setFillColor(borderColor);
      context.moveTo(0, 0);
      context.fillRect(0, innerRadius - 1, options.trackSeparatorSize * options.scaleFactor, waveFormDiameter+1 );
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
      context.font = 'normal 600 ' + options.fontSizeTop*options.scaleFactor + "px " + options.font;
      context.textBaseline = 'alphabetic';
      context.fillText(artist.toUpperCase(), 0, -textDistance);

      context.font = 'normal 100 ' + options.fontSizeBottom*options.scaleFactor + "px " + options.font;
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

    reportStatus('Starting to fetch each track\'s analysis url from the Echonest…');
    for (i = 0; i < tracks.length; i++) {
      fetchAnalysis(i);
    }
  };

  fetchAlbumInfo = function(artist, albumTitle, callback) {
    lastfm.fetch('', {
      method: 'album.getinfo',
      artist: artist, album: albumTitle
    }).success(function(data) {
        if (!data.album.tracks.track) {
          reportError("Last.fm is not returning any tracks for this album :(", data.album);
        } else {
          var artwork = data.album.image[3] || data.album.image[data.album.image.length-1];
          callback({
            artist : data.album.artist,
            tracks : _.pluck(data.album.tracks.track, 'name'),
            title  : data.album.name,
            art    : artwork['#text']
          });
        }
      }).fail(function(e) {
        reportError("seems something went wrong when fetching the album info", e);
      });
  };

  fetchAlbum = function(artist, albumTitle, options) {
    echoNest = new API("http://developer.echonest.com/api/v4/", options.echonest_key);
    lastfm   = new API("http://ws.audioscrobbler.com/2.0/", options.lastfm_key);

    fetchAlbumInfo(artist, albumTitle, function(albumInfo) {
      var tracks = options.trackTitles || albumInfo.tracks;
      artist     = albumInfo.artist;
      albumTitle = albumInfo.title;

      processCoverArt(albumInfo.art, function(colors) {
        fetchAnalysisForTracks(artist, tracks, function(data) {
          options.color = colors;
          drawFromAnalysis(data, artist, albumTitle, options);
        });
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
