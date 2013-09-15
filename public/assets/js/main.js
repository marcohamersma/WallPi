/*global $, _ , createPalette*/
/*jshint browser:true */
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

wallPie = (function() {
  var helpers, extractCoverColor, drawDataPoint, drawSegment, decorateCanvas, draw,
      canvas      = document.getElementById('canvas'),
      $canvas     = $(canvas),
      context     = canvas.getContext('2d');

  helpers = {
    reportError: function(message, data) {
      window.console.warn(message, data);
    },
    reportStatus: function(message, data) {
      window.console.info(message, data);
    },
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
    // We need to simulate opacity on the colors, since especially in the center,
    // we're drawing over previous data a lot, it'd get super dense unless we faked it.
    revOpacity : function(color, opacity) {
      return (((255 - color) * (1-opacity)) + color)/255;
    },
    /**
     * Takes segment data from the Echonest and transforms it into an array
     * with just the segments per track. Leaving out any other metadata
     * that the Echonest might add in the meantime.
     *
     * @param  {Object} data output of fetchAnalysis
     * @return {Object}      data used for draw()
     */
    flattenData: function(trackData) {
      return _.map(trackData, function(echoNestTrackData) {
        return _.pluck(echoNestTrackData, 'pitches');
      });
    },
    segmentCount: function (trackData) {
      var count = 0;
      _.each(trackData, function(t) {
        count += t.length;
      });
      return count;
    }
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
  extractCoverColor = function(image_url, callback) {
    var el, findRightColor, colorPalette, chosenColor;

    /**
     * Returns the first colour that passes a contrast threshold test
     * The score is a value between 0-1 (1 being max contrast), it is
     * calculated by taking each colour channel's difference with the
     * background  of each color with the background
     * @param  {Array}   colors     list of colours in [r,g,b] format
     *                              for example one that comes from color-thief
     * @param  {Number}  threshhold A contrast threshold
     * @return {Array}              Single color in [r,g,b] format
     */
    findRightColor = function(colors, threshhold) {
      var bgModifier = 255*3;

      threshhold = threshhold || 0.2;
      return _.filter(colors, function(color) {
        var maxContrast = 255*3,
            score = (bgModifier - (color[0]+color[1]+color[2]))/(maxContrast);

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

      colorPalette = createPalette(el, 7);
      chosenColor  = findRightColor(colorPalette);
      el.remove();
      callback(chosenColor);
    });
  };

  drawDataPoint = function(context, value, color, y, width, height) {
    context.setFillColor(
      helpers.revOpacity(color[0], value),
      helpers.revOpacity(color[1], value),
      helpers.revOpacity(color[2], value),
      1
    );

    context.fillRect(0, y, width, height);
  };

  drawSegment = function(context, segmentRange, color, innerRadius, waveFormDiameter, scaleFactor) {
    var y = innerRadius || 0,
        frequencyPoints = segmentRange.reverse(),
        pixelsPerNote   = waveFormDiameter/(segmentRange.length - 1),
        segmentWidth    = scaleFactor / 2,
        i;

    // Draw every datapoint to the canvas, with the following color. Then move up to draw the next one
    for (i = 0; i < frequencyPoints.length; i++) {
      context.moveTo(0, y);
      drawDataPoint(context, frequencyPoints[i], color, y, segmentWidth, pixelsPerNote);
      y = (i * pixelsPerNote) + innerRadius;
    }
  };

  decorateCanvas = function(context, artist, title, color, font, fontSizeTop, fontSizeBottom, offset) {
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
  draw = function(analysis, artist, title, options) {
    if (analysis.length === 0) { trow('No data to analyse'); }

    helpers.reportStatus("Starting to draw wih " + analysis.length + " track's analysis data");
    options = _.extend({
      color                 : null,
      font                  : 'Helvetica Neue',
      fontSizeBottom        : 25,
      fontSizeTop           : 50,
      innerDiameter         : 0,
      scaleFactor           : 8,
      textColor             : '#464c3e',
      textDistance          : 35,
      trackSeparatorDegrees : 30,
      whitespace            : 40
    }, options);

    var segmentCount, degreesPerSegment, whitespace, innerRadius, maxWidth, center, waveFormDiameter, textDistance, fontSizeTop, fontSizeBottom, scaledSize, textColor;

    // Calculate the number of segments per track, used to calculate when to draw track separators
    segmentCount      = helpers.segmentCount(analysis);
    degreesPerSegment = (360 - options.trackSeparatorDegrees) / segmentCount;

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
    textColor         = this.options.textColor;

    // Start drawing
    context.save();
    context.translate(center[0], center[1]);
    context.rotate(helpers.toRadian(180));
    // context.scale(1/options.scaleFactor, 1/options.scaleFactor);

    _.each(analysis, function(trackData) {
      _.each(trackData, function(segmentRange) {
        drawSegment(context, segmentRange, options.color, innerRadius, waveFormDiameter, options.scaleFactor);

        context.rotate(helpers.toRadian(degreesPerSegment));
      });

      // Rotate the canvas a bit to separate different tracks
      context.rotate(helpers.toRadian(options.trackSeparatorDegrees / analysis.length));
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

  // Demo function for quickly rendering test data (offline)
  // var testData = function(options) {
  //   extractCoverColor("/assets/images/Ok computer.png", function(colors) {
  //     options.color = colors;
  //     $.get('/assets/test.json').success(function(data) {
  //       data = helpers.flattenData(data);
  //       data = helpers.slimAnalysis(data, options.slimFactor);
  //       draw(data, "Radiohead", "OK Computer", options);
  //     });
  //   });
  // };

  return {
    helpers: helpers,
    extractCoverColor: extractCoverColor,
    draw: draw
  };
})();
