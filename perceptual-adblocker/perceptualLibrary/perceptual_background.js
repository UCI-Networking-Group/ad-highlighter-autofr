/* ----------------------------------------------------------------------------------
 * Author: Grant Storey & Dillon Reisman
 * Written: Dec '16
 * Last Updated: 3/7/17
 * Description: Background calculations for fuzzy hashing of potential
 * adchoices icons and link redirect calculation.
 * Dependencies: adchoices_hashes.js, hash_encoding.js
 * ----------------------------------------------------------------------------------
 */

var VERBOSE = false;

// If USE_OCR, fallback to OCR if an adchoices icon is not found by
// perceptual hashing.
// WARNING: Slow.
var USE_OCR = false;

// keep track of URLS that are potential ads
var TRACK_POTENTIAL_AD_URLS = true;

// Keep track of unmatched hashes
var TRACK_DISSIMILAR_HASHES = false;

// keep track of global count of ad chocies identified
var ad_choices_found = 0;
// keep track of urls that were associated to ad covers for the icons/images we matched with
const adUrls = new Set()
const potentialAdUrls = new Set()


if (USE_OCR) {
    /*
    // Initialize Tesseract OCR every ten seconds.
    // NOTE: We refresh the object because after some time
    // the memory of the Tesseract worker becomes corrupted.
    window.Tesseract = Tesseract.create({
        workerPath: chrome.extension.getURL('externalCode/tesseract_worker.js'),
        langPath: chrome.extension.getURL('externalCode/'),
        corePath: chrome.extension.getURL('externalCode/tesseract_index.js')
    });
    window.setInterval(function(){
        window.Tesseract.terminate();
        window.Tesseract = Tesseract.create({
            workerPath: chrome.extension.getURL('externalCode/tesseract_worker.js'),
            langPath: chrome.extension.getURL('externalCode/'),
            corePath: chrome.extension.getURL('externalCode/tesseract_index.js')
        });
    }, 10000);

    */
}
// Image hash based on average pixel value, adapted from
// perceptual hashing algorithm found at
// https://github.com/naptha/phash.js/tree/master
var aHash = function(img) {
    var width = 25,
    height = 25,
    hash_padding = 3; // Pad resulting hash up to proper hash length

    var canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d');

    canvas.width = width;
    canvas.height = height;

    if (img.bgXPos != null && img.bgYPos != null &&
        img.originalWidth > 1 && img.originalHeight > 1) {

        let srcWidth = img.originalWidth;
        let srcHeight = img.originalHeight;

        if (img.backgroundSizeWidth && img.backgroundSizeWidth != img.naturalWidth) {
            srcWidth = parseInt((img.originalWidth*img.naturalWidth)/img.backgroundSizeWidth)
        }
        if (img.backgroundSizeHeight && img.backgroundSizeHeight != img.naturalHeight) {
            srcHeight= parseInt((img.originalHeight*img.naturalHeight)/img.backgroundSizeHeight)
        }
        ctx.drawImage(img, img.bgXPos, img.bgYPos, srcWidth, srcHeight,
            0, 0, width, height);
        //console.log("Found sprite");
        //console.log(img);
    } else {
        ctx.drawImage(img, 0, 0, width, height);
    }

    var im = ctx.getImageData(0, 0, width, height);
    var num_channels = 4;
    var vals = new Float64Array(width * height);

    // Convert image to grayscale
    for(var i = 0; i < width; i++){
        for(var j = 0; j < height; j++){
            var base = num_channels * (width * j + i);
            if (im.data[base+3]  === 0) {
                vals[width * j + i] = 255;
                continue
            }
            vals[width * j + i] = 0.2126 * im.data[base] +
                0.7152 * im.data[base + 1] +
                0.0722 * im.data[base + 2];
        }
    }

    // Find average pixel value,
    var pixel_sum = 0;
    for (var i = 0; i < vals.length; i++) {
        pixel_sum += vals[i];
    }
    var pixel_avg = pixel_sum / vals.length;

    var hash = '';

    // Add padding to start of hash:
    for (var i = 0; i < hash_padding; i++) {
        hash += 0;
    }

    for (var i = 0; i < width; i++) {
        for (var j = 0; j < height; j++) {
            var pixel = vals[width * j + i];
            hash += pixel < pixel_avg ? 1 : 0;
        }
    }
    if (VERBOSE) {
      console.log(hash);
    }
    return hash;
};

// From https://gist.github.com/andrei-m/982927
const levenshtein = (a, b) => {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let tmp, i, j, prev, val
  // swap to save some memory O(min(a,b)) instead of O(a)
  if (a.length > b.length) {
    tmp = a
    a = b
    b = tmp
  }

  row = Array(a.length + 1)
  // init the row
  for (i = 0; i <= a.length; i++) {
    row[i] = i
  }

  // fill in the rest
  for (i = 1; i <= b.length; i++) {
    prev = i
    for (j = 1; j <= a.length; j++) {
      if (b[i-1] === a[j-1]) {
        val = row[j-1] // match
      } else {
        val = Math.min(row[j-1] + 1, // substitution
              Math.min(prev + 1,     // insertion
                       row[j] + 1))  // deletion
      }
      row[j - 1] = prev
      prev = val
    }
    row[a.length] = prev
  }
  return row[a.length]
}

var distance = function(a, b) {
    var dist = 0;
    for(var i = 0; i < a.length; i++)
        if(a[i] != b[i]) dist++;
    return dist;
}

// Cache containing elements already identified as adchoices.
var adchoices_cache = {};
var src_to_hex_hash = {};

// Receives a single (URL, string_of_dom_element) pair from
// the content script and determines whether the image is an
// adchoices icon.
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {

        if ("data" in request) {

            if (VERBOSE) {
                console.log(request['data']);
            }
            let given_url = request['data'][0];
            if (!given_url.startsWith("http") && !given_url.startsWith("data:") && !given_url.startsWith("blob:")) {
                //console.log("Skipping " + request['data'][0]);
                return true;
            }

            // Check to see if element is already in adchoices_cache.
            if (request['data'][1] in adchoices_cache) {
                if (adchoices_cache[request['data'][1]]) {
                    if (VERBOSE) {
                        console.log('Using cache (adchoice found) ', request['data'][1]);
                    }

                    sendResponse({
                        element: request['data'][1],
                        isIFrame:request['isIFrame'],
                        src_url: request['data'][0],
                        searchSrc: request["searchSrc"]});
                    return;
                } else {
                    if (VERBOSE) {
                        console.log("Using cache (adchoice not found) : ", request['data'][1]);
                    }
                    sendResponse({no_element: "Inside!"});
                    return;
                }
            }

            var t0 = performance.now();
            var SIM_THRESHOLD = 0.92;
            var OCR_DIST_THRESHOLD = 4;
            var OCR_LEN_MIN_THRESHOLD = 5;
            var OCR_LEN_MAX_THRESHOLD = 17;
            var img = new Image();
            img.crossOrigin = 'CITPymous';
            img.element = request['data'][1];
            //console.log(img.element);
            img.adchoice_samples = adchoices_hashes;
            img.ad_strings = ad_strings;
            img.t0 = t0;
            img.onload = function() {
                // If image is 1x1 pixel, skip.
                if (this.width <= 1 || this.height <= 1) {
                    adchoices_cache[this.element] = false;
                    this.callback({no_element: "Inside!"});
                    return true;
                }

                // Hash the image!
                var hash = aHash(this);

                // Compare hash to set of example adchoice icon hashes
                var found_element = false;
                // keep track of max score for this image
                var max_sim_score = 0;
                var max_adchoice_sample = null;
                var max_adchoice_sample_binary = null
                for (var j = 0; j < this.adchoice_samples.length; j++) {
                    //console.log(hexToBinary(this.adchoice_samples[j]).result);
                    //console.log(hash);
                    var adchoice_sample_binary = hexToBinary(this.adchoice_samples[j]).result;
                    var sim_score = 1 - distance(hash, adchoice_sample_binary) / 628.0;
                    //console.log(sim_score + " for " + this.src);
                    if (VERBOSE) {
                        console.log("Sim score: " + sim_score);
                    }
                    if (sim_score > max_sim_score) {
                        max_sim_score = sim_score;
                        max_adchoice_sample = this.adchoice_samples[j];
                        max_adchoice_sample_binary = adchoice_sample_binary;
                    }

                    if (sim_score > SIM_THRESHOLD) {
                        found_element = true;
                        if (VERBOSE) {
                          console.log("Found AD by comparing icon hash.");
                          console.log("Original " + this.adchoice_samples[j]);
                          console.log('GOT IT!');
                          console.log(hash);
                          console.log(this.element);
                          console.log(sim_score);
                          console.log("performance : " + (performance.now() - img.t0));
                        }
                        let hex_hash = binaryToHex(hash);
                        if (VERBOSE) {
                            console.log("Found AD by comparing icon hash. " + given_url +
                                " with BINARY hash " + hash + ", sim score: " + sim_score + ", matched with " + adchoice_sample_binary);
                            console.log("Found AD by comparing icon hash. " + given_url +
                                " with HEX hash " + hex_hash.result + ", sim score: " + sim_score + ", matched with " + this.adchoice_samples[j]);
                        }

                        adchoices_cache[this.element] = true;

                        this.callback({element: this.element, container:this.isIFrame, src_url: this.src, searchSrc: this.searchSrc});
                        return;
                    }
                }
                if (!found_element) {
                    potentialAdUrls.add(this.src)
                    // TODO: comment this out to find the new hex hash to add to adhoices_hash.js
                    //console.log(this.src + ", binary hash: " + hash + ", " + " hex hash: " + binaryToHex(hash).result + ", is_valid: " + binaryToHex(hash).valid);
                    if (TRACK_DISSIMILAR_HASHES && src_to_hex_hash[given_url] === undefined) {
                        let hex_hash = binaryToHex(hash);
                        if (hex_hash.result !== undefined && hex_hash.valid === true) {
                            //console.log("src: " + given_url + ", BINARY hash: " + hash + ", is_valid: " + hex_hash.valid + ", max sim score: " + max_sim_score + ", matched with hash " + max_adchoice_sample_binary);
                            //console.log("src: " + given_url + ", HEX hash: " + hex_hash.result + ", is_valid: " + hex_hash.valid + ", max sim score: " + max_sim_score + ", matched with hash " + max_adchoice_sample);
                            src_to_hex_hash[given_url] = {hex: hex_hash.result, sim: max_sim_score};
                        }
                    }
                }

                if (USE_OCR) {
                    /*
                    // If no adchoices icon was identified based on hash,
                    // attempt to find string that might indicate that image
                    // is an ad using OCR
                    var callback = this.callback;
                    var ad_strings_for_ocr = this.ad_strings;
                    var img_element = this.element;
                    var canvas = document.createElement('canvas');
                    var ctx = canvas.getContext('2d');
                    canvas.width = this.width*4;
                    canvas.height = this.height*4;
                    ctx.drawImage(this, 0, 0, canvas.width, canvas.height);
                    var expanded = ctx.getImageData(0,0, canvas.width, canvas.height);

                    window.Tesseract.recognize(expanded)
                     //.progress(function(progress) {console.log(progress);})
                     .then(function (result) {
                        console.log('OCRd image');
                        //console.log(result.text);
                        if (result.text.length <= OCR_LEN_MIN_THRESHOLD ||
                            result.text.length >= OCR_LEN_MAX_THRESHOLD) {
                            //if (VERBOSE) {
                            console.log('No Adchoices text found due to text length.');
                            console.log("performance : " + (performance.now() - img.t0));
                            //}
                            adchoices_cache[img_element] = false;
                            callback({no_element: "Inside!"});
                            return true;
                        }

                        // Check OCR'd text against possible 'adchoices' string.
                        // If levenshtein distance is below threshold, or 'adchoices'
                        // string can be found as a substring, then we have positively
                        // identified ad.
                        for (var j = 0; j < ad_strings_for_ocr.length; j++) {
                            var dist = levenshtein(result.text.toLowerCase(), ad_strings_for_ocr[j]);
                            if (VERBOSE) {
                                console.log(img_element);
                                console.log('OCR : ', result);
                                console.log('LD : ', dist);
                            }
                            if (dist <= OCR_DIST_THRESHOLD ||
                                result.text.toLowerCase().search(ad_strings_for_ocr[j]) != -1) {
                                adchoices_cache[img_element] = true;
                                //if (VERBOSE) {
                                console.log("Found Adchoices text.");
                                console.log("performance : " + (performance.now() - img.t0));
                                //}
                                callback({element: img_element, isIFrame:this.isIFrame, src_url: this.src});
                                return true;
                            }
                            adchoices_cache[img_element] = false;
                            if (VERBOSE) {
                                console.log('No Adchoices text found.');
                                console.log("performance : " + (performance.now() - img.t0));
                            }
                            callback({no_element: "Inside!"});
                            return true;
                        }
                     });
                    this.callback({no_element: "Inside!"});
                    return true;
                    */

                } else {
                    if (VERBOSE) {
                        console.log("performance : " + (performance.now() - this.t0));
                    }
                    this.callback({no_element: "Inside!"});
                    adchoices_cache[this.element] = false;
                    return true;
                }
            }
            if (VERBOSE) {
                console.log("src:");
                console.log(given_url);
            }


            img.callback = sendResponse;
            img.src = given_url;
            img.originalWidth = request["originalWidth"];
            img.originalHeight = request["originalHeight"];
            img.bgXPos = request["bgXPos"];
            img.bgYPos = request["bgYPos"];
            img.backgroundSizeWidth = request["backgroundSizeWidth"];
            img.backgroundSizeHeight = request["backgroundSizeHeight"];
            img.isIFrame = request["isIFrame"];
            img.searchsrc = request["searchSrc"];
            return true;
        }
    });


    // Code for determining the end destinations of links

    // make XHR request
    function makeXHR(url, sendResponse) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function (data) {
            if (xhr.readyState == 4) {
                if (xhr.status == 200) {
                    //var s = "Final location of request: " + xhr.responseURL;
                    //console.log(s);
                    sendResponse({finalLinkDestination: xhr.responseURL});
                }
            } else {
                //callback(null);
            }
        }
        xhr.open('GET', url, true);
        xhr.send();
    }

    var urls = [];
    function getUrlsFromLiveRequest(details) {
        urls.push(details.url);
        //console.log(details.url);
        return {cancel: true};
    }

    function removeLiveRequestUrlsListener() {
        chrome.webRequest.onBeforeSendHeaders.removeListener(getUrlsFromLiveRequest);
    }

    // if the href begins with a "/", e.g. "/aboutUs", automatically fill in
    // the start with the proper website.
    function fixhref(href, sender) {
      if (href.length > 1 && href[0] === "/" && href[1] !== "/") {
        var base = sender.url
        //console.log("old: " + href + "; new: " + base + href.substring(1));
        return base + href.substring(1)
      } else {
        return href;
      }
    }

    // handle messages
    chrome.runtime.onMessage.addListener(
        function(request, sender, sendResponse) {
            // Case 1 : you know the element and can get an (obfuscated) href from it. Then the extension can
            // silently make an XHR request in the background as if it had clicked the link and follow redirects.
            // Could do this with many hrefs at the same time potentially too.
            if ("link" in request) {
                var fixedHref = fixhref(request.link, sender);
                makeXHR(fixedHref, sendResponse);
            }

            // Case 2 : If the content script can't even get the obfuscated href, but CAN click the element,
            // then this utility can listen to the collected links. This will work
            // for a single link click, but because it relies on timing to collect the requests
            // that result from a link click, it isn't clear how it can be adapted to clicking multiple
            // links at the same time. (This case currently not setup completely.)
            if ("startURLCollector" in request) {
                setTimeout(removeLiveRequestUrlsListener, 2000);
                chrome.webRequest.onBeforeSendHeaders.addListener(
                    getUrlsFromLiveRequest,
                    {
                        urls: ["<all_urls>"]
                    },
                    ["blocking", "requestHeaders"]);
            }

            // listen to whether an ad was newly covered
            if ("ad_covered" in request) {
                console.log("perceptual-background: a new ad was covered");
                ad_choices_found += 1;
                //console.log(request);
                if ("src_url" in request) {
                    let src_url = request["src_url"];
                    //console.log("perceptual-background: new ad url: " + src_url);
                    if (src_url !== undefined && src_url != null) {
                        adUrls.add(src_url);
                    }
                }
            }

            // reset the counter for adchoice
            if ("reset_adchoice_counter" in request) {
                console.log("Background: resetting adchoice counter");
                ad_choices_found = 0;
                adUrls.clear();
                potentialAdUrls.clear();
            }

            // get the counter for adchoice
            if ("get_adchoice_total_in_DOM" in request) {
                console.log("Background: getting adchoice counter");
                if (sendResponse != null) {
                    //console.log(adUrls);
                    //console.log(potentialAdUrls);
                    sendResponse({ad_choices_total: ad_choices_found, src_urls: Array.from(adUrls).join(";;"), potential_ads_urls: Array.from(potentialAdUrls).join(";;")})
                }
            }

            // get the counter for adchoice
            if ("get_dissimilar_hashes_in_DOM" in request) {
                console.log("Background: getting hashes that are dissimilar");
                if (sendResponse != null) {
                    //console.log(adUrls);
                    //console.log(potentialAdUrls);
                    sendResponse({hashes: src_to_hex_hash})
                }
            }
            return true;
        });
