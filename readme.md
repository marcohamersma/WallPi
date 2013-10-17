# Wallπ
![](https://dl.dropbox.com/u/4905073/Wall%CF%80/examples.png)

## About the Hack
WallPπ is an application that transforms the music from your favourite albums into something you can put on your wall. The amount of activity within a frequency is reflected in the density of the color. The colour used to draw the circle is extracted from the cover art.

The current version does _not_ use actual frequency data, but it uses pitch data by segment, supplied by [The Echonest API](http://developer.echonest.com/docs/v4/track.html). I'm working on a new version of Wallπ at the moment that uses actual frequenct data, but I don't have an ETA for that yet.

## How to run
There is a server component which is used to proxy remote assets (to prevent cross-domain issues) and serve the html and assets. This component is written in Node. You can use `npm install` to install the neccesary dependencies. After all the dependencies are installed, type `bin/server` to run. It's then available at `localhost:9100`. Open index.html in your favourite text editor for instructions on how to load an album.

### How to get the actual image
After the image has finished drawing/loading, your browser might crash a lot, the only way to export the image that I found to _not_ crash the browser is by copying the image and pasting it in Photoshop or a similar application. For even bigger sizes, this might not work. I've found that Safari allows you to right click the image and save it, something Chrome doesn't do for base64 encoded images.

## Configuration
There are a number of configuration options you might want to set to experiment with to get the desired result:

```javascript
// API keys for the two services that we're using for getting our data
echonest_key          : '',
lastfm_key            : '',
// used to multiply/divide certain values:
// - scaling the canvas down after rendering (for preview purposes)
// - scaling up font and whitespace size as it appears in the preview
scaleFactor           : 8,
// Reduces the amount of data with this factor
slimFactor            : 1,
// Space in px between the edge of the canvas/paper & circle
whitespace            : 30,
// space in px on the inside, makes for interesting effects
innerDiameter         : 0,
// Distance of the text from the circle
textDistance          : 30,
// Speaks for itself, I'm using Neutra locally.
font                  : 'Helvetica Neue',
fontSizeTop           : 50,
fontSizeBottom        : 25,
// Amount of degrees (within 360) that we will rotate between tracks
trackSeparatorDegrees : 30,
// The color you want to draw the wallπ in. You probably want to use `wallPi.extractCoverColor` for this. format is [r,b,g]
color                 : [],
textColor             : '#464c3e'
```

These options can be passed to `pitchData.fetchAlbumInfo()` as seen in [index.html](https://github.com/marcohamersma/WallPi/blob/master/public/index.html).

## Naming convention
It's Wallπ when possible, wallPi otherwise.

## Todos
-  Overlay the cover art in a fancy way?
-  Use actual frequency data
