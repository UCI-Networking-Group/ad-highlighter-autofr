/* ----------------------------------------------------------------------------------
 * Authors: Grant Storey & Dillon Reisman
 * Written: 12/28/16
 * Last Updated: 3/5/17
 * Description: This provides helper functions for image searching using
 * fuzzy hashing.
 * Dependencies: jquery, perceptual_background.js
 * ----------------------------------------------------------------------------------
 */

const srcUrlToIframeContainer = new Map();
const urls_to_match = [
    "adssettings.google.com/whythisad",
    "https://www.outbrain.com/what-is/",
    "optout.aboutads.info"
];
const text_only_ads_to_match = [
    "Ad",
    "ad",
    "Advertisement",
    "advertisement",
    "ADVERTISEMENT",
    "PR",
    "广告",
    "Sponsored Content",
    "SPONSORED CONTENT",
];

// this function hardcodes the styles of oldElement onto newElement;
function hardcodeStyles(oldElement, newElement) {
  var computedStyle = window.getComputedStyle(oldElement, null);
  for (prop in computedStyle) {
    newElement.style[prop] = computedStyle[prop];
  }
}

// recursively apply the map function to the children
// of oldElement and its clone newElement
function recursiveMap(oldElement, newElement, mapFunction) {
  mapFunction(oldElement, newElement);
  for (var i = 0; i < oldElement.children.length; i++) {
    var oldChild = oldElement.children[i];
    var newChild = newElement.children[i];
    recursiveMap(oldChild, newChild, mapFunction)
  }
}

// create and return a deep copy of element with
// mapFunction (taking the old element and new element)
// applied to each child element.
function deepMap(element, mapFunction) {
  var newEl = element.cloneNode(true);
  recursiveMap(element, newEl, mapFunction);
  return newEl;
}

// given an svg, determine the bounding box that contains all pixels with
// alpha above alphaThreshold. This allows cropping of images with large
// transparency margins.
var contextBoundingBox = function(ctx,alphaThreshold){
    if (alphaThreshold===undefined) alphaThreshold = 15;
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    var w=ctx.canvas.width,h=ctx.canvas.height;
    var data = ctx.getImageData(0,0,w,h).data;
    for (var x=0;x<w;++x){
      for (var y=0;y<h;++y){
        var a = data[(w*y+x)*4+3];
        if (a>alphaThreshold){
          if (x>maxX) maxX=x;
          if (x<minX) minX=x;
          if (y>maxY) maxY=y;
          if (y<minY) minY=y;
        }
      }
    }
    return {x:minX,y:minY,maxX:maxX,maxY:maxY,w:maxX-minX,h:maxY-minY};
}

// given an img and crop dimensions, crop the image and get the dataURL
// associated with it.
//http://stackoverflow.com/questions/34242155/how-to-crop-canvas-todataurl
function cropPlusExport(img,cropX,cropY,cropWidth,cropHeight){
  // create a temporary canvas sized to the cropped size
  var canvas1=document.createElement('canvas');
  var ctx1=canvas1.getContext('2d');
  canvas1.width=cropWidth;
  canvas1.height=cropHeight;
  // use the extended from of drawImage to draw the
  // cropped area to the temp canvas
  ctx1.drawImage(img,cropX,cropY,cropWidth,cropHeight,0,0,cropWidth,cropHeight);
  // return the .toDataURL of the temp canvas
  return(canvas1.toDataURL());
}

function getBackgroundImagePos(element, url) {
  let bgXPos = null;
  let bgYPos = null;
  let backgroundSizeWidth = null;
  let backgroundSizeHeight = null;

  let imgStyle = window.getComputedStyle(element);
  //console.log(imgStyle);
  //console.log(imgStyle.backgroundPositionX);
  //console.log(imgStyle.backgroundPositionY);
  if (imgStyle.backgroundPositionX && imgStyle.backgroundPositionX.length > 0
    && (imgStyle.backgroundPositionX.indexOf("%") === -1 || imgStyle.backgroundPositionX === "0%")) {
    bgXPos = parseInt(imgStyle.backgroundPositionX.replace("px", "").replace("%", ""));
    //console.log("bgXPos " + bgXPos);
    //console.log(element);
  }
  if (imgStyle.backgroundPositionY && imgStyle.backgroundPositionY.length > 0
      && (imgStyle.backgroundPositionY.indexOf("%") === -1 || imgStyle.backgroundPositionY === "0%") ) {
      bgYPos = parseInt(imgStyle.backgroundPositionY.replace("px", "").replace("%", ""));
      //console.log("bgYPos " + bgYPos);
  }
  if (imgStyle.backgroundSize && imgStyle.backgroundSize.length > 0
      && (imgStyle.backgroundSize.indexOf("%") === -1) && imgStyle.backgroundSize.indexOf("auto") === -1) {
      //console.log(imgStyle.backgroundSize);
      let stSplit = imgStyle.backgroundSize.split(" ");
      if (stSplit.length === 2) {
        backgroundSizeWidth = stSplit[0].replace("px", "");
        backgroundSizeHeight = stSplit[1].replace("px", "")
      }
  }


  return [bgXPos, bgYPos, backgroundSizeWidth, backgroundSizeHeight];
}

// run an image search on all images (in the src of img tags, in the background
// of divs, links, and spans, and in svgs) found in container, and if any
// matches are found run the result function.
function runImageSearch(container, container_document, resultFunction) {
  const container_element = container[0];

  // Case 1: adchoices icon is image
  container.find('img').each(function( index, element) {
      element.classList.add("AdHighlighterConsidered");
      const src_url = $(element)[0].src;
      if ($(element)[0].width > 1 || $(element)[0].height > 1) {
        if (src_url) {
            if (!srcUrlToIframeContainer.has(src_url)) {
              srcUrlToIframeContainer.set(src_url, []);
            }
            srcUrlToIframeContainer.get(src_url).push(container_element);
            //console.log("found image " + src_url);
            chrome.runtime.sendMessage({
              data: [src_url, $(element).prop('outerHTML')],
              isIFrame: inIframe(),
              originalWidth: element.width || element.offsetWidth,
              originalHeight: element.height || element.offsetHeight,
                searchSrc: "img",
              }, resultFunction);
        }
      } else {
          //console.log("image too small " + src_url);
      }
  });

  // Case 2: adchoices icon is a div background
  // may need to add more elements to this list as advertisers get
  // adversarial.
  container.find('div,a,span').each(function(index, element) {
      //element.classList.add("AdHighlighterConsidered");
      var bg = $(element).css('background-image');
      bg = bg.replace('url(','').replace(')','').replace(/\"/gi, "");

      if (bg && bg !== 'none') {

          if (!srcUrlToIframeContainer.has(bg)) {
            srcUrlToIframeContainer.set(bg, []);
          }
          srcUrlToIframeContainer.get(bg).push(container_element);

          let bgXPos = null;
          let bgYPos = null;
          let backgroundSizeWidth = null;
          let backgroundSizeHeight = null;

          if(bg.indexOf("http") !== -1 || bg.indexOf("adchoice") !== -1 || bg.startsWith("data:")) {

            let bgPos = getBackgroundImagePos(element, bg);
            bgXPos = bgPos[0];
            bgYPos = bgPos[1];
            backgroundSizeWidth = bgPos[2];
            backgroundSizeHeight = bgPos[3];
            //console.log({bg:bg, originalWidth: element.width || element.offsetWidth,
            //  originalHeight: element.height || element.offsetHeight,
            //  bgXPos: bgXPos, bgYPos: bgYPos, backgroundSizeWidth:backgroundSizeWidth, backgroundSizeHeight:backgroundSizeHeight});
          }

          chrome.runtime.sendMessage(
            {data: [bg, $(element).prop('outerHTML'), "bg"],
             isIFrame: inIframe(),
             searchSrc: "bg",
             originalWidth: element.width || element.offsetWidth,
             originalHeight: element.height || element.offsetHeight,
             bgXPos: bgXPos, bgYPos: bgYPos,
             backgroundSizeWidth:backgroundSizeWidth, backgroundSizeHeight:backgroundSizeHeight
             }, resultFunction);
      }
  });

  // Case 3; adchoices icon is an <svg> element
  container.find('svg').each(function(index, element) {

      // if for some reason the exact styles are needed, use
      // this (el_2) instead of "element" below.
      // example use case would be if an advertiser drew a large square
      // over the adchoices icon but then hid the square using a stylesheet
      // in another part of the code; in the current configuration this
      // style would not be carried over to the background script's
      // analysis, but by using deepMap they would.
      //var el_2 = deepMap(element, hardcodeStyles);

      element.classList.add("AdHighlighterConsidered");
      var svg_html = $(element).prop('outerHTML');


      // Wrap svg in new <svg><foreignObject> element
      var wrapper_open = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200">' +
                         '<foreignObject width="100%" height="100%">';
      var wrapper_close = '</foreignObject></svg>';
      var data_string = wrapper_open + svg_html + wrapper_close;

      var img = new Image();
      img.crossOrigin="CITPymous";

      var url = 'data:image/svg+xml;charset=utf8, ' + encodeURIComponent(data_string);


      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var margin = 2;
      img.onload = function () {
          ctx.drawImage(img,0,0);
          var crop = contextBoundingBox(ctx)
          var dataURL = cropPlusExport(img, crop.x-margin, crop.y-margin, crop.w+(2*margin), crop.h+(2*margin));

          if (!srcUrlToIframeContainer.has(dataURL)) {
            srcUrlToIframeContainer.set(dataURL, []);
          }
          srcUrlToIframeContainer.get(dataURL).push(container_element);

          chrome.runtime.sendMessage({data: [dataURL, svg_html], isIFrame: inIframe(), searchSrc: "svg"},
                                     resultFunction);

      }
      img.src = url;
  });
}

// run a search for a links with href that has suffix
function runURLSearch(container, container_document, resultFunction) {
    const container_element = container[0];
    // Find a links
    container.find('a').each(function(index, element) {
      var href = $(element)[0].href;

      if (href && !element.classList.contains("AdHighlighterConsidered")) {
          element.classList.add("AdHighlighterConsidered");

          if (!srcUrlToIframeContainer.has(href)) {
            srcUrlToIframeContainer.set(href, []);
          }
          srcUrlToIframeContainer.get(href).push(container_element);
          let match = "";
          for (let i = 0; i < urls_to_match.length; i++) {
              let url_tmp = urls_to_match[i];
              if (href.indexOf(url_tmp) > -1) {
                  match = url_tmp;
                  break;
              }
          }

          if (match !== "") {
              //console.log("Found AD by matching url " + match);
              resultFunction({
                  element: element,
                  isIFrame: inIframe(),
                  src_url: href,
                  searchSrc: "ByURL"
              });
          } else {
              resultFunction({no_element: "Inside!"});
          }
      }
  });
}

// run a search for a links with href that has suffix
function runTextSearch(container, container_document, resultFunction) {
    const container_element = container[0];

    for (let i = 0; i < text_only_ads_to_match.length; i++) {
        let ad_label = text_only_ads_to_match[i];
        let xpath_query = './/*[text()="' + ad_label + '"]';
        let found_elements = container_document.evaluate(xpath_query,
            container_element,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null);
        if(found_elements.snapshotLength > 0) {
            for ( let j = 0 ; j < found_elements.snapshotLength; j++){
                let el = found_elements.snapshotItem(j);
                let key = xpath_query + j;
                if (!srcUrlToIframeContainer.has(key)) {
                    srcUrlToIframeContainer.set(key, []);
                }
                srcUrlToIframeContainer.get(key).push(container_element);
                resultFunction({
                    element: el,
                    isIFrame: inIframe(),
                    src_url: key,
                    searchSrc: "ByText"
                });
            }
        }
    }
}
