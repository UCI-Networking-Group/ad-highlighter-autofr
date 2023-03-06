# Ad Highlighter for AutoFR

Ad Highlighter has been modified to work with [AutoFR](https://github.com/UCI-Networking-Group/AutoFR), using its [perceptual-adblocker](perceptual-adblocker) only.

We add/modified the following:
* Event listeners to get the total ads detected and information like the src url of the iframes. See [content.js](perceptual-adblocker/content.js).
* More AdChoice hashes. See [adchoices_hashes.js](perceptual-adblocker/perceptualLibrary/adchoices_hashes.js).
* Improved method of getting background image position and sizes. See getBackgroundImagePos() from [image_search.js](perceptual-adblocker/perceptualLibrary/image_search.js).

For information about how it works, see [Perceptual-Adblocker's README](perceptual-adblocker/README.md).


