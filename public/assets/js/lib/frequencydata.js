/*global wallPie, _ */
window.frequencyData = (function(){
  var helpers = wallPie.helpers,
      fileQueue = [],
      analyseFiles,
      decodeFile,
      fftAnalize,
      decodeAudio,
      processAudioBuffer,
      config = {
        fftSamples: 1024,
        frequencyMinDb: -80,
        frequencyMaxDb: 0,
      };

  decodeAudio = function(track, arrayBuffer) {
    var deferred = $.Deferred();
    track.context.online = new webkitAudioContext();
    track.context.online.decodeAudioData(arrayBuffer.target.result, deferred.resolve, deferred.reject);
    return deferred;
  };

  /**
   * Gets channel data, runs it through an FFT filter, and pushes
   * the output to stupidOutput (I should rename that var)
   *
   * @param  {AudioProcessingEvent} e
   */
  processAudioBuffer = function(AudioProcessingEvent, track) {
    if (!track.fftData) {
      track.fftData = [];
    }

    var data = new Uint8Array(config.fftSamples);
    track.fft.getByteFrequencyData(data);


    // Normalising the value
    data = _.map(data, function(value) {
      return value / 255;
    });

    // Throwing away stuff which isn't that pretty
    data = data.slice(0, data.length/2);

    track.fftData.push(data.reverse());
  };

  fftAnalize = function(track, deferred) {
    var context = track.context.offline,
        fft,
        processor;

    console.log("analysing " + track.name);

    // Create an FFT analyser in the global scope,
    // and set the samples plus some data which affects the end result
    fft = track.fft = context.createAnalyser();
    fft.fftSize = config.fftSamples;
    fft.minDecibels = config.frequencyMinDb;
    fft.maxDecibels = config.frequencyMaxDb;

    processor = context.createScriptProcessor(config.fftSamples,1, 1);

    // Connect ALL the things in the right order
    context.source.connect(fft);
    fft.connect(processor);
    processor.connect(context.destination);

    // Every time we process an audio sample, run it through processAudio
    processor.onaudioprocess = function(AudioProcessingEvent) {
      processAudioBuffer(AudioProcessingEvent, track);
    };
    context.source.start(0); // start playing
    context.startRendering(); // Start rendering in the offlineAudioContext
    context.oncomplete = deferred.resolve;
  };

  decodeFile = function(fileData) {
    var deferred = $.Deferred(),
        track = {
          context: {},
          name: fileData.name,
          size: fileData.size,
          file: fileData
        },
        reader;

    if (fileData.type.indexOf('audio/') === 0) {
      fileQueue.push(track);
      reader = new FileReader();
      reader.onload = function(arrayBuffer) {
        decodeAudio(track, arrayBuffer)
          .done(function(decodedBuffer) {
            var length = decodedBuffer.length,
                samplerate = track.context.online.sampleRate;

            // does this work?
            delete(track.context.online);

            track.context.offline = new webkitOfflineAudioContext(1, length, samplerate);
            track.buffer = decodedBuffer;
            // Add the buffer to the file's audiocontext
            track.context.offline.source = track.context.offline.createBufferSource();
            track.context.offline.source.buffer = decodedBuffer;
            fftAnalize(track, deferred);
          })
          .fail(deferred.reject);
        };
      reader.readAsArrayBuffer(track.file);
    } else {
      deferred.reject('File type not correct');
    }

    return deferred;
  };

  analyseFiles = function(files, callback) {
    var queue = [];
    for (var i = 0, f; (f = files[i]); i++) {
      queue.push(decodeFile(f));
    }

    return $.whenAll(queue).done(function() {
      callback(_.map(fileQueue, function(file) {
        return file.fftData;
      }));
    });
  };

  return {
    analyseFiles: analyseFiles
  };
})();
