var API, wallPie;

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

/*global $, _ , createPalette*/
wallPie = (function() {
  var getAnalysisForSongSearch, extractColorFromCover, drawFromAnalysis, fetchAnalysisForTracks, fetchAlbum, reportError, testData, echoNest, lastfm, fetchAlbumInfo, reportStatus, helpers,

    canvas      = document.getElementById('canvas'),
    $canvas     = $(canvas),
    context     = canvas.getContext('2d');


  reportError = function(message, data) {
    window.console.warn(message, data);
  };

  reportStatus = function(message, data) {
    window.console.info(message, data);
  };

  /**
   * Requests the Echonest metadata about the track, finds the audio analysis url, and fetches that.
   * @param  {Object}   options  Parameters used for the echoNest search, should contain
   *                             artist, title, bucket (audio summary).
   * @param  {Function} callback
   * @return {Object}            contents of echonest's audio analysis containing:
   *                             bars, beats, meta, sections, segments (what we need), tatums and track
   */
  getAnalysisForSongSearch = function(options, callback) {
    echoNest.fetch('song/search', options).success(function(data) {
      if (data.response.songs[0]) {
        $.getJSON(data.response.songs[0].audio_summary.analysis_url)
          .done(callback)
          .fail(function(error) {
            reportError('Error fetching analyis data for a track', error);
            callback(false);
          });

      } else {
        reportError('Segment data can\'t be found for ' + options.title + '"');
        callback(false);
      }
    }).fail(function(error) {
      reportError('Looking up the song "' + options.title + '" didn\'t go so well', error);
      callback(false);
    });
  };

  /**
   * Downloads an image and analyses it for a dominant colour using canvas and colorThief
   * Assumes that colorThief's `createPallette` is a global
   *
   * @param  {String}   image_url url to the artwork. This must be a local file
   *                              due to cross-domain security reasons
   * @param  {Function} callback
   * @return {Array}             [red, green blue]
   */
  extractCoverColor = function(image_url, colorScheme, callback) {
    var el, findRightColor;

    /**
     * Returns the first colour that passes a contrast threshold test
     * The score is a value between 0-1 (1 being max contrast), it is
     * calculated by taking each colour channel's difference with the
     * background  of each color with the background
     * @param  {Array}   colors     list of colours in [r,g,b] format
     *                              for example one that comes from color-thief
     * @param  {Number}  threshhold A contrast threshold
     * @param  {Boolean} isDarkBg   Wether the canvas' background is dark
     * @return {Array}              Single color in [r,g,b] format
     */
    findRightColor = function(colors, threshhold, isDarkBg) {
      var bgModifier = 255*3;

      threshhold = threshhold || 0.2;
      return _.filter(colors, function(color) {
        var maxContrast = 255*3,
            score = (bgModifier - (color[0]+color[1]+color[2]))/(maxContrast);

        if (isDarkBg) {
          score = 0 - score;
        }

        if (score > threshhold) {
          return color;
        }
      })[0] || colors[0];

    };

    el = $('<img>').attr({
      src       : image_url
    });

    el.appendTo('body');
    el.load(function() {
      el.attr({
        width : el.width(),
        height: el.height()
      });

      var colorPalette = createPalette(el, 7),
          isDarkBg = colorScheme && colorScheme === "dark",
          chosenColor = findRightColor(colorPalette, null, isDarkBg);

      callback(chosenColor);
      el.remove();
    });
  };

  helpers = {
    toRadian:  function(deg) {
      return deg * (Math.PI/180);
    },
    easeInQuad: function (t, b, c, d) {
      return c*(t/=d)*t + b;
    },
    slimAnalysis: function(trackData, slimFactor) {
      if (slimFactor !== 1) { // AKA none;
        return _.map(trackData, function(track) {
          return _.filter(track, function() { return Math.random() < 1/slimFactor; });
        });
      } else {
        return trackData;
      }
    },
    revOpacity : function(color, opacity, colorScheme) {
      if (colorScheme === "dark") {
        return (color/255) * opacity;
      } else {
        return (((255 - color) * (1-opacity)) + color)/255;
      }
    },
    /**
     * Takes segment data from the Echonest and transforms it into an array
     * with just the segments per track. Leaving out any other metadata
     * that the Echonest might add in the meantime.
     *
     * @param  {Object} data output of fetchAnalysis
     * @return {Object}      data used for drawing (for drawFromAnalysis)
     */
    flattenData: function(trackData) {
      return _.map(trackData, function(echoNestTrackData) {
        return _.pluck(echoNestTrackData, 'pitches');
      });
    }
  };

  // TODO: sort arguments to make more sense
  var drawDataPoint = function(context, value, color, colorScheme, x, y, scaleFactor, height) {
    context.setFillColor(
      // TODO: Do I really still need this? can't I use normal opacity?
      helpers.revOpacity(color[0], value, colorScheme),
      helpers.revOpacity(color[1], value, colorScheme),
      helpers.revOpacity(color[2], value, colorScheme),
      1
    );

    // TODO: Please, not scalefactor in here :(
    context.fillRect(x, y, scaleFactor/2, height);
  };

  drawSegment = function(context, segmentRange, color, colorScheme, innerRadius, waveFormDiameter, scaleFactor) {
    var y = innerRadius || 0,
        frequencyPoint = segmentRange.reverse(),
        pixelsPerNote = waveFormDiameter/(segmentRange.length - 1),
        i;

    // Draw every datapoint to the canvas, with the following color. Then move up to draw the next one
    for (i = 0; i < frequencyPoint.length; i++) {
      context.moveTo(0, y);
      drawDataPoint(context, frequencyPoint[i], color, colorScheme, 0, y, scaleFactor, pixelsPerNote);
      y = (i * pixelsPerNote) + innerRadius;
    }
  };

  var decorateCanvas = function(context, artist, title, color, font, fontSizeTop, fontSizeBottom, offset) {
    context.setFillColor(color);
    context.textAlign = "center";

    context.font = 'normal 600 ' + fontSizeTop + "px " + font;
    context.textBaseline = 'alphabetic';
    context.fillText(artist.toUpperCase(), 0, -offset);

    context.font = 'normal 100 ' + fontSizeBottom + "px " + font;
    context.textBaseline = 'top';
    context.fillText(title.toUpperCase(), 0, offset);
  };

  /**
   * almost-not so bloated function which draws the actual thing.
   *
   * @param  {Array} analysis  frequency/pitch data for every track, per sample/segments.
   *                           each value must be between 0-1;
   *
   * @param  {String} artist   Artist name for drawing
   * @param  {String} title    Album title for drawing
   * @param  {Object} options  see readme, or the actual function, I dunno
   */
  drawFromAnalysis = function(analysis, artist, title, options) {
    if (analysis.length === 0) { trow('No data to analyse') }
    reportStatus("Starting to draw wih " + analysis.length + " track's analysis data");
    options = _.extend({
      // used to multiply/divide certain values:
      // - scaling the canvas down after rendering (for preview purposes)
      // - scaling up font and whitespace size as it appears in the preview
      // This doesn't work as expected yet due to some stupidity, will fix
      scaleFactor       : 8,
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

    var segmentBorders, segments, degreesPerSegment, whitespace, innerRadius, maxWidth, center, waveFormDiameter, textDistance, fontSizeTop, fontSizeBottom, scaledSize, textColor;

    // Calculate the number of segments per track, used to calculate when to draw track separators
    segmentBorders    = _.map(analysis, function(a) {return a.length;});
    // Converts the segment data into one array of items, no longer distinguishing between tracks.
    segments          = _.flatten(analysis, true);
    degreesPerSegment = 360 / segments.length;

    // Calculating units for the visualisation
    whitespace        = options.scaleFactor * options.whitespace;
    innerRadius       = options.scaleFactor * (options.innerDiameter / 2);
    fontSizeTop       = options.scaleFactor * (options.fontSizeTop);
    fontSizeBottom    = options.scaleFactor * (options.fontSizeBottom);

    maxWidth          = $canvas.width() < $canvas.height() ? $canvas.width() : $canvas.height();
    center            = [$canvas.width()/2, $canvas.height()/2];
    waveFormDiameter  = (maxWidth/2) - innerRadius - whitespace;
    textDistance      = (options.textDistance * options.scaleFactor) + innerRadius + waveFormDiameter;

    // Not sure what do do with this.
    scaledSize        = [$canvas.width() / options.scaleFactor, $canvas.height() / options.scaleFactor];
    textColor         = options.colorScheme === "dark" ? '#ffffff' : '#464c3e';

    if (options.colorScheme === "dark") {
      context.setFillColor('#000000');
      context.fillRect(0,0, $canvas.width(), $canvas.height());
    }

    // Start drawing
    context.save();
    context.translate(center[0], center[1]);
    context.rotate(helpers.toRadian(180));
    // context.scale(1/options.scaleFactor, 1/options.scaleFactor);

    _.each(segments, function(segmentRange) {
      drawSegment(context, segmentRange, options.color, options.colorScheme, innerRadius, waveFormDiameter, options.scaleFactor);

      context.rotate(helpers.toRadian(degreesPerSegment));
      // Ideally I'd draw separators here
    });

    // Draw Borders
    // TODO: Can I instead of rotating a full 360, maybe only rotate 350, and use the rest for separators?
    _.each(segmentBorders, function(border) {
      var borderColor = options.colorScheme === "dark" ? '#000000' : $canvas.css('background-color');
      context.rotate(helpers.toRadian(border * degreesPerSegment));

      context.setFillColor(borderColor);
      context.moveTo(0, 0);
      context.fillRect(0, innerRadius - 1, options.trackSeparatorSize * options.scaleFactor, waveFormDiameter+1 );
    });

    context.restore();
    context.translate(center[0], center[1]);

    // Draw Text
    decorateCanvas(context, artist, title, textColor, options.font, fontSizeTop, fontSizeBottom, textDistance);

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

  /**
   * Calls getAnalysisForSongSearch for every track in `tracks` and collects the output in an array
   *
   * @param  {String}   artist   artist name
   * @param  {Array}    tracks   array of track name strings
   * @param  {Function} callback
   * @return {Array}             array of echonest audio_summary data with one item per track
   */
  fetchAnalysisForTracks = function (artist, tracks, callback) {
    var trackSegments = [],
        itemsAnalysed = 0,
        fetchAnalysis,
        i;

    fetchAnalysis = function(trackName) {
       getAnalysisForSongSearch({
        artist: artist,
        title : trackName,
        results: 1,
        bucket  : "audio_summary"
      }, function(data) {
        if (data) {
          trackSegments.push(data.segments);
        }
        itemsAnalysed ++;

        if (tracks.length === itemsAnalysed) {
          callback(trackSegments);

          if (trackSegments.length !== tracks.length) {
            reportError(tracks.length + ' tracks expected, but could only fetch data for ' + trackSegments.length);
          }
        }
      });
    };

    reportStatus('Starting to fetch each track\'s analysis url from the Echonest…');
    for (i = 0; i < tracks.length; i++) {
      fetchAnalysis(tracks[i]);
    }
  };

  /**
   * Fetches album metadata from Last.fm. Returns an object containing
   * -  {String}  art     URL for artwork
   * -  {String}  artist  Artist name (correctly formatted)
   * -  {String}  title   Album title
   * -  {Array}   tracks  A list of track titles associated for this album
   *
   * @param  {String}   artist
   * @param  {String}   albumTitle
   * @param  {Function} callback
   * @return {Object}
   */
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
            art    : artwork['#text'],
            artist : data.album.artist,
            title  : data.album.name,
            tracks : _.pluck(data.album.tracks.track, 'name')
          });
        }
      }).fail(function(e) {
        reportError("seems something went wrong when fetching the album info", e);
      });
  };

  /**
   * This function basically starts everything off and passes data into callback hell.
   * The end result is that it's all drawn.
   *
   * @param  {String} artist
   * @param  {String} albumTitle
   * @param  {Object} options    see readme.md
   */
  fetchAlbum = function(artist, albumTitle, options) {
    echoNest = new API("http://developer.echonest.com/api/v4/", options.echonest_key);
    lastfm   = new API("http://ws.audioscrobbler.com/2.0/", options.lastfm_key);

    fetchAlbumInfo(artist, albumTitle, function(albumInfo) {
      var tracks = options.trackTitles || albumInfo.tracks;
      artist     = albumInfo.artist;
      albumTitle = albumInfo.title;

      if (albumInfo.art.indexOf('/') !== 0) {
        albumInfo.art = '/proxy?url=' + albumInfo.art;
      }

      extractCoverColor(albumInfo.art, options.colorScheme, function(colors) {
        fetchAnalysisForTracks(artist, tracks, function(data) {
          options.color = colors;
          data = helpers.flattenData(data);
          data = helpers.slimAnalysis(data, options.slimFactor);
          drawFromAnalysis(data, artist, albumTitle, options);
        });
      });
    });
  };

  // Demo function for quickly rendering test data (offline)
  testData = function(options) {
    extractCoverColor("/assets/images/Ok computer.png", options.colorScheme, function(colors) {
      options.color = colors;
      $.get('/assets/test.json').success(function(data) {
        data = helpers.flattenData(data);
        data = helpers.slimAnalysis(data, options.slimFactor);
        drawFromAnalysis(data, "Radiohead", "OK Computer", options);
      });
    });
  };

  return {
    fetchAlbum: fetchAlbum,
    test: testData
  };
})();
