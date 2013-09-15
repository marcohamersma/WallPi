/*global API, wallPie, _ */
window.pitchData = (function(){
  var helpers = wallPie.helpers,
      getAnalysisForSongSearch,
      fetchAnalysisForTracks,
      fetchAlbumInfo,
      echoNest,
      lastfm,
      initialize;

  initialize = function (options) {
    echoNest = new API("http://developer.echonest.com/api/v4/", options.echonest_key);
    lastfm   = new API("http://ws.audioscrobbler.com/2.0/", options.lastfm_key);
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
          helpers.reportError("Last.fm is not returning any tracks for this album :(", data.album);
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
        helpers.reportError("seems something went wrong when fetching the album info", e);
      });
  };


  /**
   * Requests the Echonest metadata about the track, finds the audio analysis url, and fetches that.
   * @param  {Object}   options  Parameters used for the echoNest search, should contain
   *                             artist, title, bucket (audio summary).
   * @param  {Function} callback
   * @return {Object}            contents of echonest's audio analysis containing:
   *                             bars, beats, meta, sections, segments (what we need), tatums and track
   */
  getAnalysisForSongSearch = function(artist, title, callback) {
    var fetchOptions = {
      artist: artist,
      title: title,
      results: 1,
      bucket  : "audio_summary"
    };

    echoNest.fetch('song/search', fetchOptions).success(function(data) {
      if (data.response.songs[0]) {
        $.getJSON(data.response.songs[0].audio_summary.analysis_url)
          .done(callback)
          .fail(function(error) {
            helpers.reportError('Error fetching analyis data for a track', error);
            callback(false);
          });

      } else {
        helpers.reportError('Segment data can\'t be found for ' + title + '"');
        callback(false);
      }
    }).fail(function(error) {
      helpers.reportError('Looking up the song "' + title + '" didn\'t go so well', error);
      callback(false);
    });
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
       getAnalysisForSongSearch(artist, trackName, function(data) {
        if (data) {
          trackSegments.push(data.segments);
        }
        itemsAnalysed ++;

        if (tracks.length === itemsAnalysed) {
          callback(trackSegments);

          if (trackSegments.length !== tracks.length) {
            helpers.reportError(tracks.length + ' tracks expected, but could only fetch data for ' + trackSegments.length);
          }
        }
      });
    };

    helpers.reportStatus('Starting to fetch each track\'s analysis url from the Echonest…');
    for (i = 0; i < tracks.length; i++) {
      fetchAnalysis(tracks[i]);
    }
  };

  return {
    initialize: initialize,
    fetchAlbumInfo: fetchAlbumInfo,
    fetchAnalysisForTracks: fetchAnalysisForTracks
  };
})();
