/* ----------------------------------------------------------------------------------
 * Authors: Grant Storey & Dillon Reisman
 * Written: Dec '16
 * Last Updated: 3/7/17
 * Description: Content script that runs in iframes, determines whether they
 * contain an adchoices icon, and if so covers them with a red box that says
 * "Adchoices identified." Can optionally overlay non ads with "Adchoices not identified."
 * as well for testing purposes.
 * Dependencies: jquery, perceptual_background.js, image_search.js, utils.js.
 * ----------------------------------------------------------------------------------
 */

// The perceptual adblocker logic.

// stores repeated check interval id to allow it to be canceled
var intervalID;
var intervalIDTop;


// This response is triggered by the background script.
// If the background script found adchoices, then response.element
// will have a stringified version of the dom element that triggered it.
var handleBkgdResponse = function(response) {
    if (typeof response === 'undefined'){
        return true;
    }
    if ('element' in response) {
        //console.log(response['element']);
        // cover the body, place text "ADCHOICES IDENTIFIED", no local info,
        // not only the deepest container, this is an ad, there is an interval,
        // and the interval's id is intervalID
        if (response.isIFrame !== undefined && !response.isIFrame) {
            let ad_cover_label = "TOP AD IDENTIFIED";
            if (response.searchSrc === "ByURL") {
                ad_cover_label = "WHY AD IDENTIFIED"
            }
            if (response.searchSrc === "ByText") {
                ad_cover_label = "TEXT AD IDENTIFIED"
            }
            if (response.src_url !== undefined && srcUrlToIframeContainer.has(response.src_url)) {
                for (let frame_container of srcUrlToIframeContainer.get(response.src_url)) {
                    try {
                        //console.log("is NOT iframe with src url " + response.src_url);
                        coverContainer($(frame_container), ad_cover_label, "", false,
                            true, false, null, response.src_url, response.searchSrc);
                        //console.log("covering ad from the top frame");
                    } catch(error) {
                        console.warn("Could not cover ad from the top");
                    }
                }
            }
        } else {
            if (inIframe()) {
                let ad_cover_label = "AD IDENTIFIED";
                if (response.searchSrc === "ByURL") {
                    ad_cover_label = "WHY AD IDENTIFIED"
                }
                if (response.searchSrc === "ByText") {
                    ad_cover_label = "TEXT AD IDENTIFIED"
                }
                coverContainer($('body'), ad_cover_label, "", false,
                    true, true, intervalID, response.src_url, response.searchSrc);
            }
        }
    }
    else if ('no_element' in response) {
        //console.log('Not adchoices image!');
        // cover the body, place text "NOT ADCHOICES", no local info,
        // not only the deepest container, this is not an ad, there is an
        // interval, and the interval's id is intervalID
        coverContainer($('body'), "NOT AD", "", false,
            false, true, intervalID);
    }
    return true;
};

// return whether this is in an iFrame
// http://stackoverflow.com/questions/326069/how-to-identify-if-a-webpage-is-being-loaded-inside-an-iframe-or-directly-into-t
function inIframe () {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

function try_process_frame_from_top(first_frame) {
    let frames_to_explore = [first_frame];
    while (frames_to_explore.length > 0) {
        let frame = frames_to_explore.pop()
        try {
            frame.contentWindow; // tests if we can access this, this will error out if we cannot access it.
            let frame_body = frame.contentWindow.document.body;
            let frame_document = frame.contentWindow.document;

            if (frame_body && !alreadyCoveredSameType($(frame_body), false)) {
                frame_body.classList.add("AdHighlighterObservedFromTopFrame");
                // uncomment this for debugging to make sure that the container
                // with the adchoices icon has been examined at all.
                //$('body').addClass("CITPObserved");
                runImageSearch($(frame_body), frame_document, handleBkgdResponse);
                runURLSearch($(frame_body), frame_document, handleBkgdResponse);
                runTextSearch($(frame_body), frame_document, handleBkgdResponse);

                for (let subframe of frame.contentWindow.document.getElementsByTagName("iframe")) {
                    frames_to_explore.push(subframe);
                }
            }
        } catch (error) {
            //console.log(error);
        }
        frame.classList.add("AdHighlighterObserved");
    }
}

var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

// if we are in an iframe (which contains the vast majority of adchoices ads)
if (inIframe()) {
  // set an interval to check every 2 seconds. Probably
  // best to do some sort of DOM observer trigger for a production version
  // of this, but the interval works fine for demo purposes.

  intervalID = setInterval(function() {

      // Only consider the iframe if it is larger than 1x1
        if (document.body && !alreadyCoveredSameType($(document.body), false)) {
            document.body.classList.add("AdHighlighterObserved");
            // uncomment this for debugging to make sure that the container
            // with the adchoices icon has been examined at all.
            //$('body').addClass("CITPObserved");
            const body_node = $('body');
            runImageSearch(body_node, document, handleBkgdResponse);
            runURLSearch(body_node, document, handleBkgdResponse);
            runTextSearch(body_node, document, handleBkgdResponse);
            for (let frame of document.getElementsByTagName("iframe")) {
                try_process_frame_from_top(frame);
            }
        }

  }, 2000);
} else {

    // relying on this loop is better because we don't know when the iframe will be done loading
    intervalIDTop = setInterval(function() {
        for (let frame of document.getElementsByTagName("iframe")) {
            try_process_frame_from_top(frame);
        }
    }, 2000);


  /* To set this event off, inject JS into the page that does this:
      var event = new Event('reset_adchoice_counter');
      document.dispatchEvent(event);
  */
  document.addEventListener("reset_adchoice_counter", event => {
    console.log("Received request from site to reset the adchoice counter");
    chrome.runtime.sendMessage({reset_adchoice_counter: true});
  }, true);

  /* To set this event off, inject JS into the page that does this:
      var event = new Event('set_adchoice_total_in_DOM');
      document.dispatchEvent(event);
  */
  // add a DOM element with the value of ad_choices_found
  document.addEventListener("set_adchoice_total_in_DOM", event => {
    console.log("Received request from site to add adchoice total to the DOM");

    chrome.runtime.sendMessage({get_adchoice_total_in_DOM: true},
        function(response) {
            if (typeof response === 'undefined'){
                console.log("Could not retrieve the adchoice total ")
                return true;
            }
            let ad_choices_total = response["ad_choices_total"];
            console.log("Retrieved ad_choices_total " + ad_choices_total);

            let ad_urls = response["src_urls"];
            const el_id = "ad-highlighter-counter";
            let el = document.getElementById(el_id);
            if (el == null) {
                el = document.createElement("div");
                el.setAttribute("id", el_id)
                document.body.appendChild(el);
            }

            // update total
            el.setAttribute("total", ad_choices_total);
            // update urls of logos
            el.innerText = ad_urls;

            // potential ad urls
            let potential_urls = response["potential_ads_urls"];

            const el_id_2 = "ad-highlighter-potential-urls";
            let el2 = document.getElementById(el_id_2);
            if (el2 == null) {
                el2 = document.createElement("div");
                el2.setAttribute("id", el_id_2)
                document.body.appendChild(el2);
            }
            // update total
            el2.setAttribute("total", potential_urls.length);
            // update urls of logos
            el2.innerText = potential_urls;
            return true;
        }
    );

  }, true);

  document.addEventListener("set_dissimilar_hashes_in_DOM", event => {
    console.log("Received request from site to add dissimilar hashes to the DOM");

    chrome.runtime.sendMessage({get_dissimilar_hashes_in_DOM: true},
        function(response) {
            if (typeof response === 'undefined'){
                console.log("Could not retrieve the dissimilar hashes ")
                return true;
            }
            let hashes = response["hashes"];
            const el_class = "ad-highlighter-hashes";
            for (let src_url in hashes) {
                let values = hashes[src_url];
                let hex = values["hex"]
                let sim = values["sim"]
                let el = document.createElement("div");
                el.setAttribute("class", el_class);
                el.setAttribute("src_url", src_url);
                el.setAttribute("hex", hex);
                el.setAttribute("sim", sim);
                document.body.appendChild(el);
            }
            return true;
        }
    );

  }, true);

}
